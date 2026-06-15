"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage("E-mail ou senha invalidos.");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profile?.role === "manager") {
          router.replace("/team-manager");
          router.refresh();
          return;
        }

        if (profile?.role === "auction_fiscal") {
          router.replace("/auction-fiscal");
          router.refresh();
          return;
        }
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setErrorMessage(
        "Nao foi possivel conectar ao Supabase. Verifique se o Supabase local esta rodando ou se o .env.local aponta para o projeto correto.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-lg">
      <h1 className="text-3xl font-bold mb-6 text-center">🏆 Login</h1>

      <form onSubmit={handleLogin} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          className="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Senha"
          value={password}
          className="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg"
          onChange={(e) => setPassword(e.target.value)}
        />

        {errorMessage && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {errorMessage}
          </p>
        )}

        <button
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 transition py-3 rounded-lg font-semibold"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
