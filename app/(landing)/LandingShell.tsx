"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import LandingHeader from "@/components/landing/LandingHeader";

// Stub replaced in Task 4 when LoginModal is created
function LoginModal(_props: { open: boolean; onClose: () => void }) {
  return null;
}

interface LandingShellProps {
  children: ReactNode;
  liveChampionshipId: string | null;
}

export default function LandingShell({ children, liveChampionshipId }: LandingShellProps) {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div
      className="gala-bg antialiased text-[var(--gala-ink)]"
      style={{ margin: "0 -40px" }}
    >
      <LandingHeader
        liveChampionshipId={liveChampionshipId}
        onLoginClick={() => setLoginOpen(true)}
      />
      {children}
      <footer
        className="mt-16 py-6 text-center text-xs text-[var(--gala-ink-dim)]"
        style={{ borderTop: "1px solid var(--gala-line)" }}
      >
        © LIFAS · Liga de Futebol Adventista de Sorocaba · Sorocaba, SP
      </footer>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
