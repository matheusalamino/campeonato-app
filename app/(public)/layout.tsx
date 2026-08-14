import type { ReactNode } from "react";
import { Toaster } from "sonner";

// Layout público: sem auth, sem sidebar — fundo gala em tela cheia
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="gala-bg min-h-screen text-[var(--gala-ink)] antialiased">
      {children}
      <Toaster richColors position="top-right" />
    </div>
  );
}
