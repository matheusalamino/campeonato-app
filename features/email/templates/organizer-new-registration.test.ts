import { describe, it, expect } from "vitest";
import {
  organizerNewRegistrationEmail,
  type OrganizerNewRegistrationData,
} from "./organizer-new-registration";

/**
 * O AVISO INTERNO: o e-mail que a organizacao recebe quando entra inscricao
 * nova. Vai para `ORGANIZER_EMAIL`, nunca para o inscrito -- quem garante isso
 * e `isOrganizerKind` (features/email/kinds.ts), e ha assertiva la.
 *
 * ── A ASSERTIVA QUE ESTE ARQUIVO TEM E O COMPROVANTE NAO ──
 *
 * A da POSICAO. `players.preferred_position` guarda CODIGO desde o A8
 * (`GOL|ZAG|MEI|ATA`, CHECK `players_preferred_position_known`), e imprimir a
 * coluna crua manda `ATA` para a caixa de quem organiza. O `tsc` nao ve: os
 * dois lados sao `string`.
 *
 * E a varredura do A8 TAMBEM nao ve -- MEDIDO, e esta e a razao de a assertiva
 * viver aqui. `features/players/vocabulary-sweep.test.ts` varre `features/**`,
 * entao ela ALCANCA este arquivo, mas o que ela procura sao os literais por
 * EXTENSO (`"Goleiro"`, `"Atacante"`). O defeito desta pagina e o inverso:
 * imprimir o CODIGO. A varredura fica verde em cima dele, de proposito -- o
 * docblock dela explica por que codigo nao entra na rede (`"GOL"` tambem e gol
 * MARCADO em `PenaltyShootoutControl`). E `features/players/position-display.
 * test.ts` nomeia cinco arquivos de `app/**` e `components/**`, um por um, e
 * nao varre nada.
 *
 * Ou seja: para `features/email/` a unica rede e esta.
 */

const BASE: OrganizerNewRegistrationData = {
  playerName: "Fulano de Tal",
  championshipName: "Copa Teste",
  isWaitlist: false,
  preferredPosition: "ATA",
};

function corpos(m: { subject: string; html: string; text: string }): string[] {
  return [m.subject, m.html, m.text];
}

