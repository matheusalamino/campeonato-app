import { describe, it, expect } from "vitest";
import {
  sumVotePoints,
  buildStatRanking,
  buildVoteRanking,
  groupRankingByPosition,
} from "./match-stats";
import type { PublicPlayer, PublicPlayerStats } from "./types";

const player = (over: Partial<PublicPlayer>): PublicPlayer => ({
  registrationId: "r1",
  championshipId: "c1",
  playerName: "Fulano",
  officialName: null,
  position: "ATA",
  photoUrl: null,
  finalOverall: 80,
  championshipTeamId: "ct1",
  teamName: "Leões",
  teamLogoUrl: null,
  ...over,
});

const stats = (over: Partial<PublicPlayerStats>): PublicPlayerStats => ({
  registrationId: "r1",
  goals: 0,
  assists: 0,
  yellowCards: 0,
  redCards: 0,
  decisiveSaves: 0,
  penaltySaves: 0,
  fouls: 0,
  matchesPlayed: 1,
  ...over,
});

describe("sumVotePoints", () => {
  it("soma pontos por inscrição", () => {
    const totals = sumVotePoints([
      { registration_id: "a", points: 1 },
      { registration_id: "a", points: 3 },
      { registration_id: "b", points: 2 },
    ]);
    expect(totals.get("a")).toBe(4);
    expect(totals.get("b")).toBe(2);
  });
});

describe("buildStatRanking", () => {
  const players = [
    player({ registrationId: "a", playerName: "A" }),
    player({ registrationId: "b", playerName: "B" }),
    player({ registrationId: "c", playerName: "C" }),
  ];
  const all = [
    stats({ registrationId: "a", goals: 2 }),
    stats({ registrationId: "b", goals: 5 }),
    stats({ registrationId: "c", goals: 0 }),
  ];

  it("ordena desc pelo valor e exclui zeros", () => {
    const top = buildStatRanking(all, players, (s) => s.goals, 3);
    expect(top.map((e) => e.registrationId)).toEqual(["b", "a"]);
    expect(top[0].value).toBe(5);
  });

  it("limita ao topN", () => {
    const top = buildStatRanking(all, players, (s) => s.goals, 1);
    expect(top).toHaveLength(1);
  });

  it("ignora stats de jogador desconhecido", () => {
    const top = buildStatRanking(
      [stats({ registrationId: "zz", goals: 9 })],
      players,
      (s) => s.goals,
      3,
    );
    expect(top).toHaveLength(0);
  });
});

describe("buildVoteRanking", () => {
  it("monta ranking a partir dos totais de votos", () => {
    const players = [
      player({ registrationId: "a", playerName: "A" }),
      player({ registrationId: "b", playerName: "B" }),
    ];
    const totals = new Map([
      ["a", 3],
      ["b", 7],
    ]);
    const top = buildVoteRanking(totals, players, 3);
    expect(top.map((e) => e.registrationId)).toEqual(["b", "a"]);
  });
});

describe("groupRankingByPosition", () => {
  it("agrupa por posição, top N por grupo, omite posição vazia", () => {
    const players = [
      player({ registrationId: "a", position: "ATA" }),
      player({ registrationId: "b", position: "MEI" }),
      player({ registrationId: "c", position: "ATA" }),
      player({ registrationId: "d", position: null }),
    ];
    const totals = new Map([
      ["a", 5],
      ["b", 2],
      ["c", 8],
      ["d", 9],
    ]);
    const grouped = groupRankingByPosition(totals, players, 1);
    expect(Object.keys(grouped).sort()).toEqual(["ATA", "MEI"]);
    expect(grouped.ATA[0].registrationId).toBe("c");
    expect(grouped.ATA[0].value).toBe(8);
    expect(grouped.ATA).toHaveLength(1);
  });
});
