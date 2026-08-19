/**
 * O relogio da reserva de vaga: quando renovar sozinho, e quanto ainda resta.
 *
 * A reserva vale quinze minutos (`reserve_registration_slot`) e, ate aqui, so
 * era renovada quando o jogador clicava em "Continuar". Mas o passo onde ele
 * mais demora e o do pagamento: trocar para o app do banco, fazer o PIX, voltar
 * e achar o comprovante na galeria passa dos quinze minutos sem nenhum clique.
 * A faixa promete "sua vaga esta garantida enquanto voce preenche"; sem
 * renovacao automatica a promessa vale ate o proximo clique, e nao mais.
 *
 * O perigo do caminho oposto e maior que o problema: uma aba esquecida aberta
 * renovaria a vaga para sempre e seguraria o lugar de quem quer se inscrever de
 * verdade — o contrario exato do que os quinze minutos existem para fazer.
 * Por isso a renovacao tem orcamento: ela para quando faz `IDLE_BUDGET_MS` que
 * ninguem da sinal de vida.
 *
 * O sinal de vida NAO e a aba estar visivel. Quem trocou para o app do banco
 * esta com a aba oculta e e justamente quem mais precisa da renovacao; pausar
 * por visibilidade puniria o caso legitimo e nao pegaria a aba esquecida
 * aberta em primeiro plano, que continua "visivel". O sinal e interacao —
 * toque, tecla, ou a volta para a aba —, que a aba abandonada nao produz e o
 * jogador presente produz o tempo todo.
 */

/**
 * Intervalo entre batidas.
 *
 * Quatro minutos cabem quase quatro vezes nos quinze do TTL: duas ou tres
 * batidas podem falhar em sequencia — rede do celular oscilando na fila do
 * banco — que a vaga sobrevive ate a proxima.
 */
export const HEARTBEAT_INTERVAL_MS = 4 * 60_000;

/**
 * Quanto tempo sem sinal de vida a renovacao ainda cobre.
 *
 * Igual ao TTL de proposito: a aba abandonada segura a vaga por no maximo o
 * dobro do que seguraria sem heartbeat nenhum (o orcamento, e depois o TTL
 * inteiro da ultima renovacao). E folga de sobra para quem esta com a tela
 * parada mas presente — lendo o QR, digitando o PIX em outro aparelho.
 *
 * O TTL mora no banco (`v_ttl` em
 * supabase/migrations/20260818040000_reserve_registration_slot.sql) e nao ha
 * como amarrar os dois sem expo-lo por outra rodada de rede. Entao ficam os
 * dois avisos, um de cada lado: mexer la sem mexer aqui muda o teto de posse
 * da aba abandonada em silencio.
 */
export const IDLE_BUDGET_MS = 15 * 60_000;

/**
 * Piso entre duas renovacoes.
 *
 * A renovacao tambem dispara por interacao, para quem volta do banco nao
 * esperar a proxima batida. Sem o piso, cada tecla digitada viraria um RPC.
 */
export const MIN_RENEW_GAP_MS = 60_000;

/** Abaixo disso o contador troca de tom: o tempo esta acabando de verdade. */
export const LOW_REMAINING_MS = 2 * 60_000;

/**
 * Renovar a reserva agora?
 *
 * Puro de proposito: e a unica regra que separa "mantem a vaga de quem esta
 * preenchendo" de "aba esquecida segura a vaga para sempre", e regra assim
 * precisa de teste, nao de afirmacao.
 *
 * Relogio que anda para tras (ajuste de fuso, NTP) deixa as diferencas
 * negativas — e negativo passa nos dois testes, entao o pior caso e uma
 * renovacao a mais, nunca uma vaga presa.
 */
export function shouldRenewSlot(input: {
  nowMs: number;
  /** Ultimo sinal de vida: toque, tecla, ou volta para a aba. */
  lastActivityMs: number;
  /** Quando a ultima renovacao foi disparada. */
  lastRenewMs: number;
}): boolean {
  const { nowMs, lastActivityMs, lastRenewMs } = input;
  if (nowMs - lastRenewMs < MIN_RENEW_GAP_MS) return false;
  return nowMs - lastActivityMs <= IDLE_BUDGET_MS;
}

/**
 * `expired` e caso a parte, e nao um rotulo entre outros, porque quem mostra
 * troca de elemento: enquanto ha prazo, quem fala e a linha discreta sob a
 * faixa; quando o prazo acaba, quem fala e a propria faixa — deixar as duas
 * falando poria "sua vaga esta garantida" a quatro pixels de "expirou".
 */
export type SlotCountdown =
  | { expired: false; label: string; low: boolean }
  | { expired: true };

/**
 * Quanto tempo a reserva ainda tem.
 *
 * Em minutos, e nao em mm:ss: o contador informa, nao assusta — e um relogio
 * correndo segundo a segundo ao lado do QR do PIX faz o oposto.
 *
 * Minuto cheio para baixo, nunca para cima: o relogio da tela so acorda a cada
 * meio minuto, e arredondar para cima virava "por mais 16 min" numa reserva de
 * quinze — um numero que nao existe, logo na frase que precisa ser confiavel.
 *
 * Zero e estado alcancavel: e o que sobra quando o orcamento de inatividade
 * acabou e ninguem mais renovou. Dizer que expirou e a unica leitura honesta —
 * e a saida e barata, porque qualquer toque volta a valer como sinal de vida e
 * dispara uma nova tentativa de reserva.
 */
export function slotCountdown(expiresAt: string, nowMs: number): SlotCountdown | null {
  const deadline = Date.parse(expiresAt);
  if (Number.isNaN(deadline)) return null;

  const left = deadline - nowMs;
  if (left <= 0) return { expired: true };
  if (left < 60_000) return { expired: false, label: "Vaga reservada por menos de 1 min", low: true };
  return {
    expired: false,
    label: `Vaga reservada por mais ${Math.floor(left / 60_000)} min`,
    low: left <= LOW_REMAINING_MS,
  };
}
