import Link from "next/link";

/** Slim header for the public registration page — lets players go back home. */
export default function InscreverHeader() {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 sm:px-8"
      style={{
        background: "rgba(5,5,7,0.88)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--gala-line)",
      }}
    >
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <span className="text-xl">⚽</span>
        <span
          className="font-serif font-extrabold tracking-widest text-base uppercase"
          style={{
            background:
              "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          LIFAS
        </span>
      </Link>

      <Link
        href="/"
        className="rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest transition-opacity hover:opacity-90 shrink-0"
        style={{ border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)" }}
      >
        ← Início
      </Link>
    </header>
  );
}
