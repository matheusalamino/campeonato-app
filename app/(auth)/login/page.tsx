"use client";

import { useState } from "react";
import { useLogin } from "@/features/hooks/useLogin";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, errorMessage } = useLogin();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    await login(email, password);
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
