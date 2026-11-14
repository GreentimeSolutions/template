import { useSyncExternalStore } from "react";
import { decodeLabOutfit, encodeLabOutfit, labGhostPath } from "./ghost-lab-core";
import type { Outfit } from "./ghost-wardrobe";

/**
 * The visitor's custom ghost picture. Stored only in this browser's
 * localStorage. Lab designs are stored as `traits:1,1,1,0,0,0` or
 * `wear:id,id` (not a large data URL). Uploads are data URLs; a Farcaster
 * pfp is a https URL. Never sent to our server.
 */
const KEY = "youcog:ghost-pfp";
const listeners = new Set<() => void>();
let cached: string | null | undefined;

function read(): string | null {
  if (cached !== undefined) return cached;
  try {
    cached = window.localStorage.getItem(KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export function setGhostPfp(value: string | null) {
  cached = value;
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage full or blocked: keep it for this session only */
  }
  for (const l of listeners) l();
}

/** Persist a Lab outfit as the home ghost (traits or wear ids — no wallet needed). */
export function setLabGhostPfp(outfit: Outfit) {
  setGhostPfp(encodeLabOutfit(outfit));
}

export function useGhostPfp(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (typeof window === "undefined" ? null : read()),
    () => null,
  );
}

export function isLabGhostPfp(value: string | null | undefined): boolean {
  return !!value && (value.startsWith("traits:") || value.startsWith("wear:"));
}

export function labOutfitFromPfp(value: string | null | undefined): Outfit | null {
  return isLabGhostPfp(value) ? decodeLabOutfit(value) : null;
}

/** URL an <img> can load. Lab values become /api/ghost-image?... ; others pass through. */
export function resolveGhostPfpSrc(value: string | null | undefined, px?: number): string | null {
  if (!value) return null;
  const outfit = labOutfitFromPfp(value);
  if (outfit) return labGhostPath(outfit, px);
  return value;
}

/** Center-crop and resize a picked image to a 256px square data URL, all in the browser. */
export async function fileToSquareDataUrl(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That picture could not be read."));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    const webp = canvas.toDataURL("image/webp", 0.85);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
