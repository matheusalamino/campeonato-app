"use client";

import { useEffect, useState, useRef } from "react";
import MenuLeilao from "@/components/draftNight/MenuDraft";
import ManagersSlideshow from "@/components/draftNight/ManagersSlideShow";
import TeamsSlideshow from "@/components/draftNight/TeamsSlideShow";
import ChaveamentoSlideshow from "@/components/draftNight/Chaveamentoslideshow";
import JogadoresSlideshow from "@/components/draftNight/JogadoresSlideshow";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

type Step =
  | "intro"
  | "apresentacao"
  | "menu"
  | "cartolas"
  | "times"
  | "chaveamento"
  | "jogadores";

// ── PARTICLES ──────────────────────────────────────────────
function GoldParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    type Particle = {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
      opacityDelta: number;
      color: string;
    };
    const colors = [
      "rgba(255,200,50,",
      "rgba(255,160,20,",
      "rgba(220,130,10,",
      "rgba(255,240,120,",
      "rgba(180,100,0,",
    ];
    const particles: Particle[] = Array.from({ length: 180 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 2.5 + 0.3,
      speedX: (Math.random() - 0.5) * 0.4,
      speedY: -Math.random() * 0.6 - 0.1,
      opacity: Math.random(),
      opacityDelta:
        (Math.random() * 0.008 + 0.002) * (Math.random() > 0.5 ? 1 : -1),
      color: colors[Math.floor(Math.random() * colors.length)]!,
    }));

    let animId: number;
    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        p.opacity += p.opacityDelta;
        if (p.opacity <= 0 || p.opacity >= 1) p.opacityDelta *= -1;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.opacity.toFixed(2)})`;
        ctx.fill();
      }
      for (let i = 0; i < 3; i++) {
        const s = particles[i * 20];
        if (!s) continue;
        const g = ctx.createLinearGradient(s.x, s.y, s.x + 60, s.y - 120);
        g.addColorStop(0, "rgba(255,180,30,0)");
        g.addColorStop(
          0.5,
          `rgba(255,200,60,${(s.opacity * 0.15).toFixed(2)})`,
        );
        g.addColorStop(1, "rgba(255,180,30,0)");
        ctx.beginPath();
        ctx.strokeStyle = g;
        ctx.lineWidth = 1;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + 60, s.y - 120);
        ctx.stroke();
      }
      animId = requestAnimationFrame(animate);
    }
    animate();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 2 }}
    />
  );
}

// ── SLIDE CONTENT ──────────────────────────────────────────
type SlideData = { eyebrow?: string; title: string; body?: string };
const slideContent: Partial<Record<Step, SlideData>> = {
  apresentacao: {
    eyebrow: "Bem-vindos à",
    title: "Copa do Mundo\nSorocaba",
    body: "O campeonato que todo mundo quer jogar.\nUma noite de decisões que mudam tudo.",
  },
  cartolas: {
    eyebrow: "Etapa 1",
    title: "Cartolas",
    body: "Os donos dos times entram em campo.",
  },
  times: {
    eyebrow: "Etapa 2",
    title: "Times",
    body: "Conheça as equipes do campeonato.",
  },
  chaveamento: {
    eyebrow: "Etapa 3",
    title: "Sorteio\nChaveamento",
    body: "O destino de cada equipe será traçado agora.",
  },
  jogadores: {
    eyebrow: "Etapa Final",
    title: "Início do\nLeilão",
    body: "Quem será a primeira escolha?",
  },
};

// ── ICONS ──────────────────────────────────────────────────
const MenuGridIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

// ── INTERNAL STEPS ─────────────────────────────────────────
type InternalStep =
  | "intro"
  | "apresentacao"
  | "menu"
  | "cartolas_intro"
  | "cartolas_show"
  | "times_intro"
  | "times_show"
  | "chaveamento_intro"
  | "chaveamento_show"
  | "jogadores_intro"
  | "jogadores_show";

const FLOW: InternalStep[] = [
  "intro",
  "apresentacao",
  "menu",
  "cartolas_intro",
  "cartolas_show",
  "times_intro",
  "times_show",
  "chaveamento_intro",
  "chaveamento_show",
  "jogadores_intro",
  "jogadores_show",
];

const MENU_MAP: Record<Step, InternalStep> = {
  intro: "intro",
  apresentacao: "apresentacao",
  menu: "menu",
  cartolas: "cartolas_intro",
  times: "times_intro",
  chaveamento: "chaveamento_intro",
  jogadores: "jogadores_intro",
};

const MENU_STEPS: InternalStep[] = [
  "cartolas_intro",
  "cartolas_show",
  "times_intro",
  "times_show",
  "chaveamento_intro",
  "chaveamento_show",
  "jogadores_intro",
  "jogadores_show",
];

const SLIDESHOW_STEPS: InternalStep[] = [
  "cartolas_show",
  "times_show",
  "chaveamento_show",
  "jogadores_show",
];

const internalSlideContent: Partial<Record<InternalStep, SlideData>> = {
  apresentacao: slideContent.apresentacao,
  cartolas_intro: slideContent.cartolas,
  times_intro: slideContent.times,
  chaveamento_intro: slideContent.chaveamento,
  jogadores_intro: slideContent.jogadores,
};

// ── MAIN ───────────────────────────────────────────────────
export default function DraftPresentation() {
  const searchParams = useSearchParams();
  const championshipId = searchParams.get("championshipId");
  const [step, setStep] = useState<InternalStep>("intro");

  const goTo = (s: InternalStep) => setStep(s);
  const goToMenuStep = (menuStep: Step) => setStep(MENU_MAP[menuStep]);

  function next() {
    const i = FLOW.indexOf(step);
    if (FLOW[i + 1]) setStep(FLOW[i + 1]!);
  }
  function prev(e?: React.MouseEvent) {
    e?.stopPropagation();
    const i = FLOW.indexOf(step);
    if (FLOW[i - 1]) setStep(FLOW[i - 1]!);
  }

  const isSlideshowStep = SLIDESHOW_STEPS.includes(step);

  useEffect(() => {
    if (isSlideshowStep) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "m" || e.key === "M") setStep("menu");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [step]);

  if (!championshipId) {
    return <div className="text-white p-8">Campeonato não informado</div>;
  }

  const isFirst = FLOW.indexOf(step) === 0;
  const isLast = FLOW.indexOf(step) === FLOW.length - 1;
  const isMenuStep = MENU_STEPS.includes(step);
  const slide = internalSlideContent[step];
  const clickAdvances = step !== "menu" && !isSlideshowStep;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

        .gold-text{background:linear-gradient(160deg,#fff0a0 0%,#f5c842 18%,#c8860a 36%,#f5c842 52%,#ffe066 68%,#b8720a 84%,#f5c842 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 18px rgba(255,180,30,.55))}
        .gold-text-subtle{background:linear-gradient(135deg,#e8c84a 0%,#f5d76e 50%,#c9952a 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}

        @keyframes fadeIn      {from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeInScale {from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
        @keyframes float       {0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}
        @keyframes glowPulse   {0%,100%{opacity:.6}50%{opacity:1}}

        .animate-fadeIn      {animation:fadeIn .7s ease both}
        .animate-fadeInScale {animation:fadeInScale .8s cubic-bezier(.22,1,.36,1) both}
        .animate-float       {animation:float 4s ease-in-out infinite}
        .animate-glowPulse   {animation:glowPulse 2.5s ease-in-out infinite}

        .slide-title{font-family:'Cinzel',serif;letter-spacing:.12em;text-transform:uppercase;line-height:1.1;white-space:pre-line}
        .divider{display:flex;align-items:center;gap:16px;width:100%;max-width:520px;margin:0 auto}
        .div-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#c8a84a,transparent)}
        .div-gem{width:8px;height:8px;background:#c8a84a;transform:rotate(45deg);flex-shrink:0}

        .step-dot{width:8px;height:8px;border-radius:50%;background:rgba(200,168,74,.3);border:1px solid rgba(200,168,74,.5);transition:all .3s;cursor:pointer}
        .step-dot:hover{background:rgba(200,168,74,.5)}
        .step-dot.active{background:#c8a84a;box-shadow:0 0 10px rgba(200,168,74,.8);transform:scale(1.35)}

        .nav-btn{background:rgba(0,0,0,.45);border:1px solid rgba(200,168,74,.35);color:#c8a84a;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;transition:all .2s;backdrop-filter:blur(8px)}
        .nav-btn:hover{background:rgba(200,168,74,.2);border-color:#c8a84a;box-shadow:0 0 16px rgba(200,168,74,.4)}
        .nav-btn:disabled{opacity:.25;cursor:default}

        .menu-btn{background:rgba(0,0,0,.45);border:1px solid rgba(200,168,74,.35);color:#c8a84a;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;backdrop-filter:blur(8px)}
        .menu-btn:hover{background:rgba(200,168,74,.2);border-color:#c8a84a;box-shadow:0 0 16px rgba(200,168,74,.4)}
        .menu-btn.is-active{background:rgba(200,168,74,.25);border-color:#c8a84a;box-shadow:0 0 20px rgba(200,168,74,.5)}

        .back-badge{position:fixed;top:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.45);border:1px solid rgba(200,168,74,.35);border-radius:99px;padding:6px 16px;backdrop-filter:blur(8px);cursor:pointer;transition:all .2s;z-index:50;font-family:'Cinzel',serif;font-size:.65rem;letter-spacing:.2em;text-transform:uppercase;color:rgba(200,168,74,.7);animation:fadeIn .4s ease both}
        .back-badge:hover{background:rgba(200,168,74,.15);border-color:#c8a84a;color:#c8a84a}
      `}</style>

      <div
        onClick={clickAdvances ? next : undefined}
        className="fixed inset-0 flex items-center justify-center text-center overflow-hidden"
        style={{
          cursor: clickAdvances ? "pointer" : "default",
          fontFamily: "'Cinzel',serif",
        }}
      >
        {/* ── BACKGROUND ── */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 60% 40%,#3d1a00 0%,#1a0a00 45%,#0a0400 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
            mixBlendMode: "multiply",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 55% 55% at 68% 52%,rgba(180,90,0,.45) 0%,transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 15% 15%,rgba(0,0,0,.75) 0%,transparent 65%)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-1/3"
          style={{
            background:
              "linear-gradient(to top,rgba(0,0,0,.7) 0%,transparent 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(125deg,transparent 40%,rgba(255,160,20,.18) 50%,transparent 60%),linear-gradient(135deg,transparent 55%,rgba(255,180,30,.10) 62%,transparent 70%)`,
          }}
        />
        <GoldParticles />
        <div
          className="absolute pointer-events-none animate-glowPulse"
          style={{
            right: "5%",
            top: "5%",
            width: 520,
            height: 520,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(255,140,0,.22) 0%,transparent 70%)",
            filter: "blur(40px)",
            zIndex: 1,
          }}
        />

        {/* Trophy */}
        {step !== "intro" && !isSlideshowStep && (
          <Image
            src="/images/taca.png"
            alt="Taça"
            width={1024}
            height={1536}
            className="absolute animate-float h-auto"
            style={{
              bottom: 16,
              right: 24,
              width: "clamp(90px,14vw,200px)",
              opacity: 0.85,
              filter: "drop-shadow(0 0 30px rgba(255,150,0,.6))",
              zIndex: 3,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Back to menu badge
        {isMenuStep && (
          <button
            className="back-badge"
            onClick={(e) => {
              e.stopPropagation();
              goTo("menu");
            }}
          >
            <MenuGridIcon /> Voltar ao Menu
          </button>
        )} */}

        {/* ── CONTENT ── */}
        <div
          className="z-10 px-6 w-full max-w-6xl flex flex-col items-center justify-center"
          style={{ zIndex: 10 }}
        >
          {step === "intro" && (
            <div className="flex flex-col items-center gap-6 animate-fadeInScale">
              <Image
                src="/images/taca.png"
                alt="Taça"
                width={1024}
                height={1536}
                className="animate-float h-auto"
                style={{
                  width: "clamp(180px,28vw,420px)",
                  filter:
                    "drop-shadow(0 0 60px rgba(255,160,0,.75)) drop-shadow(0 0 120px rgba(200,100,0,.4))",
                }}
              />
              {/* <div className="divider" style={{ maxWidth: 360, marginTop: 8 }}>
                <div className="div-line" />
                <div className="div-gem" />
                <div className="div-line" />
              </div> */}
              {/* <p
                className="gold-text-subtle"
                style={{
                  fontFamily: "'Cinzel',serif",
                  fontSize: "clamp(.75rem,1.5vw,1rem)",
                  letterSpacing: ".35em",
                  textTransform: "uppercase",
                  opacity: 0.8,
                  marginTop: 4,
                }}
              >
                Clique para começar
              </p> */}
            </div>
          )}

          {step === "menu" && <MenuLeilao onNavigate={goToMenuStep} />}

          {step === "cartolas_show" && (
            <ManagersSlideshow
              championshipId={championshipId}
              onFinished={() => goTo("times_intro")}
              onGoToMenu={() => goTo("menu")}
            />
          )}
          {step === "times_show" && (
            <TeamsSlideshow
              championshipId={championshipId}
              onFinished={() => goTo("chaveamento_intro")}
              onGoToMenu={() => goTo("menu")}
            />
          )}
          {step === "chaveamento_show" && (
            <ChaveamentoSlideshow
              championshipId={championshipId}
              onFinished={() => goTo("jogadores_intro")}
              onGoToMenu={() => goTo("menu")}
            />
          )}
          {step === "jogadores_show" && (
            <JogadoresSlideshow
              championshipId={championshipId}
              onFinished={() => goTo("jogadores_show")}
              onGoToMenu={() => goTo("menu")}
            />
          )}

          {/* Generic title slides */}
          {slide && step !== "menu" && !isSlideshowStep && (
            <div className="animate-fadeIn flex flex-col items-center gap-8">
              {slide.eyebrow && (
                <p
                  className="gold-text-subtle"
                  style={{
                    fontFamily: "'Cinzel',serif",
                    fontSize: "clamp(.7rem,1.2vw,.9rem)",
                    letterSpacing: ".4em",
                    textTransform: "uppercase",
                    opacity: 0.7,
                  }}
                >
                  {slide.eyebrow}
                </p>
              )}
              <h1
                className="slide-title gold-text"
                style={{ fontSize: "clamp(2.2rem,6vw,5.5rem)" }}
              >
                {slide.title}
              </h1>
              <div className="divider">
                <div className="div-line" />
                <div className="div-gem" />
                <div className="div-line" />
              </div>
              {slide.body && (
                <p
                  style={{
                    fontFamily: "'EB Garamond',serif",
                    fontSize: "clamp(1rem,2vw,1.4rem)",
                    color: "rgba(240,210,140,.85)",
                    maxWidth: 520,
                    lineHeight: 1.7,
                    letterSpacing: ".02em",
                    whiteSpace: "pre-line",
                  }}
                >
                  {slide.body}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Step dots */}
        {!isSlideshowStep && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-3"
            style={{ zIndex: 50 }}
          >
            {FLOW.filter((s) => !SLIDESHOW_STEPS.includes(s)).map((s) => (
              <div
                key={s}
                className={`step-dot ${step === s ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(s);
                }}
                title={s}
              />
            ))}
          </div>
        )}

        {/* Nav */}
        {!isSlideshowStep && (
          <div
            className="fixed bottom-4 left-4 flex gap-2"
            style={{ zIndex: 50 }}
          >
            <button className="nav-btn" onClick={prev} disabled={isFirst}>
              ←
            </button>
            <button
              className="nav-btn"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              disabled={isLast}
            >
              →
            </button>
            <button
              className={`menu-btn ${step === "menu" ? "is-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                goTo(step === "menu" ? "apresentacao" : "menu");
              }}
              title="Menu (M)"
            >
              <MenuGridIcon />
            </button>
          </div>
        )}

        {/* Hint */}
        {!isSlideshowStep && (
          <div
            className="fixed bottom-5 right-5"
            style={{
              zIndex: 50,
              fontFamily: "'Cinzel',serif",
              fontSize: ".65rem",
              letterSpacing: ".15em",
              color: "rgba(200,168,74,.45)",
              textTransform: "uppercase",
            }}
          >
            Clique ou use ← →
          </div>
        )}
      </div>
    </>
  );
}
