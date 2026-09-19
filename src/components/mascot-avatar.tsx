"use client";

import { Mascot } from "page-mascot";

const SLOTH_DIRECTIONS = "/mascots/sloth-directions.webp";
const SLOTH_REACTIONS = "/mascots/sloth-reactions.webp";

interface MascotAvatarProps {
  size?: number;
  className?: string;
  label?: string;
  decorative?: boolean;
  staticFrame?: boolean;
}

export function MascotAvatar({ size = 88, className = "", label = "trợ lý lười Koboyo", decorative = false, staticFrame = false }: MascotAvatarProps) {
  if (staticFrame) {
    return <span
      className={`mascot-decorative ${className}`.trim()}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${SLOTH_DIRECTIONS})`,
        backgroundPosition: "50% 50%",
        backgroundRepeat: "no-repeat",
        backgroundSize: "300% 300%",
      }}
    />;
  }

  const mascot = <Mascot directions={SLOTH_DIRECTIONS} reactions={SLOTH_REACTIONS} size={size} className={className} label={label} />;

  if (!decorative) return mascot;

  return <span className="mascot-decorative" aria-hidden="true" inert>{mascot}</span>;
}
