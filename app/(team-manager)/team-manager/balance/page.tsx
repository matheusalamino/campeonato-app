"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTeamManagerDraft } from "@/components/TeamManagerDraftContext";
import { useDraftSession } from "@/features/hooks/useDraftSession";
import { BalanceDisplay } from "@/components/team-manager/BalanceDisplay";
import { TransactionItem } from "@/components/team-manager/TransactionItem";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const supabase = createClient();

type Transaction = {
  id: string;
  reference_id: string | null;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
  pot_number: number | null;
  pot_position: string | null;
};

type FineRow = {
  id: string;
  type: "no_bid_goalkeeper" | "no_bid_player" | "remaining_budget" | "over_budget" | "manual";
  amount: number;
  description: string | null;
  created_at: string;
  pot_number: number | null;
  pot_position: string | null;
};

type AuctionState = {
  open: boolean;
  potNumber: number | null;
  potPosition: string | null;
};

function normalizePotPos(s: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

function transactionMatchesActivePot(
  tx: Transaction,
  active: AuctionState,
): boolean {
  if (!active.open || active.potNumber == null || !active.potPosition?.trim()) {
    return false;
  }
  const wantN = active.potNumber;
  const wantP = normalizePotPos(active.potPosition);

  if (tx.pot_number != null && tx.pot_position != null) {
    return tx.pot_number === wantN && normalizePotPos(tx.pot_position) === wantP;
  }

  const desc = tx.description ?? "";
  const needleA = `Pote ${wantN} (${active.potPosition.trim()})`;
  const needleB = `Pote ${wantN} (${wantP})`;
  return desc.includes(needleA) || desc.toLowerCase().includes(needleB.toLowerCase());
}

function txsEqual(a: Transaction[], b: Transaction[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.reference_id !== y.reference_id ||
      x.type !== y.type ||
      x.amount !== y.amount ||
      (x.description ?? "") !== (y.description ?? "") ||
      x.created_at !== y.created_at ||
      x.pot_number !== y.pot_number ||
      normalizePotPos(x.pot_position) !== normalizePotPos(y.pot_position)
    ) {
      return false;
    }
  }
  return true;
}

function auctionEqual(a: AuctionState, b: AuctionState): boolean {
  return (
    a.open === b.open &&
    a.potNumber === b.potNumber &&
    normalizePotPos(a.potPosition) === normalizePotPos(b.potPosition)
  );
}

export default function BalancePage() {
  const router = useRouter();
  const ctx = useTeamManagerDraft();
  const session = useDraftSession(ctx.championshipId, ctx.championshipManagerId);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [auctionState, setAuctionState] = useState<AuctionState>({
    open: false,
    potNumber: null,
    potPosition: null,
  });
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    let cancelled = false;
    initialLoadDone.current = false;

    async function load() {
      const isInitial = !initialLoadDone.current;
      if (isInitial) setLoading(true);

      try {
        const [{ data: txData }, { data: fineData }, { data: ch }] = await Promise.all([
          supabase
            .from("draft_balance_transactions")
            .select(
              "id, reference_id, type, amount, description, created_at, pot_number, pot_position",
            )
            .eq("championship_manager_id", ctx.championshipManagerId)
            .order("created_at", { ascending: false }),
          supabase
            .from("draft_fines")
            .select("id, type, amount, description, created_at, pot_number, pot_position")
            .eq("championship_manager_id", ctx.championshipManagerId)
            .in("type", ["remaining_budget", "no_bid_player", "no_bid_goalkeeper"])
            .order("created_at", { ascending: false }),
          supabase
            .from("championships")
            .select(
              "draft_auction_open, draft_auction_pot_number, draft_auction_pot_position",
            )
            .eq("id", ctx.championshipId)
            .single(),
        ]);

        if (cancelled) return;

        const baseTx = (txData ?? []) as Transaction[];
        const fineIdsInTx = new Set(
          baseTx.map((tx) => tx.reference_id).filter((id): id is string => Boolean(id)),
        );

        const syntheticFineTx = ((fineData ?? []) as FineRow[])
          .filter((fine) => !fineIdsInTx.has(fine.id))
          .map((fine) => {
            const txType =
              fine.type === "remaining_budget"
                ? "FINE_REMAINING_BUDGET"
                : fine.type === "no_bid_player"
                  ? "FINE_NO_BID_PLAYER"
                  : "FINE_NO_BID_GOALKEEPER";
            return {
              id: `fine:${fine.id}`,
              reference_id: fine.id,
              type: txType,
              amount: -Math.abs(fine.amount),
              description: fine.description,
              created_at: fine.created_at,
              pot_number: fine.pot_number,
              pot_position: fine.pot_position,
            } satisfies Transaction;
          });

        const nextTx = [...baseTx, ...syntheticFineTx].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const nextAuction: AuctionState = {
          open: Boolean(ch?.draft_auction_open),
          potNumber: ch?.draft_auction_pot_number ?? null,
          potPosition: ch?.draft_auction_pot_position?.trim() ?? null,
        };

        setTransactions((prev) =>
          txsEqual(prev, nextTx) ? prev : nextTx,
        );
        setAuctionState((prev) =>
          auctionEqual(prev, nextAuction) ? prev : nextAuction,
        );
      } finally {
        if (!cancelled && isInitial) {
          setLoading(false);
          initialLoadDone.current = true;
        }
      }
    }

    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ctx.championshipManagerId, ctx.championshipId]);

  const potTabTransactions = useMemo(() => {
    return transactions.filter(
      (tx) =>
        transactionMatchesActivePot(tx, auctionState) &&
        (tx.type === "POT_BID_RESERVE" ||
          tx.type === "POT_BID_REFUND" ||
          tx.type === "POT_BUDGET_RETURN" ||
          tx.type === "DRAFT_PLAYER_PURCHASE"),
    );
  }, [transactions, auctionState]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-14 z-30 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Saldo e Extrato</h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-5 max-w-2xl mx-auto w-full space-y-5">
        <BalanceDisplay
          currentBalance={session.currentBalance}
          initialBalance={session.initialBalance}
          potBudget={session.potBudget}
        />

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="all" className="flex-1 text-xs">
              Todos
            </TabsTrigger>
            <TabsTrigger value="pot" className="flex-1 text-xs">
              Pote Atual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-3">
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 px-4">
              {loading ? (
                <p className="py-8 text-center text-sm text-zinc-500">
                  Carregando...
                </p>
              ) : transactions.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">
                  Nenhuma transação encontrada.
                </p>
              ) : (
                transactions.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    type={tx.type}
                    amount={tx.amount}
                    description={tx.description}
                    createdAt={tx.created_at}
                  />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="pot" className="mt-3">
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 px-4">
              {!auctionState.open ? (
                <p className="py-8 text-center text-sm text-zinc-500">
                  Nenhum leilão de pote ativo no momento. Quando o fiscal abrir o
                  leilão, as movimentações deste pote aparecem aqui.
                </p>
              ) : loading ? (
                <p className="py-8 text-center text-sm text-zinc-500">
                  Carregando...
                </p>
              ) : potTabTransactions.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">
                  Nenhuma transação deste pote ainda.
                </p>
              ) : (
                potTabTransactions.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    type={tx.type}
                    amount={tx.amount}
                    description={tx.description}
                    createdAt={tx.created_at}
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
