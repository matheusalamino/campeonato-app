import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tres fatos da tela de repouso, lidos como texto.
 *
 * Nao e um teste de renderizacao disfarcado: o que a tela MOSTRA — o versiculo,
 * o horario de volta, a contagem — ja tem dono testado de verdade
 * (`verseForSabbath`, `sabbathStatus`, `registrationGate`) ou aparece na hora se
 * quebrar. O que este arquivo tranca e o oposto: os tres fatos cuja perda e
 * INVISIVEL. Nenhum deles muda um pixel, nenhum quebra o `tsc`, nenhum derruba a
 * suite — e os tres so aparecem quando ja custaram alguma coisa a alguem.
 *
 *   `inert` no wizard borrado   ->  o Tab entra num formulario anunciado como
 *                                   inexistente, e so quem navega por teclado
 *                                   descobre.
 *   `youtube-nocookie`          ->  trocado por `youtube.com`, a privacidade
 *                                   some em silencio, com o video funcionando
 *                                   igual.
 *   ausencia de thumbnail       ->  uma capa do dominio de imagens do YouTube
 *                                   entrega o IP do visitante ANTES do clique e
 *                                   transforma a fachada em fachada so no nome.
 *
 * Le como texto pelo mesmo motivo de wizard-steps.test.ts e
 * sabbath-page-wiring.test.ts: o projeto nao tem jsdom nem Testing Library
 * (vitest roda com environment "node"), e montar essa infra para conferir tres
 * atributos escritos no proprio arquivo seria desproporcional.
 */
const OVERLAY = join(process.cwd(), "app/(public)/inscrever/[slug]/RestOverlay.tsx");
const VIDEO = join(process.cwd(), "app/(public)/inscrever/[slug]/steps/SabbathVideo.tsx");

/**
 * O arquivo sem comentarios.
 *
 * Nao e capricho: a primeira versao deste teste falhou contra o codigo CERTO,
 * porque o docblock do SabbathVideo explica por que nao ha thumbnail e cita o
 * dominio da capa — texto em prosa casando com uma busca que queria codigo. Sem
 * isto, o preco de comentar bem seria um teste vermelho, e o jeito de deixar
 * verde seria apagar a explicacao.
 *
 * O `(?<!:)` na linha de baixo existe por causa de `https://`: sem ele, o strip
 * de `//` comeria a propria URL do embed e o teste do dominio passaria a medir
 * o nada.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/[^\n]*/g, "");
}

const overlay = semComentarios(readFileSync(OVERLAY, "utf8"));
const video = semComentarios(readFileSync(VIDEO, "utf8"));

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
    expect(video).toContain("useState(false)");
    expect(video).not.toContain("useState(true)");

    // E o iframe fica mesmo atras da guarda, e nao solto no corpo do
    // componente: sem isto, trocar o `if (playing)` por um render incondicional
    // passaria mesmo com o estado inicial certo.
    const guarda = video.indexOf("if (playing)");
    expect(guarda).toBeGreaterThan(0);
    expect(video.indexOf("<iframe")).toBeGreaterThan(guarda);
  });
});
