import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Apenas administradores" }, { status: 403 });
  }

  return null;
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const authError = await requireAdmin(supabase);
  if (authError) return authError;

  try {
    const body = (await req.json()) as {
      championshipId: string;
      open: boolean;
      potNumber?: number;
      potPosition?: string;
    };

    const { championshipId, open, potNumber, potPosition } = body;

    if (!championshipId || typeof open !== "boolean") {
      return NextResponse.json(
        { error: "championshipId e open são obrigatórios" },
        { status: 400 },
      );
    }

    if (open) {
      if (
        potNumber === undefined ||
        potNumber === null ||
        !potPosition ||
        typeof potPosition !== "string"
      ) {
        return NextResponse.json(
          {
            error:
              "Com open=true, informe potNumber e potPosition (iguais ao draft_pots)",
          },
          { status: 400 },
        );
      }

      const normalizedPosition = potPosition.trim();
      if (!normalizedPosition) {
        return NextResponse.json(
          { error: "potPosition inválido" },
          { status: 400 },
        );
      }

      if (normalizedPosition.toLowerCase() === "goleiro") {
        return NextResponse.json(
          {
            error:
              "Pote de goleiro não usa habilitação; abra a janela apenas para linha",
          },
          { status: 400 },
        );
      }

      const { data: potRow, error: potErr } = await supabase
        .from("draft_pots")
        .select("id")
        .eq("championship_id", championshipId)
        .eq("pot_number", potNumber)
        .eq("position", normalizedPosition)
        .limit(1)
        .maybeSingle();

      if (potErr) throw potErr;

      if (!potRow) {
        return NextResponse.json(
          {
            error:
              "Nenhum draft_pots encontrado para este campeonato, pote e posição",
          },
          { status: 400 },
        );
      }

      const { error: updErr } = await supabase
        .from("championships")
        .update({
          draft_qualification_window_open: true,
          draft_qualification_pot_number: potNumber,
          draft_qualification_pot_position: normalizedPosition,
        })
        .eq("id", championshipId);

      if (updErr) throw updErr;

      return NextResponse.json({ success: true, open: true });
    }

    const { error: closeErr } = await supabase
      .from("championships")
      .update({
        draft_qualification_window_open: false,
        draft_qualification_pot_number: null,
        draft_qualification_pot_position: null,
      })
      .eq("id", championshipId);

    if (closeErr) throw closeErr;

    return NextResponse.json({ success: true, open: false });
  } catch (err) {
    console.error("qualification-window error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
