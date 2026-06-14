import type { ReactNode } from "react";

// Layout público: sem auth, sem sidebar — fundo gala em tela cheia
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="gala-bg min-h-screen text-[var(--gala-ink)] antialiased">
      {children}
    </div>
  );
}
