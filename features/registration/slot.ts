import { PAYMENT_STEP } from "./field-steps";
import type { SunsetAlert } from "./sabbath";

/**
 * Razoes de recusa que cabem inteiras no nome, sem dado nenhum junto.
 *
 * Tem nome proprio, em vez de continuar solta dentro da uniao, porque
 * `RPC_REASONS` — logo abaixo — amarra a ela a tabela de razoes que aceitamos da
 * RPC, e sem esse elo tirar uma razao de la nao quebra nada: o type guard so
 * fica mais estreito, a atribuicao continua valida, e a razao perdida vira
 * `error` na tela de quem a recebeu.
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
 * Razoes que a RPC declara no seu COMMENT, fora `all_reserved`, que tem forma
 * propria.
 *
 * O `Record<SimpleRefusalReason, true>` e o guarda, e nao enfeite: e ele que
 * amarra esta tabela a uniao nos DOIS sentidos — chave a mais nao existe na
 * uniao e o literal e recusado; chave a menos e propriedade faltando e o `tsc`
 * cobra pelo nome. O sentido que faz estrago e o segundo: `isKnownReason` e type
 * guard, entao tirar uma razao daqui apenas o estreita,
 * `{ ok: false, reason: result.reason }` continua atribuivel, nada falha — e a
 * razao perdida passa a chegar na tela como `error`, que convida a tentar de
 * novo. Para `sabbath` isso seria convidar a insistir durante 24h de pausa.
 *
 * Uma lista PELADA (`["not_found", ...]`, o estado de antes) cobre so o primeiro
 * sentido. Uma lista com guarda de exaustividade cobre os dois — isto foi
 * medido, e nao suposto, e o `Record` nao e o unico jeito de fechar a porta. Ele
 * ficou por tres motivos menores e somados: o erro do `tsc` pousa na propria
 * tabela e NOMEIA a chave que falta, em vez de apontar para uma linha de guarda
 * longe dela; nao sobra linha inerte nem `void` para explicar a quem ler
 * depois; e sao seis linhas a menos.
 */
const RPC_REASONS: Record<SimpleRefusalReason, true> = {
  not_found: true,
  not_open: true,
  already_registered: true,
  full: true,
  sabbath: true,
};

function isKnownReason(value: unknown): value is SimpleRefusalReason {
  // `Object.hasOwn`, e nao `value in RPC_REASONS`: `in` aceita `toString`,
  // `constructor`, `valueOf`, `hasOwnProperty` e `__proto__`, que vem do
  // prototipo. E o estrago nao seria "lixo com a frase errada": `noticeFor` nao
  // tem `case` para nenhum deles, cai no fim do `switch` e devolve `undefined`,
  // entao as DUAS regioes live saem VAZIAS — a faixa desaparece inteira e o
  // jogador fica com os passos trancados por `canOpenStep` e zero explicacao na
  // tela. Nao lanca, nao quebra hidratacao, nao deixa rastro.
  return typeof value === "string" && Object.hasOwn(RPC_REASONS, value);
}

/**
 * A resposta de `reserve_registration_slot` traduzida para o tipo da tela.
 *
 * Mora aqui, ao lado da uniao com que e casada, e nao no servico que faz a
 * chamada. `services/public-registration.ts` importa `server-only`, que nem esta
 * no `node_modules` — o Next o resolve no build —, e `vitest.config.ts` inclui
 * `lib/**`, `features/**` e `scripts/**`, entao um teste escrito la nao rodaria e
 * exportar a traducao de la nao a tornaria testavel. Trazer a traducao para ca
 * torna, sem tocar em config nenhuma: e o mesmo remedio que esta branch ja
 * escolheu para `announceableEndsAt` e para `paymentGate`, pelo mesmo motivo.
 *
 * `null` cobre os dois jeitos de a chamada nao dar resposta — erro do PostgREST,
 * rede, timeout; ou corpo vazio. Nenhum dos dois diz se ha vaga, e por isso os
 * dois viram `error` e nao `not_found`, como era antes: ver `SlotReservation`.
 */
export function reservationFromRpc(payload: unknown): SlotReservation {
  const result = payload as {
    success?: boolean;
    reason?: unknown;
    is_waitlist?: boolean;
    expires_at?: string;
    retry_at?: string | null;
  } | null;

  if (!result) return { ok: false, reason: "error" };

  if (result.success) {
    return { ok: true, isWaitlist: !!result.is_waitlist, expiresAt: result.expires_at! };
  }
  if (result.reason === "all_reserved") {
    return { ok: false, reason: "all_reserved", retryAt: result.retry_at ?? null };
  }
  // O `as` que estava aqui carimbava qualquer string vinda do JSON como uma das
  // razoes da tabela, entao uma razao nova na RPC — ou uma resposta malformada —
  // seria renderizada como um veredito que ninguem deu. Razao que nao esta na
  // lista e resposta que nao entendemos, e nao ha lotacao a declarar: `error`
  // convida a tentar de novo, que e a unica resposta honesta.
  return isKnownReason(result.reason)
    ? { ok: false, reason: result.reason }
    : { ok: false, reason: "error" };
}

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
 * Por que o bloco de pagamento — QR do PIX e envio do comprovante — nao esta na
 * tela.
 *
 * Uniao discriminada, como o `RegistrationGate`: fechado sem razao nao existe, e
 * quem mostra o aviso nao precisa reconstruir o motivo a partir dos mesmos dois
 * argumentos. Foi assim que a primeira versao errou — o texto assumia a vaga, e
 * no corte do por do sol afirmava algo falso.
 */
export type PaymentClosedReason = "slot" | "sunset";

export type PaymentGate =
  | { open: true }
  | { open: false; reason: PaymentClosedReason };

/**
 * O bloco de pagamento pode aparecer?
 *
 * Dois gatilhos, um mecanismo so — o por do sol entrou como um segundo termo, e
 * nao como um bloco paralelo que tambem esconde o QR.
 *
 * O primeiro e o do A4. Mesma primeira linha de `canOpenStep`: sem reserva ainda
 * nao ha veredito, e com reserva ok nada muda. A guarda de navegacao atrasa
 * exatamente uma transicao — a renovacao dispara depois do `setStep` —, entao o
 * jogador aterrissa no passo com a recusa ja na mao e o QR ainda no lugar. No
 * celular e o QR que esta no campo de visao, nao a faixa: ele paga, e so o
 * "Revisar" o para, com o dinheiro ja fora.
 *
 * O segundo e o do por do sol, e chega pela mesma porta: dez minutos e tempo
 * insuficiente para trocar para o app do banco, pagar, tirar print e subir,
 * entao quem comeca agora paga e e recusado — dinheiro gasto e vaga travada ate
 * sabado a noite. Isto NAO move a borda do calculo: a pausa continua exata no
 * por do sol, e "cutoff" so muda o que a tela mostra antes dela.
 *
 * A VAGA VEM PRIMEIRO quando os dois valem, porque ela e a recusa mais dura: sem
 * vaga nao ha inscricao, com ou sem sol.
 *
 * Puro e testado de verdade porque, escrito no wizard como expressao solta, o
 * unico teste possivel era procurar pedaco de texto — e `(...) || true` passava.
 */
export function paymentGate(
  reservation: SlotReservation | null,
  sunset: SunsetAlert,
): PaymentGate {
  if (reservation && !reservation.ok) return { open: false, reason: "slot" };
  if (sunset.level === "cutoff") return { open: false, reason: "sunset" };
  return { open: true };
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
