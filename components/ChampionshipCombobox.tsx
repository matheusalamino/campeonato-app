"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { parseSeasonYear } from "@/lib/championship-year";
import { fuzzyMatch, fuzzyRank } from "@/lib/fuzzy";

export type ComboItem = {
  id: string;
  name: string;
  season: string | null;
  created_at: string | null;
};

function label(item: ComboItem): string {
  const year = parseSeasonYear(item.season, item.created_at);
  return year ? `${item.name} - ${year}` : item.name;
}

export function ChampionshipCombobox({
  items,
  value,
  onSelect,
}: {
  items: ComboItem[];
  value: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          parseSeasonYear(b.season, b.created_at) -
            parseSeasonYear(a.season, a.created_at) ||
          a.name.localeCompare(b.name),
      ),
    [items],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return sorted;
    return sorted
      .filter((item) => fuzzyMatch(query, label(item)))
      .sort((a, b) => fuzzyRank(query, label(a)) - fuzzyRank(query, label(b)));
  }, [sorted, query]);

  const selected = items.find((i) => i.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded bg-zinc-800 px-2 py-2 text-left text-sm"
      >
        <span className={selected ? "" : "text-zinc-400"}>
          {selected ? label(selected) : "Selecionar campeonato"}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-zinc-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 shadow-lg">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
              <Search className="h-4 w-4 text-zinc-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-zinc-500">Nenhum resultado</li>
              )}
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-zinc-800 ${
                      item.id === value ? "bg-zinc-800 text-white" : "text-zinc-200"
                    }`}
                  >
                    {label(item)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
