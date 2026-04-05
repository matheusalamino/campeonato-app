"use client";

type Step =
  | "intro"
  | "apresentacao"
  | "menu"
  | "cartolas"
  | "times"
  | "chaveamento"
  | "jogadores";

type MenuItem = {
  id: Step;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
};

const TrophyIcon = () => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
  >
    <path
      d="M22 8h20v20c0 11-10 18-10 18S22 39 22 28V8z"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path
      d="M22 14H12c0 0 0 10 10 12"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M42 14h10c0 0 0 10-10 12"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M32 46v8M24 54h16"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <circle cx="32" cy="30" r="3" fill="currentColor" opacity="0.5" />
  </svg>
);

const ShieldIcon = () => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
  >
    <path
      d="M32 8L12 16v16c0 14 12 22 20 24 8-2 20-10 20-24V16L32 8z"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path
      d="M24 32l6 6 12-12"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BracketIcon = () => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
  >
    <rect
      x="8"
      y="10"
      width="14"
      height="8"
      rx="2"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <rect
      x="8"
      y="28"
      width="14"
      height="8"
      rx="2"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <rect
      x="8"
      y="46"
      width="14"
      height="8"
      rx="2"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <line
      x1="22"
      y1="14"
      x2="30"
      y2="14"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <line
      x1="22"
      y1="32"
      x2="30"
      y2="32"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <line
      x1="22"
      y1="50"
      x2="30"
      y2="50"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <line
      x1="30"
      y1="14"
      x2="30"
      y2="50"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <line
      x1="30"
      y1="32"
      x2="38"
      y2="32"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <rect
      x="38"
      y="28"
      width="16"
      height="8"
      rx="2"
      stroke="currentColor"
      strokeWidth="2.5"
    />
  </svg>
);

const PersonIcon = () => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
  >
    <circle cx="32" cy="18" r="10" stroke="currentColor" strokeWidth="2.5" />
    <path
      d="M12 54c0-11 9-18 20-18s20 7 20 18"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M44 30c4 1 8 5 8 12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.6"
    />
    <path
      d="M20 30c-4 1-8 5-8 12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.6"
    />
  </svg>
);

const HatIcon = () => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
  >
    {/* Hat brim */}
    <ellipse
      cx="32"
      cy="40"
      rx="24"
      ry="6"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    {/* Hat crown */}
    <path
      d="M14 40V28c0-8 8-14 18-14s18 6 18 14v12"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Hat band */}
    <path
      d="M14 36h36"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.6"
    />
    {/* Ribbon bow */}
    <path
      d="M28 36c0 0-2-2-4-1s-2 3 0 3 4-2 4-2z"
      fill="currentColor"
      opacity="0.7"
    />
    <path
      d="M36 36c0 0 2-2 4-1s2 3 0 3-4-2-4-2z"
      fill="currentColor"
      opacity="0.7"
    />
    <circle cx="32" cy="36" r="2" fill="currentColor" />
  </svg>
);

const menuItems: MenuItem[] = [
  {
    id: "cartolas",
    label: "Cartolas",
    sublabel: "Donos dos times",
    icon: <HatIcon />,
  },
  {
    id: "times",
    label: "Times",
    sublabel: "Equipes do campeonato",
    icon: <ShieldIcon />,
  },
  {
    id: "chaveamento",
    label: "Sorteio Chaveamento",
    sublabel: "Tabela e grupos",
    icon: <BracketIcon />,
  },
  {
    id: "jogadores",
    label: "Jogadores",
    sublabel: "Leilão de atletas",
    icon: <PersonIcon />,
  },
];

type Props = {
  onNavigate: (step: Step) => void;
};

