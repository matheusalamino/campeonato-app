import type { NextConfig } from "next";

const supabaseHost = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.imgur.com", pathname: "/**" },
      // Fotos de jogadores vêm de formulários JotForm
      { protocol: "https", hostname: "www.jotform.com", pathname: "/**" },
      { protocol: "https", hostname: "jotform.com", pathname: "/**" },
      // Logos/bandeiras de times ficam em storage do Supabase (staging ou produção)
      { protocol: "https", hostname: "*.supabase.co", pathname: "/**" },
      ...(supabaseHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/**",
            },
          ]
        : []),
    ],
  },
};
export default nextConfig;
