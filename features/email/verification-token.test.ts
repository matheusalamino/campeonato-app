import { describe, it, expect } from "vitest";
import {
  createVerificationToken,
  hashToken,
  verificationTokenFrom,
  VERIFICATION_TOKEN_BYTES,
  VERIFICATION_TOKEN_LENGTH,
} from "./verification-token";

describe("createVerificationToken", () => {
  it("nao repete o valor em claro", () => {
    const a = createVerificationToken();
    const b = createVerificationToken();
    expect(a.plain).not.toBe(b.plain);
    expect(a.hash).not.toBe(b.hash);
  });

  it("sorteia os 32 BYTES declarados, e nao so 'algo diferente'", () => {
    // ── A ASSERTIVA QUE SE PAGA, E O MOTIVO ──
    //
    // A de cima -- "dois tokens diferem" -- NAO prende o tamanho do sorteio:
    // MEDIDO, com `randomBytes(4)` no lugar de `randomBytes(32)` ela continua
    // verde, porque dois valores de 4 bytes quase sempre diferem. E 4 bytes sao
    // 32 bits: uma busca por forca bruta viavel de um notebook, contra um
    // endereco de e-mail que o token existe para provar.
    //
    // Por isso o comprimento e afirmado DUAS vezes, e nao uma: pelo numero de
    // caracteres e pela constante. A primeira pega quem trocar o argumento do
    // `randomBytes`; a segunda pega quem trocar a constante junto, achando que
    // esta consertando o teste.
    const { plain } = createVerificationToken();

    expect(plain).toHaveLength(64);
    expect(plain).toHaveLength(VERIFICATION_TOKEN_LENGTH);
    expect(VERIFICATION_TOKEN_BYTES).toBe(32);
    // Hex gasta dois caracteres por byte -- a relacao entre as duas constantes,
    // afirmada, para uma delas nao andar sozinha.
    expect(VERIFICATION_TOKEN_LENGTH).toBe(VERIFICATION_TOKEN_BYTES * 2);
    // E o valor tem de ser hex de verdade, e nao 64 caracteres de qualquer
    // coisa: `randomBytes(32).toString("base64")` tem 44 caracteres e cairia na
    // assertiva de comprimento, mas `toString("latin1")` tem 32 e passaria a
    // ter 64 com um `.repeat(2)` -- absurdo, e mesmo assim so esta linha o pega.
    expect(plain).toMatch(/^[0-9a-f]{64}$/);
  });

  it("o valor em claro atravessa a URL sem escape", () => {
    // Ele viaja como SEGMENTO de caminho (`/verify-email/<token>`). base64
    // comum traria `+`, `/` e `=`, e os tres mudam de significado ali.
    const { plain } = createVerificationToken();

    expect(plain).not.toMatch(/[/+=]/);
    expect(encodeURIComponent(plain)).toBe(plain);
  });

  it("o hash NAO carrega o valor em claro", () => {
    // O banco guarda so o hash. Se o claro estivesse contido nele, quem lesse a
    // tabela -- por dump, por backup, por um SELECT de suporte -- montaria um
    // link valido a partir do que ve, que e exatamente o que a migration
    // 20260823020000 diz que nao acontece.
    const { plain, hash } = createVerificationToken();

    expect(hash).not.toContain(plain);
    expect(hash).not.toBe(plain);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("o hash gravado e o hash do claro que saiu", () => {
    // A junta entre os dois campos do par. Devolver `hash` de outro sorteio --
    // ou o claro no lugar do hash -- passa por todas as assertivas de FORMA
    // acima, e produz um link que nunca casa com a linha dele.
    const { plain, hash } = createVerificationToken();
    expect(hash).toBe(hashToken(plain));
  });
});

describe("hashToken", () => {
  it("da sempre o mesmo hash para o mesmo valor", () => {
    // Sem isto, a volta do link nao acha a linha: o hash gravado na emissao
    // seria diferente do calculado na verificacao.
    const { plain } = createVerificationToken();
    expect(hashToken(plain)).toBe(hashToken(plain));
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("valores diferentes dao hashes diferentes", () => {
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("e o sha256 conhecido, e nao 'algum hash de 64 hex'", () => {
    // Vetor publico do sha256 de "abc". Sem ele, trocar o algoritmo por outro
    // de 64 hex de saida passaria em todas as assertivas de forma -- e o hash
    // de toda linha ja gravada deixaria de casar, calado.
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("verificationTokenFrom", () => {
  const VALIDO = "a".repeat(64);

  it("aceita o token com a forma que este codigo emite", () => {
    expect(verificationTokenFrom(VALIDO)).toBe(VALIDO);
    expect(verificationTokenFrom(createVerificationToken().plain)).not.toBeNull();
    // Espaco em volta acontece de verdade: cliente de e-mail quebra linha e
    // quem cola o link a mao traz o resto junto.
    expect(verificationTokenFrom(`  ${VALIDO}\n`)).toBe(VALIDO);
  });

  it("recusa o que nao tem a forma de token", () => {
    // A vazia e a que importa: sem esta guarda, um link truncado viraria
    // consulta com o hash da string vazia. Nenhuma linha guarda esse hash hoje,
    // mas depender disso e depender de sorte -- a forma e conferida ANTES de
    // qualquer hash existir.
    expect(verificationTokenFrom("")).toBeNull();
    expect(verificationTokenFrom("   ")).toBeNull();
    expect(verificationTokenFrom(null)).toBeNull();
    expect(verificationTokenFrom(undefined)).toBeNull();
    // Curto e comprido demais, os dois lados do comprimento.
    expect(verificationTokenFrom("a".repeat(63))).toBeNull();
    expect(verificationTokenFrom("a".repeat(65))).toBeNull();
    // Fora do alfabeto hex.
    expect(verificationTokenFrom("z".repeat(64))).toBeNull();
    expect(verificationTokenFrom(`${"a".repeat(63)}-`)).toBeNull();
    // Maiuscula: `digest("hex")` do node so produz minuscula, entao um token em
    // maiuscula nunca foi emitido por este codigo -- e comparar sem distinguir
    // caixa alargaria o espaco de busca de graca.
    expect(verificationTokenFrom("A".repeat(64))).toBeNull();
  });
});
