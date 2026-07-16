const SIZE_CLASSES = {
  sm: "w-8 h-8 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-24 h-24 text-2xl",
};

function initials(nome?: string | null): string {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

interface AvatarProps {
  profile: { avatar_url?: string | null; nome?: string | null };
  size?: "sm" | "md" | "lg";
}

export function Avatar({ profile, size = "md" }: AvatarProps) {
  const sizeClass = SIZE_CLASSES[size];

  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.nome || "Avatar"}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-accent-glow text-accent font-semibold flex items-center justify-center shrink-0`}
    >
      {initials(profile.nome)}
    </div>
  );
}
