"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Player } from "@/types/player";
import {
  CANONICAL_POSITIONS,
  normalizePreferredPosition,
} from "@/features/players/position";
import { POSITION_LABELS } from "@/lib/public/types";

export default function EditPlayerForm({ player }: { player: Player }) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(player.name);
  const [officialName, setOfficialName] = useState(player.official_name || "");
  const [cpf, setCpf] = useState(player.cpf || "");
  const [saving, setSaving] = useState(false);

  // A posicao GRAVADA pode estar fora dos quatro valores que a CHECK
  // `players_preferred_position_known` aceita. Producao e staging tem 100% dos
  // jogadores nos quatro canonicos (medido em 2026-08-21), entao hoje isto e
  // defesa e nao conversao -- vale para nulo, para dump antigo e para o que o
  // CSV de import deixar entrar.
  //
  // Sem normalizar a semente, este form re-submetia o valor invalido inalterado
  // e o banco recusava -- e como o `handleUpdate` nao olhava o erro, a tela
  // mostrava SUCESSO. Salvamento silencioso que nao salvou.
  //
  // Normalizar sozinho tambem nao servia: converteria a posicao do jogador sem
  // o admin perceber. Por isso vem em par com o aviso abaixo, que nomeia o valor
  // antigo e o novo ANTES de salvar, e com o select, que deixa trocar em um
  // clique. A conversao passa a ser consentida, e nao contrabandeada.
  const stored = player.preferred_position;
  const normalized = normalizePreferredPosition(stored);
  const [position, setPosition] = useState<string>(normalized.position ?? "");
  const storedDiffers = (normalized.position ?? "") !== (stored ?? "");

  async function handleUpdate() {
    setSaving(true);
    const { error } = await supabase
      .from("players")
      .update({
        name,
        official_name: officialName,
        // "" e a opcao "Nao informada". A CHECK aceita null, e null e o que
        // modela "posicao nao declarada" -- gravar string vazia violaria.
        preferred_position: position === "" ? null : position,
        cpf,
      })
      .eq("id", player.id);
    setSaving(false);

    // Um update que falha NAO pode terminar em router.refresh() como se tivesse
    // dado certo. Vale para qualquer erro, e nao so para o da constraint.
    if (error) {
      toast.error(`Nao foi possivel salvar: ${error.message}`);
      return;
    }

    toast.success("Alteracoes salvas.");
    router.refresh();
  }

  return (
    <div className="bg-zinc-900 p-6 rounded-2xl">
      <h3 className="text-xl mb-4">Dados Gerais</h3>

      {storedDiffers && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200"
        >
          {normalized.position ? (
            <>
              A posicao estava gravada como <b>{stored}</b> e foi convertida para{" "}
              {/* O rotulo, e nao o codigo: o aviso serve para o admin conferir
                  a conversao, e ele confere contra o que o select mostra. */}
              <b>{POSITION_LABELS[normalized.position]}</b>. Confira o campo antes de salvar.
            </>
          ) : (
            <>
              A posicao gravada (<b>{stored}</b>) nao e reconhecida. Escolha uma
              das quatro antes de salvar.
            </>
          )}
        </p>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Nome */}
        <input
          className="bg-zinc-800 p-2 rounded col-span-4"
          placeholder="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {/* Nome Oficial */}
        <input
          className="bg-zinc-800 p-2 rounded col-span-4"
          placeholder="Nome Oficial"
          value={officialName}
          onChange={(e) => setOfficialName(e.target.value)}
        />

        {/* CPF */}
        <input
          className="bg-zinc-800 p-2 rounded col-span-2"
          placeholder="CPF"
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
        />

        {/* Posicao — select, e nao texto livre: a coluna aceita exatamente
            estes quatro valores ou null, entao caixa de texto aqui so servia
            para o admin inventar um valor que o banco recusa. */}
        <select
          className="bg-zinc-800 p-2 rounded col-span-2"
          aria-label="Posicao preferida"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        >
          <option value="">Nao informada</option>
          {/* Valor e o CODIGO que a coluna guarda; rotulo e a palavra. Desde a
              20260821010000 a constante virou `GOL`/`ZAG`/`MEI`/`ATA`, e
              renderiza-la crua deixou o admin escolhendo sigla. */}
          {CANONICAL_POSITIONS.map((codigo) => (
            <option key={codigo} value={codigo}>
              {POSITION_LABELS[codigo]}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleUpdate}
        disabled={saving}
        className="mt-4 bg-blue-600 px-6 py-2 rounded-xl hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar Alteracoes"}
      </button>
    </div>
  );
}
