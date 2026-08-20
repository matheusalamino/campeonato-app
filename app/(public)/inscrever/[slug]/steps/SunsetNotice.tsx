"use client";

import { CHAMPIONSHIP_TIME_ZONE } from "@/lib/datetime-br";
import type { SunsetAlert } from "@/features/registration/sabbath";

/** "17:50", em horario de Brasilia — o por do sol e um fato de Brasilia, nao do aparelho. */
function formatSunset(startsAt: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: CHAMPIONSHIP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

/**
 * O aviso de que o por do sol esta chegando.
 *
 * Apresentacional puro: quem tica o relogio e o wizard, porque o mesmo alerta
 * decide se o bloco de pagamento aparece. Dois relogios divergiriam, e o
 * jogador veria "faltam 12 minutos" com o QR ja escondido.
 */
export default function SunsetNotice({
  alert, startsAt,
}: { alert: SunsetAlert; startsAt: string | null }) {
  /*
   * `startsAt` nulo com `alert` diferente de "none" nao acontece — `sunsetAlert`
   * devolve "none" sem instante —, mas o par chega aqui como dois valores
   * independentes e o `tsc` nao sabe disso. A guarda esta aqui para o formatador
   * nunca receber `null`, e nao para tratar um caso que exista.
   */
  const hora = alert === "none" || !startsAt ? null : formatSunset(startsAt);

  /*
   * O container do `role="alert"` fica SEMPRE no DOM, mesmo vazio, pelo mesmo
   * motivo das duas regioes do SlotNotice: regiao live que nasce junto com o
   * conteudo nao anuncia de forma confiavel — o leitor de tela precisa ja estar
   * observando quando o texto entra.
   *
   * E aqui isso nao e hipotese: `alert` comeca em "none" em TODO carregamento,
   * por causa da hidratacao, e so vira "notice" dentro do efeito. O texto chega
   * sempre depois da montagem. Um `return null` aqui em cima criaria a regiao no
   * mesmo instante do conteudo, todas as vezes, e o unico aviso de que o
   * pagamento esta prestes a fechar sairia calado para quem depende do leitor.
   *
   * Assertivo, e nao `aria-live="polite"` como a faixa dourada do SlotNotice: e
   * um prazo curto que chega sozinho, sem o jogador ter tocado em nada. Dourado
   * no tom mesmo assim, porque a noticia nao e sobre a vaga dele ter sido
   * perdida.
   */
  return (
    <div role="alert">
      {hora && (
        <div
          className="mb-4 rounded-2xl px-3 py-3 text-xs leading-relaxed"
          style={{
            background: "rgba(230,180,34,.08)",
            border: "1px solid rgba(230,180,34,.25)",
            color: "var(--gala-ink)",
          }}
        >
          {alert === "cutoff" ? (
            <>
              🌅 As inscrições entram em repouso às <b>{hora}</b>, daqui a poucos minutos. O pagamento
              foi fechado para você não pagar e ser recusado. <b>Não pague nada agora</b> — as
              inscrições voltam após o pôr do sol de sábado.
            </>
          ) : (
            <>
              🌅 As inscrições entram em repouso às <b>{hora}</b>, com o pôr do sol. Guardamos o sábado
              e elas voltam automaticamente amanhã à noite. Se for pagar, pague agora — o pagamento
              fecha alguns minutos antes.
            </>
          )}
        </div>
      )}
    </div>
  );
}
