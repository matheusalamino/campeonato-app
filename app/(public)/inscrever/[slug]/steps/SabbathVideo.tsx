"use client";

import { useState } from "react";

/** "Inevitavel", do Vocal Livre — a escolha do usuario para a tela de repouso. */
const VIDEO_ID = "McVsgxe3eU0";
const SONG = "Inevitável";
const ARTIST = "Vocal Livre";

/**
 * O video da tela de repouso, atras de uma fachada: um cartao desenhado aqui,
 * que so vira iframe depois do clique.
 *
 * Tres motivos, e o segundo e o que manda:
 *
 * 1. O iframe do YouTube arrasta centenas de KB de JavaScript. Quem cai nesta
 *    tela geralmente veio conferir quando a inscricao volta, le, e fecha — pagar
 *    esse peso por padrao seria cobrar de todos por um video que poucos abrem.
 *
 * 2. Nada sai para o Google antes de a pessoa querer. E por isso que tambem NAO
 *    ha thumbnail: a capa viria de `i.ytimg.com` e entregaria o IP do visitante
 *    no primeiro paint — justamente o que o dominio `youtube-nocookie` existe
 *    para evitar. Uma fachada com thumbnail seria fachada so na aparencia.
 *
 * 3. `autoplay=1` no src nao e agressividade: antes do clique o navegador
 *    bloquearia de qualquer jeito, e depois dele o proprio clique e o gesto do
 *    usuario que o autoplay exige. A fachada nao custa um segundo toque.
 *
 * O cartao e um `<button>` de verdade, e nao uma `<div onClick>`: e o unico
 * controle desta tela alem do link do canal, e teclado e leitor de tela
 * precisam alcanca-lo.
 */
export default function SabbathVideo() {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div
        className="w-full overflow-hidden rounded-2xl border"
        style={{ aspectRatio: "16 / 9", borderColor: "rgba(230,180,34,.35)" }}
      >
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0`}
          title={`${SONG} — ${ARTIST}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    // O fundo vem por classe, e nao por `style`: inline vence o `hover:` na
    // cascata, e o realce ao passar o mouse morreria calado.
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="flex w-full items-center gap-3 rounded-2xl border bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
      style={{ borderColor: "rgba(230,180,34,.35)" }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base text-[#050507]"
        aria-hidden="true"
        style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}
      >
        ▶
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-[var(--gala-gold-2)]">{SONG}</span>
        <span className="block truncate text-xs text-[var(--gala-ink-dim)]">{ARTIST}</span>
        <span className="mt-1 block text-[11px] leading-tight text-[var(--gala-ink-dim)]">
          Toque para assistir — o vídeo só carrega depois disso.
        </span>
      </span>
    </button>
  );
}
