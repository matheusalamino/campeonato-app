import { PAYMENT_STEP } from "./field-steps";

/**
 * Razoes de recusa que cabem inteiras no nome, sem dado nenhum junto.
 *
 * Tem nome proprio, em vez de continuar solta dentro da uniao, porque o servico
 * amarra a ela a tabela de razoes que aceita da RPC — e sem esse elo tirar uma
 * razao de la nao quebra nada: o type guard so fica mais estreito, a atribuicao
 * continua valida, e a razao perdida vira `error` na tela de quem a recebeu.
 *
 * `sabbath` e a pausa de sabado, do por do sol de sexta ao de sabado —
 * observancia religiosa da comunidade, e nao configuracao de campeonato. Vem
 * das duas RPCs com razao propria de proposito: dobra-la em `not_open` faria a
 * faixa dizer "as inscricoes nao estao abertas", que e justo a frase vaga que a
 * tela de repouso existe para substituir.
 */
export type SimpleRefusalReason =
  | "not_found"
  | "not_open"
  | "already_registered"
  | "full"
  | "sabbath";

/**
 * Resultado de reservar a vaga do jogador.
 *
 * Vive aqui, e nao no servico, porque o componente que mostra o estado da vaga
 * roda no cliente e o servico e marcado com `server-only`.
 *
 * `error` e o ramo da chamada que nao completou — PostgREST fora do ar, falta
 * de permissao, timeout, rede. Ele existe separado porque nao e um veredito
 * sobre vaga: nao sabemos se ha lugar ou nao. Dobra-lo em `not_found`, como era
 * antes, fazia uma falha passageira dizer ao jogador que o campeonato tinha
 * esgotado — e o bloqueava com uma informacao inventada.
 */
export type SlotReservation =
  | { ok: true; isWaitlist: boolean; expiresAt: string }
  | { ok: false; reason: SimpleRefusalReason }
  | { ok: false; reason: "all_reserved"; retryAt: string | null }
  | { ok: false; reason: "error" };

/**
 * Se a navegacao do wizard pode levar o jogador ao passo `target`.
 *
 * Enquanto a reserva existe e nao esta ok, o jogador nao tem vaga: deixa-lo
 * abrir passos novos e exatamente o caminho que, no campeonato passado, levou
 * gente a pagar o PIX e ser recusada no envio. Continuam abertos apenas o passo
 * do CPF — unico jeito de tentar de novo, e o que salva a falha passageira de
 * rede — e os passos ja concluidos, onde reler o que preencheu nao custa vaga
 * nenhuma. O passo da revisao nunca entra em `done`, entao o envio fica fora de
 * alcance por construcao.
 *
 * O pagamento e a excecao aos concluidos, por dois motivos independentes.
 *
 * O primeiro sobrevive a qualquer conserto: `done` no pagamento significa
 * "clicou em Revisar e passou na validacao do cliente", que e fato de
 * navegacao, nao de pagamento. Mesmo com a validacao apertada ele diria no
 * maximo "anexou um arquivo", nunca "pagou" — e reabrir o passo sem vaga nao
 * traz vantagem nenhuma ao jogador em mundo nenhum.
 *
 * O segundo e a folga de hoje, que torna o primeiro urgente:
 * `payment_receipt_link` e `optional()` em `features/registration/schema.ts`, e
 * so o servidor o exige (e so quando ha o que cobrar), entao `advance` marca
 * `done` para quem clicou em "Revisar" de maos vazias. Sem a excecao, esse
 * jogador — que ainda nao pagou — reabriria o passo depois da reserva ser
 * recusada, pagaria o PIX ali e nao conseguiria enviar, porque a revisao segue
 * fechada. Dinheiro gasto e inscricao travada: o dano que o A4 existe para
 * evitar, so que por uma porta mais estreita. Quando essa divida fechar, o
 * primeiro motivo continua de pe — esta linha nao volta atras junto.
 *
 * `target` 0 e o accordion fechando o passo aberto: nao leva a passo nenhum.
 *
 * Sem reserva ainda (antes do CPF) nao ha veredito, e bloquear seria inventar.
 */
export function canOpenStep(
  target: number,
  reservation: SlotReservation | null,
  done: Record<number, boolean>,
): boolean {
  if (!reservation || reservation.ok) return true;
  if (target <= 1) return true;
  if (target === PAYMENT_STEP) return false;
  return done[target] === true;
}

/**
 * Se este resultado tem autoridade para substituir uma reserva viva na tela.
 *
 * `error` nao tem: como diz `SlotReservation` la em cima, ele e a chamada que
 * nao completou, e nao um veredito sobre vaga. Deixa-lo entrar no lugar de uma
 * reserva boa troca a faixa por vermelho e, por `canOpenStep`, tranca o passo
 * do pagamento — tudo isso enquanto a reserva segue viva no servidor, com
 * quinze minutos pela frente. Um soluco de rede de 200ms nao pode fazer isso.
 *
 * Antes do heartbeat isso so acontecia num clique do jogador. Agora ha
 * renovacao de fundo — inclusive uma disparada de proposito no instante em que
 * ele sai para o app do banco, que e a chamada com mais chance de pegar a rede
 * do celular no meio da troca. Ele voltaria do PIX para uma faixa vermelha e um
 * passo trancado.
 *
 * Os outros continuam passando: `full`, `all_reserved`, `not_open`,
 * `not_found`, `already_registered` e `sabbath` sao veredito, e veredito
 * precisa derrubar — e para isso que a reserva existe.
 *
 * `sabbath` e o caso em que isso pesa mais: quem chega nele esta preenchendo no
 * instante do por do sol e recebe a recusa pelo heartbeat, sem ter tocado em
 * nada. A partir dali a RPC nao renova mais a reserva, entao ela morre em ate
 * um TTL — manter a faixa dourada prometendo "sua vaga esta garantida" seria a
 * tela sustentando uma promessa que o servidor ja retirou.
 *
 * Nao serve para a reserva inicial: la nao ha reserva boa a preservar, e quem
 * levou um `error` precisa ve-lo para saber que vale tentar de novo.
 */
export function isSlotVerdict(reservation: SlotReservation): boolean {
  return reservation.ok || reservation.reason !== "error";
}