function semMarcacao(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("organizerNewRegistrationEmail", () => {
  it("traz o nome de quem se inscreveu no assunto e no corpo", () => {
    const m = organizerNewRegistrationEmail(BASE);

    expect(m.subject).toContain("Fulano de Tal");
    expect(m.subject).toContain("Copa Teste");
    expect(m.html).toContain("Fulano de Tal");
    expect(m.text).toContain("Fulano de Tal");
  });

  it("exibe a posicao pelo ROTULO, nunca pelo codigo cru", () => {
    // O defeito que esta assertiva existe para pegar: `ATA` na caixa de quem
    // organiza. `positionLabel` (@/lib/public/types) e o unico conversor de
    // exibicao do app.
    const rotulos: Array<[string, string]> = [
      ["GOL", "Goleiro"],
      ["ZAG", "Zagueiro"],
      ["MEI", "Meia"],
      ["ATA", "Atacante"],
    ];

    for (const [codigo, rotulo] of rotulos) {
      const m = organizerNewRegistrationEmail({ ...BASE, preferredPosition: codigo });
      expect(m.html).toContain(rotulo);
      expect(m.text).toContain(rotulo);
      // O NEGATIVO e quem mata a mutacao: o positivo sozinho sobreviveria a um
      // corpo que imprimisse os dois ("Atacante (ATA)").
      expect(m.html).not.toMatch(new RegExp(`\\b${codigo}\\b`));
      expect(m.text).not.toMatch(new RegExp(`\\b${codigo}\\b`));
    }
  });

  it("sem posicao, diz que nao foi informada", () => {
    // `players.preferred_position` e NULLABLE, e `player_id` de
    // championship_registrations tambem -- entao o join pode voltar vazio.
    const m = organizerNewRegistrationEmail({ ...BASE, preferredPosition: null });

    expect(m.text).toMatch(/não informada/i);
    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/null|undefined/);
    }
  });

  it("sem nome, nao imprime buraco", () => {
    const m = organizerNewRegistrationEmail({ ...BASE, playerName: null });

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/null|undefined/);
    }
    for (const corpo of corpos(m)) {
      const lido = semMarcacao(corpo);
      expect(lido).not.toMatch(/\s[,;:!?.]/);
      expect(lido).not.toMatch(/[,;:]\s*[!?.]/);
    }

    // ── A LARGURA, que a leitura sem marcacao sozinha nao da ──
    //
    // `semMarcacao` colapsa `\s+` ANTES de olhar, entao um `?? ""` no MEIO de
    // uma frase -- "a organizacao de ⎵⎵e ela confere" -- nao encosta em
    // pontuacao nenhuma e escapa dos dois padroes acima. MEDIDO: passava os 806
    // testes.
    //
    // Estes dois olham o corpo CRU, e por isso ficam fora do `html`: la a
    // indentacao da marcacao produz espaco duplo legitimo, e uma reindentacao
    // (que nao muda comportamento) reprovaria. `subject` e `text` nao tem
    // marcacao nenhuma, entao neles espaco duplo so pode ser buraco.
    expect(m.subject).not.toMatch(/ {2}/);
    expect(m.text).not.toMatch(/ {2}/);
  });

  it("sem nome do campeonato, o assunto nao fica com o travessao pendurado", () => {
    const m = organizerNewRegistrationEmail({ ...BASE, championshipName: null });

    expect(m.subject).toBe("Nova inscrição: Fulano de Tal");
    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/—\s*$/);
    }
  });

  it("diz vaga principal quando nao e lista de espera", () => {
    const m = organizerNewRegistrationEmail({ ...BASE, isWaitlist: false });

    expect(m.text).toMatch(/vaga principal/i);
    expect(m.text).not.toMatch(/lista de espera/i);
  });

  it("diz lista de espera quando e lista de espera", () => {
    const m = organizerNewRegistrationEmail({ ...BASE, isWaitlist: true });

    expect(m.text).toMatch(/lista de espera/i);
    expect(m.text).not.toMatch(/vaga principal/i);
  });

  it("conta a mesma historia nos dois corpos", () => {
    for (const isWaitlist of [false, true]) {
      const m = organizerNewRegistrationEmail({ ...BASE, isWaitlist });
      expect(/lista de espera/i.test(m.html)).toBe(/lista de espera/i.test(m.text));
      expect(/vaga principal/i.test(m.html)).toBe(/vaga principal/i.test(m.text));
    }
  });

  it("nao deixa placeholder por preencher", () => {
    const casos: OrganizerNewRegistrationData[] = [
      BASE,
      { ...BASE, isWaitlist: true },
      { ...BASE, playerName: null, championshipName: null, preferredPosition: null },
    ];

    for (const caso of casos) {
      for (const corpo of corpos(organizerNewRegistrationEmail(caso))) {
        expect(corpo).not.toContain("{{");
        expect(corpo).not.toContain("}}");
        expect(corpo).not.toContain("undefined");
        expect(corpo).not.toContain("[nome]");
      }
    }
  });

  it("nao poe link nenhum, porque nao ha rota estavel para apontar", () => {
    // MEDIDO em `app/`: a lista de inscritos do admin e
    // `app/(protected)/championship/players/page.tsx`, e o caminho dela nao
    // leva o campeonato -- a pagina escolhe qual mostrar pelo
    // `useChampionship()`, um contexto do lado do cliente. Um link para la
    // pousaria o leitor no campeonato que ele tiver selecionado, que nao e
    // necessariamente o da inscricao que acabou de chegar.
    //
    // Entao: sem link. Esta assertiva existe para que acrescentar um seja uma
    // decisao, e nao um descuido -- e para que quem o acrescente leia isto.
    const m = organizerNewRegistrationEmail(BASE);

    expect(m.html).not.toMatch(/href=/i);
    expect(m.html).not.toContain("<a");
    expect(m.text).not.toMatch(/https?:\/\//);
  });

  it("escapa o que veio do formulario antes de por no HTML", () => {
    const m = organizerNewRegistrationEmail({ ...BASE, playerName: "<b>Fulano</b> & cia" });

    expect(m.html).not.toContain("<b>Fulano</b>");
    expect(m.html).toContain("&lt;b&gt;Fulano&lt;/b&gt; &amp; cia");
    expect(m.text).toContain("<b>Fulano</b> & cia");
  });
});
