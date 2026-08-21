import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentario } from "@/features/testing/sem-comentario";

/**
 * Cinco fatos da tela de repouso, lidos como texto, em quatro casos.
 *
 * Nao e um teste de renderizacao disfarcado: o que a tela MOSTRA — o versiculo,
 * o horario de volta, a contagem — ja tem dono testado de verdade
 * (`verseForSabbath`, `announceableEndsAt`, `registrationGate`) ou aparece na
 * hora se quebrar. O que este arquivo tranca e o oposto: os fatos cujo DANO e
 * invisivel.
 *
 * "Dano invisivel", e nao "mudanca invisivel" — a diferenca importa para quem
 * for decidir se um `it` novo pertence aqui. O quinto fato abaixo MUDA pixel:
 * o botao some e o video aparece no lugar dele. O que ninguem ve e o estrago —
 * um request ao Google com o IP de quem so queria saber quando a inscricao
 * volta. Nenhum dos cinco quebra o `tsc`, nenhum derruba a suite, e todos so
 * aparecem quando ja custaram alguma coisa a alguem.
 *
 *   `inert` no wizard borrado   ->  o Tab entra num formulario anunciado como
 *                                   inexistente, e so quem navega por teclado
 *                                   descobre.
 *   `rel="noopener noreferrer"` ->  a aba aberta ganha acesso a `window.opener`.
 *                                   O navegador moderno ja implica `noopener`
 *                                   em `target="_blank"`, entao o dano hoje e
 *                                   o `noreferrer`: o canal passa a receber de
 *                                   onde a pessoa veio.
 *   `youtube-nocookie`          ->  trocado por `youtube.com`, a privacidade
 *                                   some em silencio, com o video funcionando
 *                                   igual.
 *   ausencia de thumbnail       ->  uma capa do dominio de imagens do YouTube
 *                                   entrega o IP do visitante ANTES do clique e
 *                                   transforma a fachada em fachada so no nome.
 *   fachada comeca fechada      ->  `useState(true)` monta o iframe no primeiro
 *                                   paint, e o "antes do clique" acima deixa de
 *                                   existir sem que nada reclame.
 *
 * Le como texto pelo mesmo motivo de wizard-steps.test.ts e
 * sabbath-page-wiring.test.ts: o projeto nao tem jsdom nem Testing Library
 * (vitest roda com environment "node"), e montar essa infra para conferir
 * atributos escritos no proprio arquivo seria desproporcional.
 */
const OVERLAY = join(process.cwd(), "app/(public)/inscrever/[slug]/RestOverlay.tsx");
const VIDEO = join(process.cwd(), "app/(public)/inscrever/[slug]/steps/SabbathVideo.tsx");

const overlay = semComentario(readFileSync(OVERLAY, "utf8"));
const video = semComentario(readFileSync(VIDEO, "utf8"));

describe("a tela de repouso do sabado", () => {
  // Sentinelas: um `indexOf` que devolve -1 ou um regex que casa zero linhas
  // passariam vazio, e falsa cobertura e pior que lacuna conhecida. Cada `it`
  // confere primeiro que ACHOU o que procura.

  it("esconde o wizard de fundo do mouse, do leitor de tela E do Tab", () => {
    const wizard = overlay.indexOf("<RegistrationWizard");
    expect(wizard).toBeGreaterThan(0);

    // O container do wizard borrado: a abertura de <div> imediatamente anterior.
    const abertura = overlay.lastIndexOf("<div", wizard);
    expect(abertura).toBeGreaterThan(-1);
    const container = overlay.slice(abertura, wizard);

    // `pointer-events-none` sozinho barra so o mouse — era o estado antes de
    // `inert` entrar, e o Tab passava direto para dentro do formulario.
    expect(container).toContain("inert");
    expect(container).toContain("aria-hidden");
    expect(container).toContain("pointer-events-none");
  });

  it("todo link externo das duas telas sai com noopener noreferrer", () => {
    // Varre os dois arquivos, e nao so o overlay: hoje o SabbathVideo nao tem
    // link, mas "abrir no YouTube" e o botao mais obvio a nascer ali, e um teste
    // que so olha o overlay ficaria verde sem nunca ter visto o link novo.
    const externos = [overlay, video].flatMap((fonte) =>
      [...fonte.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]),
    );
    expect(externos.length).toBeGreaterThan(0);
    expect(externos.filter((tag) => !tag.includes('rel="noopener noreferrer"'))).toEqual([]);
  });

  it("o video embarca pelo dominio sem cookie, e nada e pedido antes do clique", () => {
    // Sentinela: o arquivo precisa mesmo montar um iframe, senao os `not`
    // abaixo passariam num arquivo vazio.
    expect(video).toContain("<iframe");
    expect(video).toContain("youtube-nocookie.com/embed/");

    // "youtube-nocookie.com" nao contem "youtube.com", entao esta busca so casa
    // com o dominio que rastreia — seja no src do iframe, seja numa thumbnail
    // de "img.youtube.com".
    expect(video).not.toContain("youtube.com");
    // O outro dominio da capa, que nao tem "youtube" no nome.
    expect(video).not.toContain("ytimg");
  });

  /**
   * A outra metade da fachada, e a que o titulo acima ja prometia sem cobrir.
   *
   * `useState(false)` -> `useState(true)` monta o iframe no primeiro paint: o
   * visitante entrega IP e request ao Google ANTES de qualquer clique, que e o
   * dano exato que a fachada existe para evitar. Passa no `tsc`, no eslint e na
   * suite inteira, e a tela continua parecendo funcionar — so que o botao some
   * e o video ja esta la. E invisivel pelo mesmo criterio dos casos acima.
   */
  it("comeca fechado — o iframe so existe depois do clique", () => {
    // O nome do estado e LIDO do arquivo, e nao escrito aqui, pelo mesmo motivo
    // dos irmaos: renomear `playing` pelo atalho da IDE e no-op, e teste que
    // morre em no-op ensina a nao refatorar. Pela mesma razao o padrao tolera a
    // anotacao de tipo (`useState<boolean>(false)`) e a guarda tolera
    // `if (estado === true)` — as tres edicoes matavam este `it`, e um vermelho
    // chamado "comeca fechado" manda o proximo cacar uma regressao de
    // privacidade que nao houve.
    const inicial = video.match(/const \[(\w+), \w+\] = useState(?:<[^>]*>)?\(\s*false\s*\)/);
    // Sentinela: sem a declaracao achada nao ha nome, e um nome vazio casaria
    // com qualquer coisa la embaixo. `useState(true)` cai aqui.
    expect(inicial).not.toBeNull();
    const estado = inicial![1];
    expect(video).not.toMatch(/useState(?:<[^>]*>)?\(\s*true\s*\)/);

    // E o iframe fica mesmo atras da guarda, e nao solto no corpo do
    // componente: sem isto, trocar o `if` por um render incondicional passaria
    // mesmo com o estado inicial certo.
    const guarda = video.search(new RegExp(`if\\s*\\(\\s*${estado}\\b`));
    expect(guarda).toBeGreaterThan(0);
    expect(video.indexOf("<iframe")).toBeGreaterThan(guarda);
  });
});
