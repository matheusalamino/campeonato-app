"use client";

import { createContext, useContext, ReactNode } from "react";

export type TeamManagerDraftData = {
  managerId: string;
  managerName: string;
  managerPhotoUrl: string | null;
  championshipManagerId: string;
  championshipId: string;
  championshipName: string;
  teamId: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
};

const TeamManagerDraftContext = createContext<TeamManagerDraftData | undefined>(
  undefined,
);

export function TeamManagerDraftProvider({
  data,
  children,
}: {
  data: TeamManagerDraftData;
  children: ReactNode;
}) {
  return (
    <TeamManagerDraftContext.Provider value={data}>
      {children}
    </TeamManagerDraftContext.Provider>
  );
}

export function useTeamManagerDraft() {
  const context = useContext(TeamManagerDraftContext);

  if (!context) {
    throw new Error(
      "useTeamManagerDraft must be used within TeamManagerDraftProvider",
    );
  }

  return context;
}
