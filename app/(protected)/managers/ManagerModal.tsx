"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  ChampionshipManagerRelation,
  ChampionshipManagerWithManager,
  ManagerListItem,
} from "@/types/manager";

type Championship = {
  id: string;
  name: string;
};

export default function ManagerModal({
  open,
  onClose,
  championshipId,
  onSuccess,
  initialData,
}: {
  open: boolean;
  onClose: () => void;
  championshipId: string;
  onSuccess: () => void;
  initialData?: ManagerListItem | null;
}) {
  const supabase = createClient();
  const isEdit = !!initialData;

  // =============================
  // 🧠 STATE BASE
  // =============================
  const initialValues = useMemo(() => {
    return {
      name: initialData?.manager.name || "",
      email: initialData?.manager.email || "",
      cpf: initialData?.manager.cpf || "",
      phrase: initialData?.inspirational_phrase || "",
      photo_url: initialData?.manager.photo_url || null,
    };
  }, [initialData]);

  const [name, setName] = useState(initialValues.name);
  const [email, setEmail] = useState(initialValues.email);
  const [cpf, setCpf] = useState(initialValues.cpf);
  const [phrase, setPhrase] = useState(initialValues.phrase);
  const [file, setFile] = useState<File | null>(null);

  // =============================
  // 🏆 CAMPEONATOS
  // =============================
  const [allChampionships, setAllChampionships] = useState<Championship[]>([]);
  const [linkedChampionships, setLinkedChampionships] = useState<
    Championship[]
  >([]);
  const [selectedChampionship, setSelectedChampionship] = useState("");

  useEffect(() => {
    if (!open) return;

    async function load() {
      // todos campeonatos
      const { data: all } = await supabase
        .from("championships")
        .select("id, name")
        .order("name");

      setAllChampionships(all || []);

      // se estiver editando, busca vínculos
      if (initialData) {
        const { data: linked } = await supabase
          .from("championship_managers")
          .select(
            `
      championship:championships (
        id,
        name
      )
    `,
          )
          .eq("manager_id", initialData.manager.id)
          .returns<ChampionshipManagerRelation[]>();

        const mapped =
          linked?.map((l: ChampionshipManagerRelation) => ({
            id: l.championship.id,
            name: l.championship.name,
          })) || [];

        setLinkedChampionships(mapped);
      } else {
        setLinkedChampionships([]);
      }
    }

    load();
  }, [open]);

  // disponíveis = todos - vinculados
  const availableChampionships = allChampionships.filter(
    (c) => !linkedChampionships.some((l) => l.id === c.id),
  );

  function addChampionship() {
    const found = availableChampionships.find(
      (c) => c.id === selectedChampionship,
    );

    if (!found) return;

    setLinkedChampionships((prev) => [...prev, found]);
    setSelectedChampionship("");
  }

  function removeChampionship(id: string) {
    setLinkedChampionships((prev) => prev.filter((c) => c.id !== id));
  }

  if (!open) return null;

  async function handleSubmit() {
    if (!name) {
      toast.error("Nome obrigatório");
      return;
    }

    let photo_url = initialValues.photo_url;

    // 📸 upload
    if (file) {
      const filePath = `managers/${Date.now()}-${file.name}`;

      const { error } = await supabase.storage
        .from("images")
        .upload(filePath, file);

      if (error) {
        toast.error("Erro ao subir imagem");
        return;
      }

      const { data } = supabase.storage.from("images").getPublicUrl(filePath);
      photo_url = data.publicUrl;
    }

    let managerId = initialData?.manager.id;

    // ✏️ update ou create
    if (isEdit && initialData) {
      await supabase
        .from("managers")
        .update({ name, email, cpf, photo_url })
        .eq("id", managerId);
    } else {
      const { data: manager } = await supabase
        .from("managers")
        .insert({ name, email, cpf, photo_url })
        .select()
        .single();

      if (!manager) {
        toast.error("Erro ao criar cartola");
        return;
      }

      managerId = manager.id;
    }

    // 🔄 sincroniza campeonatos
    // remove todos
    // pega ids atuais no banco
    const { data: existing } = await supabase
      .from("championship_managers")
      .select("championship_id")
      .eq("manager_id", managerId);

    const existingIds = existing?.map((e) => e.championship_id) || [];
    const newIds = linkedChampionships.map((c) => c.id);

    // ❌ remover apenas os que saíram
    const toDelete = existingIds.filter((id) => !newIds.includes(id));

    if (toDelete.length) {
      await supabase
        .from("championship_managers")
        .delete()
        .eq("manager_id", managerId)
        .in("championship_id", toDelete);
    }

    // ➕ adicionar novos
    const toInsert = newIds.filter((id) => !existingIds.includes(id));

    if (toInsert.length) {
      await supabase.from("championship_managers").insert(
        toInsert.map((id) => ({
          manager_id: managerId,
          championship_id: id,
          inspirational_phrase: phrase,
        })),
      );
    }

    toast.success(isEdit ? "Atualizado!" : "Criado!");

    onSuccess();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 p-6 rounded-2xl w-full max-w-lg space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">
          {isEdit ? "Editar Cartola" : "Novo Cartola"}
        </h2>

        {/* FOTO */}
        <div className="flex items-center gap-4">
          {(file || initialValues.photo_url) && (
            <img
              src={
                file ? URL.createObjectURL(file) : initialValues.photo_url || ""
              }
              className="w-16 h-16 rounded-full object-cover"
            />
          )}

          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded flex items-center gap-2 text-sm">
            📤 Foto
            <input
              type="file"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {/* INPUTS */}
        <input
          placeholder="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-zinc-800 p-2 rounded"
        />

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-zinc-800 p-2 rounded"
        />

        <input
          placeholder="CPF"
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
          className="w-full bg-zinc-800 p-2 rounded"
        />

        <input
          placeholder="Frase inspiracional"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          className="w-full bg-zinc-800 p-2 rounded"
        />

        {/* CAMPEONATOS */}
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">Campeonatos</p>

          <div className="flex gap-2">
            <select
              value={selectedChampionship}
              onChange={(e) => setSelectedChampionship(e.target.value)}
              className="flex-1 bg-zinc-800 p-2 rounded"
            >
              <option value="">Selecionar</option>
              {availableChampionships.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              onClick={addChampionship}
              className="bg-green-600 px-3 rounded"
            >
              +
            </button>
          </div>

          {/* LISTA */}
          <div className="space-y-1">
            {linkedChampionships.map((c) => (
              <div
                key={c.id}
                className="flex justify-between bg-zinc-800 px-3 py-1 rounded text-sm"
              >
                {c.name}
                <button onClick={() => removeChampionship(c.id)}>❌</button>
              </div>
            ))}
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 bg-zinc-700 rounded">
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-green-600 rounded"
          >
            {isEdit ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
