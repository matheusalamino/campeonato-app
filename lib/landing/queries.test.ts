import { describe, it, expect } from "vitest";
import { aggregateAllTimeScorers, mapChampionRows, type ChampionRow, type RawPlayerStat } from "./queries";

describe("aggregateAllTimeScorers", () => {
  it("sums goals for the same player name across seasons", () => {
    const players = [
      { registration_id: "r1", player_name: "Carlos", photo_url: null },
      { registration_id: "r2", player_name: "Carlos", photo_url: null },
      { registration_id: "r3", player_name: "Marcos", photo_url: null },
    ];
    const stats: RawPlayerStat[] = [
      { registration_id: "r1", goals: 10 },
      { registration_id: "r2", goals: 8 },
      { registration_id: "r3", goals: 5 },
    ];
    const result = aggregateAllTimeScorers(players, stats);
    expect(result[0]).toEqual({ playerName: "Carlos", totalGoals: 18, photoUrl: null });
    expect(result[1]).toEqual({ playerName: "Marcos", totalGoals: 5, photoUrl: null });
  });

  it("returns sorted descending by totalGoals", () => {
    const players = [
      { registration_id: "r1", player_name: "A", photo_url: null },
      { registration_id: "r2", player_name: "B", photo_url: null },
    ];
    const stats: RawPlayerStat[] = [
      { registration_id: "r1", goals: 3 },
      { registration_id: "r2", goals: 7 },
    ];
    const result = aggregateAllTimeScorers(players, stats);
    expect(result[0].playerName).toBe("B");
    expect(result[1].playerName).toBe("A");
  });

  it("excludes players with zero goals", () => {
    const players = [{ registration_id: "r1", player_name: "A", photo_url: null }];
    const stats: RawPlayerStat[] = [{ registration_id: "r1", goals: 0 }];
    const result = aggregateAllTimeScorers(players, stats);
    expect(result).toHaveLength(0);
  });
});

describe("mapChampionRows", () => {
  it("maps DB rows to typed champion objects", () => {
    const rows: ChampionRow[] = [
      { id: "c1", name: "Campeonato V", season: "2025", champion_name: "União FC" },
      { id: "c2", name: "Campeonato IV", season: "2024", champion_name: null },
    ];
    const result = mapChampionRows(rows);
    expect(result[0]).toEqual({ id: "c1", name: "Campeonato V", season: "2025", championName: "União FC" });
    expect(result[1].championName).toBeNull();
  });
});
