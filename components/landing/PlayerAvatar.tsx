interface PlayerAvatarProps {
  photoUrl: string | null;
  name: string;
  sizeClass?: string;
  textSizeClass?: string;
  isFirst?: boolean;
}

export default function PlayerAvatar({
  photoUrl,
  name,
  sizeClass = "h-7 w-7",
  textSizeClass = "text-[9px]",
  isFirst = false,
}: PlayerAvatarProps) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
        style={{
          border: isFirst ? "2px solid var(--gala-gold-2)" : "1px solid var(--gala-line)",
        }}
      />
    );
  }
  return (
    <span
      className={`${sizeClass} ${textSizeClass} shrink-0 flex items-center justify-center rounded-full font-black`}
      style={{
        background: isFirst
          ? "linear-gradient(135deg, var(--gala-gold-1), var(--gala-gold-3))"
          : "var(--gala-bg-1)",
        color: isFirst ? "#050507" : "white",
        border: isFirst ? undefined : "1px solid var(--gala-line)",
      }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
