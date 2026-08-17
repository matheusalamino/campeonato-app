import { describe, it, expect } from "vitest";
import { shouldPersistPlayerIdentity } from "./player-identity";

describe("shouldPersistPlayerIdentity", () => {
  it("grava a identidade quando o CPF ainda nao existe", () => {
    expect(shouldPersistPlayerIdentity(null)).toBe(true);
  });

  it("nao grava quando o jogador ja existe", () => {
    // O CPF sozinho nao autoriza reescrever a identidade de outra pessoa:
    // a inscricao publica e anonima e o CPF nao e segredo.
    expect(shouldPersistPlayerIdentity("d3f1c0de-0000-4000-8000-000000000000")).toBe(false);
  });

  it("trata string vazia como jogador inexistente", () => {
    expect(shouldPersistPlayerIdentity("")).toBe(true);
  });
});
