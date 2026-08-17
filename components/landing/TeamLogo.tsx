import Image from "next/image";

interface TeamLogoProps {
  logoUrl: string | null | undefined;
  name: string;
  size?: number;
}

export default function TeamLogo({ logoUrl, name, size = 20 }: TeamLogoProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="shrink-0 rounded-full flex items-center justify-center font-black text-[var(--gala-gold-2)] bg-[rgba(212,160,23,0.12)]"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}
