"use client";

import { useEffect, useState } from "react";
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
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
};

export default function BalancePage() {
  const router = useRouter();
  const ctx = useTeamManagerDraft();
  const session = useDraftSession(ctx.championshipId, ctx.championshipManagerId);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("draft_balance_transactions")
        .select("id, type, amount, description, created_at")
        .eq("championship_manager_id", ctx.championshipManagerId)
        .order("created_at", { ascending: false });

      setTransactions(data ?? []);
      setLoading(false);
    }

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [ctx.championshipManagerId]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800 px-4 py-3">
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
              {loading ? (
                <p className="py-8 text-center text-sm text-zinc-500">
                  Carregando...
                </p>
              ) : (() => {
                  const potTx = transactions.filter(
                    (tx) =>
                      tx.type === "POT_BID_RESERVE" ||
                      tx.type === "POT_BID_REFUND" ||
                      tx.type === "POT_BUDGET_RETURN" ||
                      tx.type === "FINE_REMAINING_BUDGET",
                  );
                  return potTx.length === 0 ? (
                    <p className="py-8 text-center text-sm text-zinc-500">
                      Nenhuma transação de pote encontrada.
                    </p>
                  ) : (
                    potTx.map((tx) => (
                      <TransactionItem
                        key={tx.id}
                        type={tx.type}
                        amount={tx.amount}
                        description={tx.description}
                        createdAt={tx.created_at}
                      />
                    ))
                  );
                })()}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
