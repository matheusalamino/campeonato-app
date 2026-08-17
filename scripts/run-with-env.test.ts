import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.join(__dirname, "run-with-env.sh");

const COMPLETO = [
  "NEXT_PUBLIC_SUPABASE_URL=https://exemplo.supabase.co",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-de-teste",
  "SUPABASE_SERVICE_ROLE_KEY=service-role-de-teste",
].join("\n");

let root: string;

/** Roda o script no root temporario. `env` como comando expoe o ambiente exportado. */
function run(args: string[], extraEnv: Record<string, string> = {}) {
  return execFileSync("sh", [path.join(root, "scripts", "run-with-env.sh"), ...args], {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function escreveSecrets(ambiente: string, conteudo: string) {
  mkdirSync(path.join(root, ".secrets"), { recursive: true });
  writeFileSync(path.join(root, ".secrets", `${ambiente}.app.env`), `${conteudo}\n`);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "run-with-env-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  copyFileSync(SCRIPT, path.join(root, "scripts", "run-with-env.sh"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("run-with-env.sh", () => {
  it("recusa um ambiente fora da lista", () => {
    escreveSecrets("staging", COMPLETO);
    expect(() => run(["homolog", "env"])).toThrow(/staging/);
  });

  it("erra apontando o .example quando o arquivo nao existe", () => {
    expect(() => run(["staging", "env"])).toThrow(/staging\.app\.env\.example/);
  });

  it("erra citando a variavel que ficou no placeholder", () => {
    escreveSecrets(
      "staging",
      COMPLETO.replace("SUPABASE_SERVICE_ROLE_KEY=service-role-de-teste", "SUPABASE_SERVICE_ROLE_KEY=replace-me"),
    );
    expect(() => run(["staging", "env"])).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("erra quando uma variavel obrigatoria esta ausente", () => {
    escreveSecrets("staging", "NEXT_PUBLIC_SUPABASE_URL=https://exemplo.supabase.co");
    expect(() => run(["staging", "env"])).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("exporta as tres variaveis para o comando filho", () => {
    escreveSecrets("staging", COMPLETO);
    const saida = run(["staging", "env"]);

    expect(saida).toContain("NEXT_PUBLIC_SUPABASE_URL=https://exemplo.supabase.co");
    expect(saida).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-de-teste");
    expect(saida).toContain("SUPABASE_SERVICE_ROLE_KEY=service-role-de-teste");
  });

  it("sobrepoe o que estiver no .env.local do diretorio", () => {
    escreveSecrets("staging", COMPLETO);
    writeFileSync(path.join(root, ".env.local"), "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321\n");
    const saida = run(["staging", "env"]);

    // O script exporta no processo; o Next nao sobrescreve variavel ja presente.
    expect(saida).toContain("NEXT_PUBLIC_SUPABASE_URL=https://exemplo.supabase.co");
    expect(readFileSync(path.join(root, ".env.local"), "utf8")).toContain("127.0.0.1:55321");
  });

  it("aborta em producao sem confirmacao", () => {
    escreveSecrets("production", COMPLETO);
    expect(() => run(["production", "env"])).toThrow();
  });

  it("executa em producao com CONFIRM_PRODUCTION=1", () => {
    escreveSecrets("production", COMPLETO);
    const saida = run(["production", "env"], { CONFIRM_PRODUCTION: "1" });

    expect(saida).toContain("SUPABASE_SERVICE_ROLE_KEY=service-role-de-teste");
  });
});
