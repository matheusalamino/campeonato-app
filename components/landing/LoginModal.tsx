"use client";

import { useEffect, useRef, useState } from "react";
import { useLogin } from "@/features/hooks/useLogin";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, errorMessage, clearError } = useLogin();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      setEmail("");
      setPassword("");
      clearError();
      onClose();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose, clearError]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      dialogRef.current?.close();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await login(email, password);
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-auto w-full max-w-sm rounded-xl p-0 backdrop:bg-[rgba(5,5,7,0.75)] backdrop:backdrop-blur-sm"
      style={{
        background: "#050507",
        borderTop: "2px solid var(--gala-gold-2)",
        borderLeft: "1px solid var(--gala-line)",
        borderRight: "1px solid var(--gala-line)",
        borderBottom: "1px solid var(--gala-line)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.8), 0 -4px 20px rgba(212,160,23,0.2)",
        color: "var(--gala-ink)",
      }}
    >
      <div className="relative p-8">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="absolute right-4 top-4 text-sm text-[var(--gala-ink-dim)] hover:text-white transition-colors"
          aria-label="Fechar"
        >
          ✕
        </button>

        <div className="mb-6 text-center">
          <p className="text-[9px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
            Área Restrita
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Login do Administrador</h2>
          <p className="mt-1 text-xs text-[var(--gala-ink-dim)]">
            Apenas administradores autorizados podem entrar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-[2px] text-[var(--gala-ink-dim)] mb-1">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent pb-2 text-sm text-white outline-none transition-colors"
              style={{ borderBottom: "1px solid var(--gala-line)" }}
              onFocus={(e) => (e.currentTarget.style.borderBottomColor = "var(--gala-gold-2)")}
              onBlur={(e) => (e.currentTarget.style.borderBottomColor = "var(--gala-line)")}
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold uppercase tracking-[2px] text-[var(--gala-ink-dim)] mb-1">
              Senha
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent pb-2 text-sm text-white outline-none transition-colors"
              style={{ borderBottom: "1px solid var(--gala-line)" }}
              onFocus={(e) => (e.currentTarget.style.borderBottomColor = "var(--gala-gold-2)")}
              onBlur={(e) => (e.currentTarget.style.borderBottomColor = "var(--gala-line)")}
            />
          </div>

          {errorMessage && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg py-3 text-xs font-black uppercase tracking-widest text-[#050507] transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))",
            }}
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </dialog>
  );
}
