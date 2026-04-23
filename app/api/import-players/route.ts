import { recalculateOverallWithClient } from "@/lib/overall";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Papa from "papaparse";

// ── TYPES ─────────────────────────────
type CSVRow = {
  "Nome Completo"?: string;
  "Nome da Camisa (Uniforme)"?: string;
  Posição?: string;
  CPF?: string;
  Email?: string;
  WhatsApp?: string;
  "Data de Nascimento"?: string;
  "Instagram (opcional)"?: string;
  Altura?: string;
  Peso?: string;
  "Autorização do Responsável Legal"?: string;
  "Foto de Perfil (3x4)"?: string;
  "Visão de Jogo"?: string;
  "Controle de Bola"?: string;
  Finalização?: string;
  Velocidade?: string;
  Desarme?: string;
  Drible?: string;
  Reposição?: string;
  Comunicação?: string;
  Reflexo?: string;
  Posicionamento?: string;
  "Jogo Aéreo"?: string;
  Agilidade?: string;
};

type ImportError = {
  line: number;
  error: string;
  row: CSVRow;
};

// ── HELPERS ─────────────────────────────
function normalizeCPF(cpf?: string) {
  return cpf ? cpf.replace(/\D/g, "") : "";
}

function toNumber(value?: string) {
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function safeString(value?: string) {
  return value?.trim() || null;
}

/** Nota 1–5 das colunas do CSV; células vazias ou inválidas → null. */
function parseSkillRating(value?: string | null): number | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

/**
 * Monta as 6 linhas de self_evaluation alinhadas a EvaluateModal
 * (Goleiro vs linha).
 */
function selfEvalRowsFromCsv(row: CSVRow): { skill: string; rating: number }[] {
  const position = safeString(row["Posição"]);
  const isGk = position === "Goleiro";

  const spec = isGk
    ? (
        [
          ["reposicao", "Reposição"],
          ["comunicacao", "Comunicação"],
          ["posicionamento", "Posicionamento"],
          ["reflexo", "Reflexo"],
          ["jogoAereo", "Jogo Aéreo"],
          ["agilidade", "Agilidade"],
        ] as const
      )
    : (
        [
          ["visao", "Visão de Jogo"],
          ["controle", "Controle de Bola"],
          ["finalizacao", "Finalização"],
          ["velocidade", "Velocidade"],
          ["desarme", "Desarme"],
          ["drible", "Drible"],
        ] as const
      );

  const out: { skill: string; rating: number }[] = [];
  for (const [skill, col] of spec) {
    const raw = row[col as keyof CSVRow];
    const rating = parseSkillRating(raw);
    if (rating === null) {
      throw new Error(
        `Nota inválida ou ausente para a coluna "${col}" (esperado 1–5)`,
      );
    }
    out.push({ skill, rating });
  }
  return out;
}

// ── MAIN ─────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient();

  try {
    const form = await req.formData();
    const file = form.get("file") as File;
    const championshipId = form.get("championshipId") as string;

    if (!file || !championshipId) {
      return NextResponse.json(
        { error: "Arquivo ou campeonato não informado" },
        { status: 400 },
      );
    }

    const text = await file.text();

    const parsed = Papa.parse<CSVRow>(text, {
      header: true,
      skipEmptyLines: true,
    });

    const rows = parsed.data;
    const errors: ImportError[] = [];
    let successCount = 0;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      try {
        const cpf = normalizeCPF(row.CPF);
        if (!cpf) throw new Error("CPF vazio");

        // ── name  = shirt name (what shows on the card / jersey)
        // ── official_name = full legal name
        const officialName = safeString(row["Nome Completo"]);
        const shirtName =
          safeString(row["Nome da Camisa (Uniforme)"]) ?? officialName;

        if (!shirtName) throw new Error("Nome não informado");

        // ── PLAYER ──
        const { data: existing, error: fetchError } = await supabase
          .from("players")
          .select("*")
          .eq("cpf", cpf)
          .maybeSingle();

        if (fetchError) throw new Error(fetchError.message);

        let playerId = existing?.id;

        if (!existing) {
          // 🟢 CREATE PLAYER
          const { data: newPlayer, error } = await supabase
            .from("players")
            .insert({
              name: shirtName, // shirt name → name
              official_name: officialName, // full name  → official_name
              preferred_position: safeString(row["Posição"]),
              cpf,
              email: safeString(row.Email),
              whatsapp: safeString(row.WhatsApp),
              birth_date: safeString(row["Data de Nascimento"]),
              instagram: safeString(row["Instagram (opcional)"]),
              height: toNumber(row.Altura),
              weight: toNumber(row.Peso),
            })
            .select()
            .single();

          if (error || !newPlayer) throw new Error(error?.message);
          playerId = newPlayer.id;
        } else {
          // 🟡 UPDATE PLAYER (guided by CPF)
          const { error: updateError } = await supabase
            .from("players")
            .update({
              name: shirtName, // shirt name → name
              official_name: officialName, // full name  → official_name
              preferred_position: safeString(row["Posição"]),
              email: safeString(row.Email),
              whatsapp: safeString(row.WhatsApp),
              instagram: safeString(row["Instagram (opcional)"]),
              height: toNumber(row.Altura),
              weight: toNumber(row.Peso),
            })
            .eq("id", playerId);

          if (updateError) throw new Error(updateError.message);
        }

        // ── REGISTRATION ──
        const { data: registration, error: regError } = await supabase
          .from("championship_registrations")
          .select("id")
          .eq("championship_id", championshipId)
          .eq("player_id", playerId)
          .maybeSingle();

        if (regError) throw new Error(regError.message);

        let registrationId = registration?.id;

        if (!registration) {
          // 🟢 CREATE REGISTRATION
          const { data: newRegistration, error } = await supabase
            .from("championship_registrations")
            .insert({
              championship_id: championshipId,
              player_id: playerId,
              legal_authorization_link: safeString(
                row["Autorização do Responsável Legal"],
              ),
              profile_photo_link: safeString(row["Foto de Perfil (3x4)"]),
            })
            .select()
            .single();

          if (error || !newRegistration) throw new Error(error?.message);
          registrationId = newRegistration.id;
        } else {
          // 🟡 UPDATE REGISTRATION
          const { error: updateError } = await supabase
            .from("championship_registrations")
            .update({
              legal_authorization_link: safeString(
                row["Autorização do Responsável Legal"],
              ),
              profile_photo_link: safeString(row["Foto de Perfil (3x4)"]),
            })
            .eq("id", registrationId);

          if (updateError) throw new Error(updateError.message);
        }

        if (!registrationId) {
          throw new Error("Falha ao obter id da inscrição no campeonato");
        }

        const selfRows = selfEvalRowsFromCsv(row);

        const { error: delSelfError } = await supabase
          .from("self_evaluations")
          .delete()
          .eq("registration_id", registrationId);

        if (delSelfError) throw new Error(delSelfError.message);

        const { error: selfInsertError } = await supabase
          .from("self_evaluations")
          .insert(
            selfRows.map((e) => ({
              registration_id: registrationId,
              skill: e.skill,
              rating: e.rating,
            })),
          );

        if (selfInsertError) throw new Error(selfInsertError.message);

        await recalculateOverallWithClient(supabase, registrationId);

        successCount++;
      } catch (err: unknown) {
        errors.push({
          line: index + 1,
          error: err instanceof Error ? err.message : "Erro desconhecido",
          row,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: rows.length,
      successCount,
      errorCount: errors.length,
      errors,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Erro interno desconhecido",
      },
      { status: 500 },
    );
  }
}
