// lib/team-soundtracks.ts
const SOUNDTRACKS: Record<string, string> = {
  argentina: "/audios/soundtracks/argentina.mp3",
  brasil:    "/audios/soundtracks/brasil.mp4",
  espanha:   "/audios/soundtracks/espanha.mp3",
  franca:    "/audios/soundtracks/franca.mp3",
  japao:     "/audios/soundtracks/japao.mp4",
  mexico:    "/audios/soundtracks/mexico.mp3",
  portugal:  "/audios/soundtracks/portugal.mp3",
  usa:            "/audios/soundtracks/usa.mp3",
  "estados unidos": "/audios/soundtracks/usa.mp3",
};

const STOP_AFTER_MS = 10_000;

let currentAudio: HTMLAudioElement | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

export function stopTeamSoundtrack(): void {
  if (stopTimer !== null) { clearTimeout(stopTimer); stopTimer = null; }
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

export function playTeamSoundtrack(teamName: string): void {
  if (typeof window === "undefined") return;

  const key = teamName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "");

  const src = SOUNDTRACKS[key];
  if (!src) return;

  if (stopTimer !== null) clearTimeout(stopTimer);
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  try {
    const audio = new Audio(src);
    audio.preload = "auto";
    currentAudio = audio;
    void audio.play().catch(() => undefined);
    stopTimer = setTimeout(() => {
      audio.pause();
      currentAudio = null;
      stopTimer = null;
    }, STOP_AFTER_MS);
  } catch {
    // Silently ignore any playback errors
  }
}
