import { Suspense } from "react";
import DraftPresentation from "./DraftPresentation";

function LoadingFallback() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background:
          "radial-gradient(ellipse 80% 70% at 60% 40%,#3d1a00 0%,#1a0a00 45%,#0a0400 100%)",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap');
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
      `}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "2px solid rgba(200,168,74,.2)",
            borderTopColor: "#c8a84a",
            animation: "spin .9s linear infinite",
          }}
        />
        <p
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: ".72rem",
            letterSpacing: ".35em",
            textTransform: "uppercase",
            color: "rgba(200,168,74,.5)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        >
          Carregando…
        </p>
      </div>
    </div>
  );
}

export default function PresentPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <DraftPresentation />
    </Suspense>
  );
}
