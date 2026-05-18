import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
  console.error("Uso: node scripts/sanitize-dump.mjs <dump-raw.sql> <dump-sanitized.sql>");
  process.exit(1);
}

const nullableForeignKeysByTable = {
  managers: ["user_id"],
  draft_fines: ["applied_by"],
  draft_transfers: ["registered_by"],
};

const skipTables = new Set(["profiles"]);

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

function sanitizeInsertStatement(statement) {
  const match = statement.match(/^INSERT INTO\s+(?:"public"\."([a-zA-Z0-9_]+)"|public\.([a-zA-Z0-9_]+))\s+\(([\s\S]*?)\)\s+VALUES\s+([\s\S]*);$/);

  if (!match) {
    return statement;
  }

  const [, quotedTableName, unquotedTableName, rawColumns, rawValues] = match;
  const tableName = quotedTableName || unquotedTableName;

  if (skipTables.has(tableName)) {
    return "";
  }

  const columns = rawColumns.split(",").map((column) => column.trim());
  const tuples = splitSqlTuples(rawValues);
  const nullableColumns = nullableForeignKeysByTable[tableName] ?? [];

  const sanitizedTuples = tuples.map((tuple) => {
    const tupleContent = tuple.trim().replace(/^\(/, "").replace(/\)$/, "");
    const values = splitSqlValues(tupleContent);

    if (columns.length !== values.length) {
      return tuple.trim();
    }

    const updatedValues = [...values];

    for (const columnName of nullableColumns) {
      const index = columns.findIndex((column) => normalizeColumnName(column) === columnName);
      if (index >= 0) {
        updatedValues[index] = "NULL";
      }
    }

    return `(${updatedValues.join(", ")})`;
  });

  return `INSERT INTO "public"."${tableName}" (${columns.join(", ")}) VALUES\n\t${sanitizedTuples.join(",\n\t")};`;
}

const rawSql = readFileSync(resolve(inputFile), "utf8");
const sanitizedSql = rawSql
  .split("\n")
  .map((line) => sanitizeInsertStatement(line))
  .join("\n");

writeFileSync(resolve(outputFile), sanitizedSql);

console.log(`Dump sanitizado salvo em: ${resolve(outputFile)}`);
