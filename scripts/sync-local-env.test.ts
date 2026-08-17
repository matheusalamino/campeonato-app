import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, copyFileSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.join(__dirname, "sync-local-env.sh");

// Saida representativa de `supabase status -o env` (CLI 2.x).
const STATUS_ENV = [
  'ANON_KEY="anon-key-local"',
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  'GRAPHQL_URL="http://127.0.0.1:54321/graphql/v1"',
  'JWT_SECRET="super-secret-jwt-token"',
  'SERVICE_ROLE_KEY="service-role-key-local"',
  'STUDIO_URL="http://127.0.0.1:54323"',
].join("\n");

let root: string;

/** Roda o script em um root isolado, com um `supabase` falso no PATH. */
function runSync(statusEnv: string) {
  const bin = path.join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const fake = path.join(bin, "supabase");
  writeFileSync(fake, `#!/bin/sh\ncat <<'EOF'\n${statusEnv}\nEOF\n`);
  chmodSync(fake, 0o755);

  return execFileSync("sh", [path.join(root, "scripts", "sync-local-env.sh")], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: "utf8",
  });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "sync-local-env-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  copyFileSync(SCRIPT, path.join(root, "scripts", "sync-local-env.sh"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("sync-local-env.sh", () => {
  it("escreve as variaveis publicas do Supabase local", () => {
    runSync(STATUS_ENV);
    const envLocal = readFileSync(path.join(root, ".env.local"), "utf8");

    expect(envLocal).toContain("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321");
    expect(envLocal).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key-local");
    expect(envLocal).toContain(
      "SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    );
  });

  it("escreve a service-role key exigida por createAdminClient", () => {
    runSync(STATUS_ENV);
    const envLocal = readFileSync(path.join(root, ".env.local"), "utf8");

    expect(envLocal).toContain("SUPABASE_SERVICE_ROLE_KEY=service-role-key-local");
  });

  it("falha com mensagem clara quando a service-role key nao esta no status", () => {
    const semServiceRole = STATUS_ENV.split("\n")
      .filter((line) => !line.startsWith("SERVICE_ROLE_KEY="))
      .join("\n");

    expect(() => runSync(semServiceRole)).toThrow(/SERVICE_ROLE_KEY/);
  });
});
