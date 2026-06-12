"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { Championship } from "@/types/championship";

type ChampionshipContextType = {
  championship: Championship | null;
  setChampionship: (championship: Championship | null) => void;
};

const ChampionshipContext = createContext<ChampionshipContextType | undefined>(
  undefined,
);

export function ChampionshipProvider({ children }: { children: ReactNode }) {
  const [championship, setChampionship] = useState<Championship | null>(null);

  return (
    <ChampionshipContext.Provider value={{ championship, setChampionship }}>
      {children}
    </ChampionshipContext.Provider>
  );
}

export function useChampionship() {
  const context = useContext(ChampionshipContext);

  if (!context) {
    throw new Error(
      "useChampionship deve ser usado dentro de um ChampionshipProvider",
    );
  }

  return context;
}
