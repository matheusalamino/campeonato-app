import type { EmailMessage } from "@/lib/email/port";

/**
 * O CORPO de um e-mail: assunto, HTML e texto puro, sem destinatario.
 *
 * ── POR QUE O TEMPLATE NAO MONTA O `to` ──
 *
 * Porque quem escolhe o destino e `recipientFor` (features/email/outbox.ts), e
 * a separacao entre destino e conteudo e o que impede o pior erro alcancavel
 * neste bloco: o aviso interno de inscricao nova cair na caixa do proprio
 * inscrito. Um template que soubesse montar `to` poderia, um dia, escolher
 * errado -- e o envio sairia bem-sucedido para a pessoa errada, sem portao
 * nenhum acender.
 */
export type EmailBody = Omit<EmailMessage, "to" | "toName">;

/**
 * Um paragrafo do corpo. Com `link`, ele leva o endereco por extenso embaixo do
 * texto -- no HTML como ancora, no texto puro como a URL crua.
 *
 * URL por extenso, e nao ancora com rotulo ("clique aqui"), de proposito: o
 * texto puro nao tem ancora nenhuma, entao a versao sem HTML PRECISA da URL
 * visivel. Escondendo-a atras de um rotulo, quem le em cliente sem HTML fica
 * sem link nenhum.
 */
export type Paragrafo = { texto: string; link?: string };

/**
 * Escapa o que vai virar HTML.
 *
 * `players.name` e `championships.name` sao texto digitado por alguem. Um nome
 * com `<` interpolado cru no corpo vira marcacao no e-mail de outra pessoa --
 * e, ao contrario da tela, nao ha React aqui para escapar por conta propria.
 *
 * Os cinco de sempre. `'` sai como `&#39;` e nao `&apos;` porque `&apos;` nao
 * existe em HTML4 e clientes de e-mail antigos o renderizam cru.
 *
 * NAO e exportado, e isso e deliberado.
 *
 * ── O PRINCIPIO, QUE VALE PARA O REPO INTEIRO E NAO SO PARA ESTA FUNCAO ──
 *
 * Exporte a unidade que o chamador NAO-TESTAVEL invoca. Nao exporte um passo
 * que um chamador TESTAVEL ja exercita.
 *
 * Aqui o chamador e `corpoDe`, no mesmo arquivo, e ele tem teste. Entao esta
 * funcao e passo interno: exportar so serviria para o teste furar para dentro,
 * e teste que fura para dentro para de provar a montagem. MEDIDO -- com o teste
 * batendo direto aqui, tirar o `escapeHtml(p.link)` de `corpoDe` ficava VERDE
 * em todos os portoes; batendo em `corpoDe`, fica vermelho.
 *
 * O contraste, e ele parece incoerente ate a regra ficar clara:
 * `summaryFromRow` e `outboxRowFrom` (features/email/summary-row.ts e
 * outbox-columns.ts) SAO exportadas na mesma forma. La o chamador e
 * `services/email-outbox.ts`, que a suite principal nao alcanca -- entao a
 * funcao exportada e o ponto mais externo que um teste consegue tocar, e nao um
 * atalho para dentro. Mesma regra, respostas opostas, porque o que muda e se o
 * chamador tem portao.
 */
function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * O estilo do corpo, INLINE.
 *
 * Cliente de e-mail nao carrega folha externa e a maioria descarta `<style>` no
 * `<head>`. Atributo `style` em cada elemento e o unico que sobrevive aos tres
 * grandes (Gmail, Outlook, Apple Mail).
 */
const ESTILO_CORPO =
  "font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #222222;";

/**
 * Os dois corpos a partir da MESMA lista de paragrafos.
 *
 * Essa e a razao de esta funcao existir em vez de cada template montar as duas
 * versoes a mao: html e text montados separadamente divergem no primeiro
 * conserto que entre so num dos lados, e o leitor de cliente sem HTML recebe
 * uma versao que ninguem releu. Ha assertiva de coerencia em cada template
 * (`conta a mesma historia nos dois corpos`), mas ela prende o resultado --
 * quem torna a divergencia dificil de cometer e esta funcao.
 */
export function corpoDe(paragrafos: readonly Paragrafo[]): { html: string; text: string } {
  const html = paragrafos
    .map((p) => {
      const texto = escapeHtml(p.texto);
      if (!p.link) return `<p>${texto}</p>`;
      const link = escapeHtml(p.link);
      return `<p>${texto}<br><a href="${link}">${link}</a></p>`;
    })
    .join("");

  const text = paragrafos.map((p) => (p.link ? `${p.texto}\n${p.link}` : p.texto)).join("\n\n");

  return { html: `<div style="${ESTILO_CORPO}">${html}</div>`, text };
}

/**
 * A saudacao, ou nada.
 *
 * `championship_registrations.player_id` e NULLABLE -- medido em
 * `\d championship_registrations` --, entao o join que traz o nome pode voltar
 * vazio. O `?? ""` que calaria o TypeScript aqui produz `Olá, !`: saudacao a
 * ninguem, com a virgula pendurada. Sem nome, a saudacao existe assim mesmo,
 * so que sem vocativo.
 */
export function saudacao(nome: string | null): string {
  return nome ? `Olá, ${nome}!` : "Olá!";
}

/**
 * `{titulo} — {sufixo}`, ou so o titulo quando nao ha sufixo.
 *
 * `championship_id` tambem e NULLABLE, e o assunto e o unico lugar onde o nome
 * do campeonato entra sozinho: com `?? ""` ele viraria
 * `Inscrição confirmada — `, travessao pendurado e tudo.
 */
export function assuntoCom(titulo: string, sufixo: string | null): string {
  return sufixo ? `${titulo} — ${sufixo}` : titulo;
}
