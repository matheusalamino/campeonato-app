"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";

/**
 * Cobranca por PIX do passo de pagamento.
 *
 * O que se copia e o BR Code inteiro, nao a chave: e ele que leva o valor ja
 * preenchido. Copiar so a chave devolveria ao jogador a tarefa de somar
 * ingressos extras a mao — justo o que este codigo existe para evitar.
 *
 * O QR aparece a partir de 769px: no celular ele nao serve, porque a
 * pessoa esta no mesmo aparelho em que vai abrir o banco.
 */
export default function PixPayment({ payload, amount }: { payload: string; amount: number }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let ativo = true;
    QRCode.toString(payload, { type: "svg", margin: 1, width: 200, errorCorrectionLevel: "M" })
      .then((out) => { if (ativo) setSvg(out); })
      .catch(() => { if (ativo) setSvg(""); });
    return () => { ativo = false; };
  }, [payload]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Código PIX copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.03] px-3 py-4 flex flex-col gap-3">
      <div className="text-sm font-bold text-[var(--gala-gold-2)]">
        Pague R$ {amount.toFixed(2)} via PIX
      </div>

      {svg && (
        <div className="hidden min-[769px]:flex justify-center">
          <div
            className="rounded-xl bg-white p-2"
            aria-label="QR Code para pagamento via PIX"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}

      <p className="text-xs text-[var(--gala-ink-dim)]">
        <span className="hidden min-[769px]:inline">Escaneie o QR Code com o app do seu banco, ou use o </span>
        <span className="min-[769px]:hidden">Use o </span>
        código copia e cola abaixo. O valor já vai preenchido.
      </p>

      <code className="block text-[10px] leading-relaxed break-all rounded-xl bg-black/30 px-3 py-2 text-[var(--gala-ink-dim)] max-h-24 overflow-y-auto">
        {payload}
      </code>

      <button
        type="button"
        onClick={copiar}
        className="w-full rounded-xl py-3 font-bold text-[#050507]"
        style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}
      >
        Copiar código PIX
      </button>
    </div>
  );
}
