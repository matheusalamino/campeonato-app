import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const inputFile = process.argv[2];
const dbUrl = process.argv[3];
const outputFile = process.argv[4];

if (!inputFile || !dbUrl || !outputFile) {
  console.error("Uso: node scripts/prepare-local-import.mjs <dump.sql> <db-url> <saida.sql>");
  process.exit(1);
}

const nullableForeignKeysByTable = {
  managers: ["user_id"],
  draft_fines: ["applied_by"],
  draft_transfers: ["registered_by"],
};

const skipTables = new Set(["profiles"]);

function runPsql(sql) {
  const result = spawnSync(
    "psql",
    [dbUrl, "-At", "-F", "\t", "-c", sql],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

function normalizeColumnName(columnName) {
  return columnName.trim().replace(/^"/, "").replace(/"$/, "");
}

function splitSqlValues(input) {
  const values = [];
  let current = "";
  let inString = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === "'") {
      current += char;

      if (inString && next === "'") {
        current += next;
        i += 1;
        continue;
      }

      inString = !inString;
      continue;
    }

    if (char === "," && !inString) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    values.push(current.trim());
  }

  return values;
}

function splitSqlTuples(input) {
  const tuples = [];
  let current = "";
  let inString = false;
  let depth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    current += char;

    if (char === "'") {
      if (inString && next === "'") {
        current += next;
        i += 1;
        continue;
      }

      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;

      if (depth === 0) {
        tuples.push(current.trim());
        current = "";

        while (
          input[i + 1] === "," ||
          input[i + 1] === "\n" ||
          input[i + 1] === "\r" ||
          input[i + 1] === "\t" ||
          input[i + 1] === " "
        ) {
          i += 1;
        }
      }
    }
  }

  return tuples;
}

function loadSchemaColumns() {
  const rows = runPsql(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `)
    .trim()
    .split("\n")
    .filter(Boolean);

  const schemaColumns = new Map();

  for (const row of rows) {
    const [tableName, columnName] = row.split("\t");
    const current = schemaColumns.get(tableName) ?? [];
    current.push(columnName);
    schemaColumns.set(tableName, current);
  }

  return schemaColumns;
}

function sanitizeInsertStatement(statement, schemaColumns) {
  const match = statement.match(/^INSERT INTO\s+(?:"public"\."([a-zA-Z0-9_]+)"|public\.([a-zA-Z0-9_]+))\s+\(([\s\S]*?)\)\s+VALUES\s+([\s\S]*);$/);

  if (!match) {
    return statement;
  }

  const [, quotedTableName, unquotedTableName, rawColumns, rawValues] = match;
  const tableName = quotedTableName || unquotedTableName;

  if (skipTables.has(tableName)) {
    return "";
  }

  const availableColumns = schemaColumns.get(tableName);

  if (!availableColumns || availableColumns.length === 0) {
    return "";
  }

  const availableColumnSet = new Set(availableColumns);
  const columns = rawColumns.split(",").map((column) => column.trim());
  const keepIndexes = columns
    .map((column, index) => ({ column, index, normalized: normalizeColumnName(column) }))
    .filter(({ normalized }) => availableColumnSet.has(normalized));

  if (keepIndexes.length === 0) {
    return "";
  }

  const keptColumns = keepIndexes.map(({ column }) => column);
  const nullableColumns = nullableForeignKeysByTable[tableName] ?? [];
  const tuples = splitSqlTuples(rawValues);

  const sanitizedTuples = tuples.map((tuple) => {
    const tupleContent = tuple.trim().replace(/^\(/, "").replace(/\)$/, "");
    const values = splitSqlValues(tupleContent);

    if (columns.length !== values.length) {
      return tuple.trim();
    }

    const keptValues = keepIndexes.map(({ index, normalized }) => {
      if (nullableColumns.includes(normalized)) {
        return "NULL";
      }

      return values[index];
    });

    return `(${keptValues.join(", ")})`;
  });

  return `INSERT INTO "public"."${tableName}" (${keptColumns.join(", ")}) VALUES\n\t${sanitizedTuples.join(",\n\t")};`;
}

const schemaColumns = loadSchemaColumns();
const rawSql = readFileSync(resolve(inputFile), "utf8");
const preparedSql = rawSql
  .split("\n")
  .map((line) => sanitizeInsertStatement(line, schemaColumns))
  .join("\n");

writeFileSync(resolve(outputFile), preparedSql);

console.log(`Dump preparado para importacao local: ${resolve(outputFile)}`);
