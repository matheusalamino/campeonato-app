"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Upload } from "lucide-react";

type Team = {
  id: string;
  name: string;
  logo_url?: string;
};

export default function TimesPage() {
  const supabase = createClient();

  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // 🔄 Carregar times (sem warning)
  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data, error } = await supabase.from("teams").select("*");

      if (error) {
        toast.error("Erro ao carregar times");
        console.error(error);
      } else {
        setTeams(data || []);
      }

      setLoading(false);
    })();
  }, [supabase]);

  // 📤 Upload da imagem
  async function uploadLogo(file: File) {
    const fileExt = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("team-logos")
      .upload(fileName, file);

    if (error) {
      console.error(error);
      toast.error("Erro ao fazer upload da imagem");
      return null;
    }

    const { data } = supabase.storage.from("team-logos").getPublicUrl(fileName);

    return data.publicUrl;
  }

  // ➕ Criar time
  async function createTeam() {
    if (!name) {
      toast.warning("Informe o nome do time");
      return;
    }

    setUploading(true);

    try {
      let logoUrl = null;

      if (file) {
        logoUrl = await uploadLogo(file);
        if (!logoUrl) return;
      }

      const { data, error } = await supabase
        .from("teams")
        .insert({
          name,
          logo_url: logoUrl,
        })
        .select()
        .single();

      if (error) throw error;

      // 🔥 Atualização otimista
      setTeams((prev) => [...prev, data]);

      setName("");
      setFile(null);

      toast.success("Time criado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao criar time");
    } finally {
      setUploading(false);
    }
  }

  // 🔄 Atualizar logo
  async function updateLogo(teamId: string, file: File) {
    setUploading(true);

    try {
      const logoUrl = await uploadLogo(file);
      if (!logoUrl) return;

      const { error } = await supabase
        .from("teams")
        .update({ logo_url: logoUrl })
        .eq("id", teamId);

      if (error) throw error;

      // 🔥 Atualização otimista
      setTeams((prev) =>
        prev.map((team) =>
          team.id === teamId ? { ...team, logo_url: logoUrl } : team,
        ),
      );

      toast.success("Logo atualizada!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao atualizar logo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Times</h2>

      {/* CREATE */}
      <div className="flex flex-col md:flex-row gap-4">
        <input
          className="bg-zinc-800 p-2 rounded"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do time"
        />

        <label className="cursor-pointer flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 px-3 py-2 rounded">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <Upload size={18} />
          <span className="text-sm">{file ? file.name : "Logo"}</span>
        </label>

        <button
          onClick={createTeam}
          disabled={uploading}
          className="bg-blue-600 px-4 py-2 rounded disabled:opacity-50"
        >
          {uploading ? "Salvando..." : "Criar"}
        </button>
      </div>

      {/* LOADING */}
      {loading ? (
        <div className="text-zinc-400">Carregando times...</div>
      ) : (
        /* LIST */
        <div className="space-y-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between bg-zinc-800 p-3 rounded"
            >
              <div className="flex items-center gap-3">
                {team.logo_url ? (
                  <Image
                    src={team.logo_url}
                    alt={team.name}
                    width={40}
                    height={40}
                    className="w-10 h-10 object-cover rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 bg-zinc-700 rounded-full" />
                )}

                <span>{team.name}</span>
              </div>

              {/* UPDATE LOGO */}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) updateLogo(team.id, file);
                  }}
                />

                <div className="bg-zinc-700 hover:bg-zinc-600 p-2 rounded">
                  <Upload size={18} />
                </div>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
