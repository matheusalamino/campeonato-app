import RegistrationWizard, { type WizardChampionship } from "./RegistrationWizard";
import Countdown from "./steps/Countdown";
import SabbathVideo from "./steps/SabbathVideo";
import { verseForSabbath } from "@/features/registration/sabbath-verses";
import { announceableEndsAt } from "@/features/registration/sabbath-return";
import { CHAMPIONSHIP_TIME_ZONE } from "@/lib/datetime-br";

// A amostra entre aspas e texto de UI, e por isso mantem os acentos; a prosa
// depois dela segue a convencao dos comentarios, sem acento.
/** "sábado, 22/08/2026, 20:15" — com o dia da semana, em horario de Brasilia. */
function formatEndsAt(endsAt: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: CHAMPIONSHIP_TIME_ZONE,
    weekday: "long",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(endsAt));
}

/**
 * A tela de repouso do sabado.
 *
 * Duas historias, como no `ClosedNotice`, e a diferenca entre elas e o que esta
 * tela pode HONESTAMENTE prometer:
 *
 * - Com `endsAt`, o horario e o fim real da pausa — o por do sol gravado em
 *   `sabbath_windows`, ou o fim da regra conservadora. Da para dizer a hora e
 *   contar para ela.
 * - Sem `endsAt` — ou com um que nao cai num sabado, ver `announceableEndsAt` —
 *   sobra o override manual pelo status `rest`: um feriado, uma pausa nao
 *   prevista. Ninguem sabe a hora, e afirmar uma seria inventar, entao a tela
 *   promete o canal, que e o que de fato vai avisar.
 *
 * Ate a T6 o corpo estava em ingles, num app inteiro em portugues para
 * jogadores brasileiros, e prometia que a inscricao voltaria sozinha sem que
 * nada cumprisse isso. Quem cumpre agora e o `Countdown`, que ao zerar
 * recarrega e deixa o SERVIDOR decidir se a pausa acabou.
 */
export default function RestOverlay({
  championship, liveCount, endsAt,
}: { championship: WizardChampionship; liveCount: number; endsAt: string | null }) {
  const verse = verseForSabbath(new Date());
  // Um so ponto de decisao: sem horario anunciavel, a tela inteira — texto e
  // contagem — cai no ramo honesto, em vez de misturar meia promessa com meia
  // duvida.
  //
  // O preco, registrado: sem `Countdown` nao ha `router.refresh()`, entao o ramo
  // honesto nao se recupera sozinho — quem esta nele recarrega na mao. Para o
  // override manual isso ja era verdade e continua certo (quem decide a volta e
  // um humano no admin). Para `endsAt` nao-nulo e nao-sabado e uma perda de
  // verdade: a hora E conhecida e ainda assim nada recarrega. Defensavel porque
  // aquele valor so aparece com dado corrompido, e contar para um instante que
  // nao merece ser anunciado seria confiar nele pela porta dos fundos.
  const returnsAt = announceableEndsAt(endsAt);

  return (
    <div className="relative min-h-screen">
      {/* `inert` alem de aria-hidden: pointer-events-none barra o mouse, mas o Tab
          continuaria entrando num conteudo anunciado como inexistente. */}
      <div inert aria-hidden className="pointer-events-none select-none blur-[4px] opacity-50">
        {/* `sunsetAt={null}` de proposito: durante a pausa nao ha por do sol a avisar. */}
        <RegistrationWizard championship={championship} liveCount={liveCount} sunsetAt={null} />
      </div>

      {/* O overlay e o proprio container de rolagem. Centralizar com `flex
          items-center` sozinho so funciona enquanto o conteudo cabe na tela, e
          com o versiculo e o video ele nao cabe mais: num 375x667 o link do
          canal ficava fora da area visivel, sem jeito de alcanca-lo. O
          `min-h-full` no filho mantem o centro quando sobra espaco e deixa
          crescer — e rolar — quando falta. */}
      <div className="fixed inset-0 overflow-y-auto overscroll-contain px-4 py-8"
           style={{ background: "rgba(4,4,7,.55)" }}>
        <div className="flex min-h-full items-center justify-center">
          <div className="w-full max-w-sm rounded-3xl border p-6 text-center"
               style={{ background: "#0d0d11", borderColor: "rgba(230,180,34,.35)" }}>
            <div className="text-4xl" aria-hidden="true">🌅</div>
            <h2 className="my-3 text-lg font-extrabold text-[var(--gala-gold-2)]">Inscrições em repouso</h2>

            <p className="text-sm leading-relaxed text-[var(--gala-ink-dim)]">
              Nossa comunidade é Adventista do Sétimo Dia e guarda o sábado, do pôr do sol de sexta
              ao pôr do sol de sábado. Por isso as inscrições ficam em repouso nesse período.
            </p>

            {returnsAt ? (
              <>
                {/* A regra vem colada no numero: quem so bate o olho no negrito
                    le "sabado" junto da data, e nao um horario solto que
                    poderia ser de qualquer dia. */}
                <p className="mt-3 text-sm leading-relaxed text-[var(--gala-ink-dim)]">
                  O repouso termina no pôr do sol de sábado. As inscrições voltam sozinhas{" "}
                  <b className="text-[var(--gala-ink)]">{formatEndsAt(returnsAt)}</b>, e você não
                  precisa fazer nada: esta página se atualiza quando chegar a hora.
                </p>
                <div className="mt-3">
                  <Countdown targetIso={returnsAt} />
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-[var(--gala-ink-dim)]">
                Elas voltam sozinhas assim que o repouso terminar. Ainda não temos o horário exato
                para prometer — avisaremos no nosso canal quando as inscrições voltarem.
              </p>
            )}

            <figure className="mt-5 rounded-2xl border p-4 text-left"
                    style={{ background: "rgba(255,255,255,.03)", borderColor: "rgba(230,180,34,.2)" }}>
              <blockquote className="text-sm italic leading-relaxed text-[var(--gala-ink)]">
                “{verse.text}”
              </blockquote>
              <figcaption className="mt-2 text-xs font-bold text-[var(--gala-gold-2)]">
                {verse.reference}
              </figcaption>
            </figure>

            <p className="mt-5 mb-2 text-xs font-bold uppercase tracking-wide text-[var(--gala-ink-dim)]">
              Enquanto isso, fica com a gente
            </p>
            <SabbathVideo />

            <a href="https://youtube.com/@adventistascampolim" target="_blank" rel="noopener noreferrer"
               className="mt-4 inline-block w-full rounded-xl py-3 font-bold text-[#050507]"
               style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>
              ▶ Conheça a gente
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
