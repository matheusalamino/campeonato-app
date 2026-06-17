"use client";

import { useState, useEffect, useCallback } from "react";
import type { Champion } from "@/lib/landing/queries";

const TOTAL = 2;

interface HeroCarouselProps {
  recentChampions: Champion[];
}

export default function HeroCarousel({ recentChampions }: HeroCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setCurrent((c) => (c + 1) % TOTAL), []);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + TOTAL) % TOTAL), []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 5000);
    return () => clearInterval(id);
  }, [paused, next]);

  return (
    <div
      className="relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {/* ── Slide 1: Histórico LIFAS ── */}
        <div className="w-full shrink-0 gala-beams relative overflow-hidden px-6 py-20 md:px-10">
          <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
                Liga de Futebol Adventista de Sorocaba
              </p>
              <h1
                className="mt-3 font-serif text-4xl font-extrabold leading-tight sm:text-5xl"
                style={{
                  background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                O Registro Oficial do Futebol de Sorocaba
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-[var(--gala-ink-dim)]">
                Cada jogo. Cada gol. Cada temporada — preservada.
              </p>
              <a
                href="/statistics"
                className="mt-8 inline-block rounded-lg px-6 py-3 text-sm font-black uppercase tracking-widest text-[#050507] transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))" }}
              >
                Ver Campeonatos →
              </a>
            </div>
            <div
              className="rounded-2xl p-6"
              style={{
                background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
                border: "1px solid var(--gala-line)",
              }}
            >
              <p className="mb-4 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
                Campeões Recentes
              </p>
              {recentChampions.length === 0 ? (
                <p className="text-sm text-[var(--gala-ink-dim)]">Nenhum campeonato registrado ainda.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {recentChampions.map((c, i) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-4 rounded-xl px-4 py-3"
                      style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                        style={{
                          background: i === 0
                            ? "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))"
                            : "var(--gala-panel)",
                          color: i === 0 ? "#050507" : "var(--gala-gold-2)",
                          border: i !== 0 ? "1px solid var(--gala-line)" : undefined,
                        }}
                      >
                        {i === 0 ? "🏆" : c.season ?? "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{c.championName ?? "—"}</p>
                        <p className="text-[10px] text-[var(--gala-ink-dim)]">
                          {c.name}{c.season ? ` · ${c.season}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {[...Array(6)].map((_, i) => (
            <span
              key={i}
              className="gala-dust"
              style={{
                left: `${10 + i * 15}%`,
                width: `${3 + (i % 3)}px`,
                height: `${3 + (i % 3)}px`,
                animationDuration: `${8 + i * 3}s`,
                animationDelay: `${i * 1.5}s`,
              }}
            />
          ))}
        </div>

        {/* ── Slide 2: Champions League Sorocaba 2026 — Em Breve ── */}
        <div
          className="w-full shrink-0 relative overflow-hidden px-6 py-20 md:px-10"
          style={{
            background:
              "radial-gradient(110% 80% at 50% -10%, #1a1030 0%, transparent 55%), linear-gradient(180deg, #0d0b15 0%, #050507 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
          >
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-20"
              style={{ background: "radial-gradient(ellipse, #d4a017 0%, transparent 70%)" }}
            />
          </div>
          <div className="relative z-10 mx-auto max-w-6xl flex flex-col items-center gap-6 text-center">
            <span
              className="inline-flex items-center gap-2 rounded-full px-5 py-1.5 text-[10px] font-black uppercase tracking-[4px]"
              style={{
                background: "rgba(212,160,23,0.12)",
                border: "1px solid var(--gala-gold-2)",
                color: "var(--gala-gold-2)",
              }}
            >
              ⏳ Em Breve
            </span>
            <p className="text-[11px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
              LIFAS · Sorocaba
            </p>
            <h2
              className="font-serif text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl"
              style={{
                background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Champions League<br />Sorocaba 2026
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--gala-ink-dim)]">
              A maior competição do futebol adventista de Sorocaba está chegando. Fique ligado para as novidades.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-6 text-[10px] font-bold uppercase tracking-widest text-[var(--gala-ink-dim)]">
              <span>🏟️ Sorocaba, SP</span>
              <span>📅 2026</span>
              <span>⚽ Em breve</span>
            </div>
          </div>
          {[...Array(10)].map((_, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              aria-hidden
              style={{
                left: `${5 + i * 10}%`,
                top: `${15 + (i % 4) * 20}%`,
                width: `${2 + (i % 2)}px`,
                height: `${2 + (i % 2)}px`,
                background: "var(--gala-gold-2)",
                boxShadow: "0 0 8px var(--gala-gold-2)",
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Arrows ── */}
      <button
        onClick={prev}
        aria-label="Anterior"
        className="absolute left-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full text-lg font-black transition-opacity hover:opacity-100"
        style={{ background: "rgba(5,5,7,0.65)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)", opacity: 0.75 }}
      >
        ‹
      </button>
      <button
        onClick={next}
        aria-label="Próximo"
        className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full text-lg font-black transition-opacity hover:opacity-100"
        style={{ background: "rgba(5,5,7,0.65)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)", opacity: 0.75 }}
      >
        ›
      </button>

      {/* ── Dots ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {Array.from({ length: TOTAL }).map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            aria-label={`Slide ${i + 1}`}
            className="rounded-full transition-all duration-300"
            style={{
              width: current === i ? "20px" : "6px",
              height: "6px",
              background: current === i ? "var(--gala-gold-2)" : "rgba(212,160,23,0.3)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
