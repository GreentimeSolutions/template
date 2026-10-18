import type { CSSProperties } from "react";

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
}: {
  src?: string | null;
  alt?: string;
  accessories?: GhostAccessory[];
  className?: string;
  imgClassName?: string;
}) {
  const custom = Boolean(src);
  return (
    <span className={`ghost-avatar ${className}`}>
      <img
        src={src || DEFAULT_GHOST_SRC}
        alt={custom ? "Your ghost picture" : alt}
        draggable={false}
        className={`size-full ${custom ? "object-cover" : "object-contain"} ${imgClassName}`}
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
