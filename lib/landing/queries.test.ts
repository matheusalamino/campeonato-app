import { describe, it, expect } from "vitest";
import { aggregateAllTimeScorers, mapChampionRows, aggregateMostTitlesByType, type ChampionRow, type RawPlayerStat } from "./queries";

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
      { id: "c1", name: "Campeonato V", season: "2025", champion_name: "União FC", tournament_type: null },
      { id: "c2", name: "Campeonato IV", season: "2024", champion_name: null, tournament_type: null },
    ];
    const result = mapChampionRows(rows);
    expect(result[0]).toEqual({ id: "c1", name: "Campeonato V", season: "2025", championName: "União FC", tournamentType: null });
    expect(result[1].championName).toBeNull();
  });
});

describe("aggregateMostTitlesByType", () => {
  it("splits title counts by tournament_type", () => {
    const champions: import("./queries").Champion[] = [
      { id: "1", name: "CL 2026", season: "2026", championName: "Time A", tournamentType: "champions_league" },
      { id: "2", name: "CL 2024", season: "2024", championName: "Time A", tournamentType: "champions_league" },
      { id: "3", name: "Copa 2024", season: "2024", championName: "Time B", tournamentType: "copa_do_mundo" },
      { id: "4", name: "CL 2022", season: "2022", championName: "Time B", tournamentType: "champions_league" },
    ];
    const result = aggregateMostTitlesByType(champions, 3);
    expect(result[0]).toMatchObject({ teamName: "Time A", titles: 2, championsLeague: 2, copaDomundo: 0 });
    expect(result[1]).toMatchObject({ teamName: "Time B", titles: 2, championsLeague: 1, copaDomundo: 1 });
  });
});
