import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANONICAL_POSITIONS,
  POSITION_ALIASES,
  normalizePreferredPosition,
  type CanonicalPosition,
} from "./position";
import { semComentarioSql } from "@/features/testing/sem-comentario";

/** Atalho: so o valor canonico, para as tabelas de caso abaixo. */
const pos = (raw: string | null | undefined) =>
  normalizePreferredPosition(raw).position;

describe("normalizePreferredPosition", () => {
  it("passa os quatro canonicos por identidade", () => {
    for (const canonical of CANONICAL_POSITIONS) {
      expect(pos(canonical)).toBe(canonical);
      expect(normalizePreferredPosition(canonical).kind).toBe("mapped");
    }
  });

  it("o canonico e o codigo, e nao a palavra", () => {
    expect(CANONICAL_POSITIONS).toEqual(["GOL", "ZAG", "MEI", "ATA"]);
  });

  it("a palavra por extenso entra como apelido e sai como codigo", () => {
    // O CSV aceita celula arbitraria, e o dado dos tres ambientes esta 100% em
    // palavra. Se a palavra deixasse de ser apelido, todo import de planilha
    // antiga passaria a recusar linha.
    for (const [palavra, codigo] of [
      ["Goleiro", "GOL"], ["Zagueiro", "ZAG"], ["Meia", "MEI"], ["Atacante", "ATA"],
    ] as const) {
      expect(normalizePreferredPosition(palavra).position).toBe(codigo);
    }
  });

  it("lateral e volante caem em MEI", () => {
    // Decisao do usuario: o campeonato e de futsal, e o corredor e a ala.
    for (const raw of ["Lateral", "lateral", "Volante", "vol", "LAT", "VOL"]) {
      expect(normalizePreferredPosition(raw).position).toBe("MEI");
    }
  });

  it("celula com nome de membro de Object nao vira funcao", () => {
    // `POSITION_ALIASES[key]` alcanca o prototipo: uma celula de planilha com a
    // palavra `constructor` produzia `{ kind: "mapped", position: <function> }`,
    // e a funcao ia para o insert.
    //
    // SO `constructor` sobrevive ao `fold`, e a lista abaixo nao promete mais
    // que isso: `fold` minuscula antes do lookup, entao `toString` chega como
    // `tostring`, `valueOf` como `valueof` e `hasOwnProperty` como
    // `hasownproperty` -- nenhum desses tres existe em Object.prototype, e os
    // tres ja saiam `unrecognized` ANTES do guarda. Ficam como regressao barata
    // caso alguem tire o lowercase do `fold` e reabra a porta para eles.
    for (const veneno of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
      const r = normalizePreferredPosition(veneno);
      expect(r.kind).toBe("unrecognized");
      expect(typeof r.position).not.toBe("function");
    }
  });

  // Vocabulario de futsal. NAO existe em dado real: producao (80) e staging (82)
  // estao 100% canonicos, medido em 2026-08-21. Vinha do seed local, ja alinhado.
  // Fica coberto porque o CSV de import aceita celula arbitraria.
  it("converte o vocabulario de futsal para canonico", () => {
    expect(pos("Fixo")).toBe("ZAG");
    expect(pos("Ala Esquerda")).toBe("MEI");
    expect(pos("Ala Direita")).toBe("MEI");
    expect(pos("Pivo")).toBe("ATA");
    expect(pos("Goleiro")).toBe("GOL");
  });

  // LAT e VOL sao codigos que a CHECK nao aceita, e que a Task 2 do A8 tirou de
  // POSITION_LABELS. Seguem cobertos pela MESMA razao do vocabulario de futsal,
  // e nao por outra: nao existem em dado real (ver ALCANCE em position.ts), e o
  // que os mantem e a defesa de ENTRADA -- o CSV de import aceita celula
  // arbitraria de planilha. Precisam de um canonico de chegada; os quatro
  // canonicos passam por identidade.
  it("os codigos entram, inclusive LAT e VOL que a CHECK recusa", () => {
    expect(pos("GOL")).toBe("GOL");
    expect(pos("ZAG")).toBe("ZAG");
    expect(pos("MEI")).toBe("MEI");
    expect(pos("ATA")).toBe("ATA");
    expect(pos("VOL")).toBe("MEI");
    expect(pos("LAT")).toBe("MEI");
  });

  it("converte as palavras largas que a CHECK nao aceita", () => {
    expect(pos("Volante")).toBe("MEI");
    expect(pos("Lateral")).toBe("MEI");
  });

  // O caso que a CHECK rejeitaria e que a cota contaria errado: um goleiro
  // com espaco sobrando na celula nao casa com igualdade exata em lugar nenhum.
  it("tolera espaco sobrando e caixa trocada", () => {
    expect(pos("  goleiro  ")).toBe("GOL");
    expect(pos("GOLEIRO")).toBe("GOL");
    expect(pos("gOlEiRo")).toBe("GOL");
    expect(pos(" Ala  Esquerda ")).toBe("MEI");
  });

  it("tolera acento e separador que a planilha manda", () => {
    expect(pos("Pivô")).toBe("ATA");
    expect(pos("pivô")).toBe("ATA");
    expect(pos("Ala-Esquerda")).toBe("MEI");
    expect(pos("ala_direita")).toBe("MEI");
  });

  // `-` entra aqui, e nao no grupo do desconhecido: em planilha o traco e o
  // marcador de "nada aqui", entao ele significa "nao informado" — que e
  // exatamente o que null modela. Reprovar a linha por causa de um traco
  // reprovaria planilha bem preenchida.
  it("celula vazia, traco e ausencia viram null, com kind empty", () => {
    for (const blank of ["", "   ", "-", "--", " - ", null, undefined]) {
      const r = normalizePreferredPosition(blank);
      expect(r.kind).toBe("empty");
      expect(r.position).toBeNull();
    }
  });

  it("desconhecido nao virou valor inventado: null + kind unrecognized", () => {
    for (const junk of ["Arqueiro", "Goleir0", "ZAGUEIR", "n/a", "7"]) {
      const r = normalizePreferredPosition(junk);
      expect(r.kind).toBe("unrecognized");
      expect(r.position).toBeNull();
      if (r.kind === "unrecognized") expect(r.raw).toBe(junk);
    }
  });

  // O teste que amarra a funcao a constraint. Itera a TABELA de aliases, e nao um
  // corpus escrito a mao: com corpus, um alias novo cuja chave ninguem listou
  // aqui passava batido, e quem pegava de fato era o `tsc` pelo
  // `Record<string, CanonicalPosition>`. Agora a afirmacao e verdadeira no teste.
  it("NENHUM alias da tabela produz valor fora do enum", () => {
    const permitido: (CanonicalPosition | null)[] = [...CANONICAL_POSITIONS, null];
    const chaves = Object.keys(POSITION_ALIASES);
    expect(chaves.length).toBeGreaterThan(10);
    for (const chave of chaves) {
      expect(permitido).toContain(normalizePreferredPosition(chave).position);
      // E o alias nao pode virar null: chave da tabela tem de mapear.
      expect(normalizePreferredPosition(chave).position).not.toBeNull();
    }
    for (const valor of Object.values(POSITION_ALIASES)) {
      expect(CANONICAL_POSITIONS).toContain(valor);
    }
  });

  it("NENHUMA saida escapa dos quatro valores ou de null", () => {
    const corpus = [
      ...CANONICAL_POSITIONS,
      "Fixo", "Ala Esquerda", "Ala Direita", "Pivo", "Pivô", "Ala",
      "GOL", "ZAG", "MEI", "ATA", "VOL", "LAT",
      "Volante", "Lateral", "  goleiro  ", "GOLEIRO", "ala_direita",
      "Ala-Esquerda", "", "   ", "-", "Arqueiro", "lixo", "42",
      null, undefined,
    ];
    const permitido: (CanonicalPosition | null)[] = [...CANONICAL_POSITIONS, null];
    for (const raw of corpus) {
      expect(permitido).toContain(normalizePreferredPosition(raw).position);
    }
  });

  // O seed local mentiu para o coordenador em TRES medicoes: ele reportou
  // vocabulario de futsal como se fosse producao, e o plano inteiro nasceu com o
  // alcance errado por causa disso. Producao e staging sempre tiveram so os
  // quatro canonicos (medido em 2026-08-21). Esta assertiva existe para o seed
  // nao voltar a divergir do mundo em silencio.
  it("o seed local usa SO vocabulario canonico", () => {
    // `semComentarioSql` aqui pelo mesmo motivo do irmao logo abaixo, e nao
    // porque haja chamariz hoje: uma linha de exemplo em comentario `--` com
    // posicao por extenso passaria a alimentar as assertivas como se fosse
    // codigo. Dois testes vizinhos lendo o mesmo tipo de arquivo com defesas
    // diferentes e como a proxima copia nasce furada.
    const seed = semComentarioSql(
      readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8"),
    );

    // A coluna de posicao do CTE `player_seed`, e nao qualquer string do arquivo.
    //
    // O `(?:true|false)` no meio e a coluna `is_goalkeeper`, que passou a ficar
    // entre a posicao e o overall: o seed grava o BALDE da inscricao como dado
    // proprio, em vez de deriva-lo da posicao. A ancora ficou mais forte, e nao
    // mais fraca -- sem ela o casamento voltaria a terminar no primeiro numero
    // depois da posicao, e o `toBeGreaterThan(0)` abaixo e quem avisa se a forma
    // da linha mudar de novo.
    const posicoes = [
      ...seed.matchAll(/'60000000-[0-9a-f-]+'[^\n]*?'([A-Za-zÀ-ÿ ]+)',\s*(?:true|false),\s*\d+\)/g),
    ].map((m) => m[1]);

    // DENOMINADOR FECHADO, e nao `> 0`. Com `> 0` a assertiva media o que a
    // regex ACHOU, e nao o que o arquivo TEM: mutacao medida que passou 16/16
    // verde -- sujar o prefixo de UUID de UMA linha e por `'Zagueiro'` nela. A
    // linha ficava invisivel a regex, o conjunto `distintas` continuava so com
    // codigo, e o seed resultante e recusado pela CHECK (`local:setup` quebra
    // do zero).
    //
    // 192 = 64 jogadores x 3 blocos VALUES (players, championship_registrations
    // e championship_team_players repetem a mesma lista). Se voce acrescentou
    // jogador ao seed, atualize este numero -- e a falha aqui e o pedido de
    // uma olhada humana, nao um estorvo.
    expect(posicoes.length).toBe(192);

    const distintas = [...new Set(posicoes)].sort();
    expect(distintas).toEqual([...CANONICAL_POSITIONS].sort());

    // E toda uma delas normaliza para si mesma: o seed nao depende da traducao.
    for (const p of distintas) {
      expect(normalizePreferredPosition(p).position).toBe(p);
    }
  });

  // Esta e a UNICA rede de vitest sobre esta DDL, e o valor que ela protege e
  // `'GOL'` -- o unico que a cota do A6 precisa exato, porque ela conta o
  // goleiro contra todo o resto.
  //
  // Ela le o ARQUIVO, e nao o banco -- por isso o nome diz isso. Arquivo certo
  // nao prova banco certo: uma `CHECK (true)` com este mesmo nome passaria aqui
  // e no `convalidated` do script. Quem fecha esse buraco e a assertiva de
  // `pg_get_constraintdef` em scripts/test-registration-slots.sh, que le a
  // EXPRESSAO do pg_constraint. As duas sao lidas juntas.
  //
  // A versao anterior lia o SQL CRU e casava a PRIMEIRA ocorrencia do texto no
  // arquivo. Mutacao medida que atravessou os 495 testes: apagar o goleiro da
  // DDL E deixar um comentario `--` acima com a lista velha inteira. O `match`
  // achava a PROSA, comparava a prosa com o codigo, e dava verde sobre uma
  // CHECK que passou a recusar goleiro.
  //
  // Sao duas defesas, e cada uma sozinha nao basta:
  //  - `semComentarioSql` mata o chamariz em comentario;
  //  - a ancora no `ADD CONSTRAINT players_preferred_position_known` mata o
  //    chamariz que NAO e comentario (outra CHECK, um COMMENT ON, uma linha de
  //    exemplo em string), porque prende o casamento ao constraint que importa.
  it("a lista canonica do codigo e exatamente a da CHECK no ARQUIVO da migration", () => {
    const bruto = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260821010000_position_vocabulary_codes.sql"),
      "utf8",
    );
    const sql = semComentarioSql(bruto);
    const m = sql.match(
      /ADD CONSTRAINT\s+players_preferred_position_known[\s\S]*?preferred_position IN \(([^)]*)\)/,
    );
    expect(m).not.toBeNull();
    const doSql = m![1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    expect([...doSql].sort()).toEqual([...CANONICAL_POSITIONS].sort());
  });
});
