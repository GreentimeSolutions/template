import { useSyncExternalStore } from "react";

/**
 * The visitor's custom ghost picture. Stored only in this browser's
 * localStorage (a data URL for uploads, or the Farcaster pfp URL). Never sent
 * to our server.
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