export default function MenuLeilao({ onNavigate }: Props) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

        @keyframes menuFadeIn {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardReveal {
          from { opacity: 0; transform: translateY(40px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .menu-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 32px 20px 24px;
          border-radius: 16px;
          background: rgba(0,0,0,0.35);
          border: 1px solid rgba(200,168,74,0.25);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(.22,1,.36,1);
          backdrop-filter: blur(6px);
          overflow: hidden;
          animation: cardReveal 0.6s cubic-bezier(.22,1,.36,1) both;
        }
        .menu-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 16px;
          background: radial-gradient(ellipse at 50% 0%, rgba(200,168,74,0.12) 0%, transparent 70%);
          opacity: 0;
          transition: opacity 0.3s;
        }
        .menu-card:hover {
          border-color: rgba(200,168,74,0.7);
          background: rgba(0,0,0,0.5);
          transform: translateY(-6px) scale(1.03);
          box-shadow:
            0 0 30px rgba(200,168,74,0.2),
            0 20px 40px rgba(0,0,0,0.4),
            inset 0 1px 0 rgba(255,220,100,0.2);
        }
        .menu-card:hover::before { opacity: 1; }

        .menu-card:hover .card-icon-wrap {
          filter: drop-shadow(0 0 20px rgba(255,180,30,0.8));
          transform: scale(1.08);
        }
        .card-icon-wrap {
          transition: all 0.3s cubic-bezier(.22,1,.36,1);
        }

        .menu-card:hover .card-label {
          background: linear-gradient(135deg, #fff8c0 0%, #f5c842 40%, #c8860a 70%, #f5c842 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .card-label {
          font-family: 'Cinzel', serif;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          background: linear-gradient(135deg, #e8c84a 0%, #f5d76e 50%, #c9952a 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          transition: all 0.3s;
        }

        .corner-gem {
          position: absolute;
          width: 6px; height: 6px;
          background: rgba(200,168,74,0.5);
          transform: rotate(45deg);
          transition: background 0.3s;
        }
        .menu-card:hover .corner-gem { background: rgba(200,168,74,0.9); }
        .corner-gem.tl { top: 10px; left: 10px; }
        .corner-gem.tr { top: 10px; right: 10px; }
        .corner-gem.bl { bottom: 10px; left: 10px; }
        .corner-gem.br { bottom: 10px; right: 10px; }

        .menu-animate { animation: menuFadeIn 0.5s ease both; }
      `}</style>

      <div className="menu-animate flex flex-col items-center gap-10 w-full max-w-5xl px-4">
        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <p
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "clamp(0.65rem, 1vw, 0.8rem)",
              letterSpacing: "0.45em",
              textTransform: "uppercase",
              color: "rgba(200,168,74,0.6)",
            }}
          >
            Noite do Leilão
          </p>
          <h2
            style={{
              fontFamily: "'Cinzel', serif",
              fontWeight: 900,
              fontSize: "clamp(1.8rem, 4vw, 3.2rem)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background:
                "linear-gradient(160deg, #fff0a0 0%, #f5c842 25%, #c8860a 50%, #f5c842 75%, #ffe066 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 14px rgba(255,180,30,0.4))",
            }}
          >
            Selecione a Etapa
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              maxWidth: 400,
            }}
          >
            <div
              style={{
                flex: 1,
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, #c8a84a, transparent)",
              }}
            />
            <div
              style={{
                width: 7,
                height: 7,
                background: "#c8a84a",
                transform: "rotate(45deg)",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                flex: 1,
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, #c8a84a, transparent)",
              }}
            />
          </div>
        </div>

        {/* Grid of cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "20px",
            width: "100%",
          }}
        >
          {menuItems.map((item, i) => (
            <div
              key={item.id}
              className="menu-card"
              style={{ animationDelay: `${i * 0.08}s` }}
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(item.id);
              }}
            >
              {/* Corner gems */}
              <div className="corner-gem tl" />
              <div className="corner-gem tr" />
              <div className="corner-gem bl" />
              <div className="corner-gem br" />

              {/* Icon */}
              <div
                className="card-icon-wrap"
                style={{
                  width: "clamp(64px, 8vw, 96px)",
                  height: "clamp(64px, 8vw, 96px)",
                  color: "#c8a84a",
                  filter: "drop-shadow(0 0 8px rgba(200,168,74,0.4))",
                }}
              >
                {item.icon}
              </div>

              {/* Label */}
              <div className="flex flex-col items-center gap-1">
                <span
                  className="card-label"
                  style={{
                    fontSize: "clamp(0.8rem, 1.4vw, 1rem)",
                    textAlign: "center",
                  }}
                >
                  {item.label}
                </span>
                <span
                  style={{
                    fontFamily: "'EB Garamond', serif",
                    fontStyle: "italic",
                    fontSize: "clamp(0.7rem, 1vw, 0.85rem)",
                    color: "rgba(210,180,100,0.55)",
                    letterSpacing: "0.03em",
                  }}
                >
                  {item.sublabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
