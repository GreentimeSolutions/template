import type { CSSProperties } from "react";
import { isLabGhostPfp, resolveGhostPfpSrc } from "@/lib/youcog/ghost-pfp";

/**
 * A layer drawn over the ghost picture. Future NFT accessories or upgrades
 * (hats, glasses, auras...) plug in here as extra layers; none ship yet.
 */
export type GhostAccessory = {
  id: string;
  src: string;
  alt?: string;
  /** Position/size within the frame, e.g. { top: "-8%", left: "10%", width: "80%" }. */
  style?: CSSProperties;
  z?: number;
};

export const DEFAULT_GHOST_SRC = "/youcog-mark.png";

export function GhostAvatar({
  src,
  alt = "Youcog in a hat, glasses, and trench coat",
  accessories = [],
  className = "",
  imgClassName = "",
  /** Integer pixel scale for Lab portraits (6 = 192px in the size-52 home card). */
  px = 6,
}: {
  src?: string | null;
  alt?: string;
  accessories?: GhostAccessory[];
  className?: string;
  imgClassName?: string;
  px?: number;
}) {
  const lab = isLabGhostPfp(src);
  const custom = Boolean(src);
  const resolved = lab ? resolveGhostPfpSrc(src, px) : (src || DEFAULT_GHOST_SRC);
  return (
    <span className={`ghost-avatar ${lab ? "ghost-avatar-lab" : ""} ${className}`} data-lab-ghost={lab || undefined}>
      <img
        src={resolved || DEFAULT_GHOST_SRC}
        alt={lab || custom ? "Your ghost picture" : alt}
        draggable={false}
        width={lab ? 32 * px : undefined}
        height={lab ? 32 * px : undefined}
        className={`size-full ${lab ? "ghost-avatar-lab-img" : custom ? "object-cover" : "object-contain"} ${imgClassName}`}
      />
      {accessories.map((a) => (
        <img
          key={a.id}
          src={a.src}
          alt={a.alt ?? ""}
          draggable={false}
          className="pointer-events-none absolute"
          style={{ zIndex: a.z ?? 1, ...a.style }}
        />
      ))}
    </span>
  );
}
