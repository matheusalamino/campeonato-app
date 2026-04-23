"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  Gavel,
  Sparkles,
  Users,
  Search,
  Shield,
} from "lucide-react";
import { useTeamManagerDraft } from "@/components/TeamManagerDraftContext";
import { useDraftSession } from "@/features/hooks/useDraftSession";
import { BalanceDisplay } from "@/components/team-manager/BalanceDisplay";
import { DashboardCard } from "@/components/team-manager/DashboardCard";
import { JoinBidModal } from "@/components/team-manager/JoinBidModal";
import { SpecialCardButton } from "@/components/team-manager/SpecialCardButton";
import { SpecialCardBidModal } from "@/components/team-manager/SpecialCardBidModal";

export default function TeamManagerDashboard() {
  const router = useRouter();
  const ctx = useTeamManagerDraft();
  const session = useDraftSession(ctx.championshipId, ctx.championshipManagerId);

  const [joinBidOpen, setJoinBidOpen] = useState(false);
  const [specialCardBidOpen, setSpecialCardBidOpen] = useState(false);
  const [activeSpecialCardUseId, setActiveSpecialCardUseId] = useState<
    string | null
  >(null);

  const teamFull = session.teamCount >= 10;

  const qualificationPotLabel =
    session.qualificationWindowOpen &&
    session.qualificationPotNumber !== null &&
    session.qualificationPotPosition
      ? `Pote ${session.qualificationPotNumber} (${session.qualificationPotPosition})`
      : null;

  const joinQualificationEnabled =
    session.qualificationWindowOpen &&
    !teamFull &&
    !session.hasSubmittedQualificationBidForActivePot &&
    session.qualificationPotNumber !== null &&
    Boolean(session.qualificationPotPosition);

  const headerTeamName = session.liveTeamName ?? ctx.teamName;
  const headerTeamLogoUrl = session.liveTeamLogoUrl ?? ctx.teamLogoUrl;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-14 z-30 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          {headerTeamLogoUrl ? (
            <img
              key={session.liveTeamId ?? ctx.teamId ?? "logo"}
              src={headerTeamLogoUrl}
              alt={headerTeamName ?? ""}
              className="w-10 h-10 rounded-full object-cover border-2 border-zinc-700"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
              <Shield className="w-5 h-5 text-zinc-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{ctx.managerName}</p>
            <p className="text-xs text-zinc-400 truncate">
              {headerTeamName ?? "Sem time"} &middot; {ctx.championshipName}
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-5 max-w-2xl mx-auto w-full space-y-5">
        {/* Balance overview */}
        <BalanceDisplay
          currentBalance={session.currentBalance}
          initialBalance={session.initialBalance}
          potBudget={session.potBudget}
        />

        {/* Action grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <DashboardCard
            icon={<Wallet className="w-6 h-6 text-emerald-400" />}
            label="Saldo e Extrato"
            onClick={() => router.push("/team-manager/balance")}
          />

          <DashboardCard
            icon={<Gavel className="w-6 h-6 text-blue-400" />}
            label="Lance de Habilitação"
            disabled={!joinQualificationEnabled}
            onClick={() => {
              if (joinQualificationEnabled) setJoinBidOpen(true);
            }}
          />

          <SpecialCardButton
            hasUsedSpecialCard={session.hasUsedSpecialCard}
            playerHasActiveCard={session.playerHasActiveCard}
            currentAuctionRegistrationId={session.currentAuctionRegistrationId}
            teamFull={teamFull}
            potBudget={session.potBudget}
            championshipId={ctx.championshipId}
            championshipManagerId={ctx.championshipManagerId}
            onActivated={(useId) => {
              setActiveSpecialCardUseId(useId);
              setSpecialCardBidOpen(true);
            }}
          />

          <DashboardCard
            icon={<Users className="w-6 h-6 text-violet-400" />}
            label="Meu Time"
            badge={`${session.teamCount}/10`}
            onClick={() => router.push("/team-manager/squad")}
          />

          <DashboardCard
            icon={<Search className="w-6 h-6 text-cyan-400" />}
            label="Jogadores"
            onClick={() =>
              router.push("/team-manager/search-and-favorite-players")
            }
          />
        </div>
      </main>

      {/* Modals */}
      <JoinBidModal
        open={joinBidOpen}
        onOpenChange={setJoinBidOpen}
        currentBalance={session.currentBalance}
        championshipId={ctx.championshipId}
        championshipManagerId={ctx.championshipManagerId}
        qualificationPotLabel={qualificationPotLabel}
        qualificationWindowOpen={session.qualificationWindowOpen}
        onSuccess={() => session.refetch()}
      />

      <SpecialCardBidModal
        open={specialCardBidOpen}
        onOpenChange={setSpecialCardBidOpen}
        potBudget={session.potBudget}
        specialCardUseId={activeSpecialCardUseId}
        championshipId={ctx.championshipId}
        championshipManagerId={ctx.championshipManagerId}
        onSuccess={() => {
          setActiveSpecialCardUseId(null);
          session.refetch();
        }}
      />
    </div>
  );
}
