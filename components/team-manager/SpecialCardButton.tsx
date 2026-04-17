"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { DashboardCard } from "./DashboardCard";

const supabase = createClient();

type SpecialCardButtonProps = {
  hasUsedSpecialCard: boolean;
  playerHasActiveCard: boolean;
  currentAuctionRegistrationId: string | null;
  teamFull: boolean;
  potBudget: {
    potNumber: number;
    potPosition: string;
    remainingBudget: number;
  } | null;
  championshipId: string;
  championshipManagerId: string;
  onActivated: (useId: string) => void;
};

export function SpecialCardButton({
  hasUsedSpecialCard,
  playerHasActiveCard,
  currentAuctionRegistrationId,
  teamFull,
  potBudget,
  championshipId,
  championshipManagerId,
  onActivated,
}: SpecialCardButtonProps) {
  const [activating, setActivating] = useState(false);

  const disabled =
    hasUsedSpecialCard ||
    playerHasActiveCard ||
    !currentAuctionRegistrationId ||
    teamFull ||
    !potBudget ||
    potBudget.remainingBudget <= 0 ||
    activating;

  async function handleActivate() {
    if (disabled || !potBudget || !currentAuctionRegistrationId) return;

    setActivating(true);
    try {
      const { data, error } = await supabase.rpc("activate_special_card", {
        p_championship_id: championshipId,
        p_cm_id: championshipManagerId,
        p_pot_number: potBudget.potNumber,
        p_pot_position: potBudget.potPosition,
        p_target_registration_id: currentAuctionRegistrationId,
      });

      if (error) throw error;

      const result = data as {
        success: boolean;
        reason?: string;
        id?: string;
      };

      if (!result.success) {
        if (result.reason === "card_already_used") {
          toast.error("Você já usou sua Carta Especial neste campeonato.");
        } else if (result.reason === "player_already_has_card") {
          toast.error(
            "Outro cartola já ativou a Carta Especial para este jogador.",
          );
        } else {
          toast.error("Não foi possível ativar a Carta Especial.");
        }
        return;
      }

      toast.success("Carta Especial ativada!");
      onActivated(result.id!);
    } catch {
      toast.error("Erro ao ativar a Carta Especial. Tente novamente.");
    } finally {
      setActivating(false);
    }
  }

  return (
    <DashboardCard
      icon={<Sparkles className="w-6 h-6 text-yellow-400" />}
      label={
        hasUsedSpecialCard
          ? "Carta Especial (Usada)"
          : activating
            ? "Ativando..."
            : "Carta Especial"
      }
      variant={hasUsedSpecialCard ? "default" : "gold"}
      disabled={disabled}
      onClick={handleActivate}
    />
  );
}
