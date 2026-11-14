/** Browser helpers to save a Lab PNG everywhere: share sheet, download, or Mini App openUrl. */

export type SaveGhostResult = { kind: "shared" | "saved" | "opened" | "hold" | "canceled"; message: string };

export function canShareFiles(file: File): boolean {
  try {
    return typeof navigator !== "undefined"
      && typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [file] });
  } catch (e) {
    console.error("[ghost-lab] canShare failed", e);
    return false;
  }
}

export function triggerDownload(file: File, filename = "youcog-ghost.png") {
  const href = URL.createObjectURL(file);
  try {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(href), 2_000);
  }
}

function isCoarsePointer(): boolean {
  try {
    return !!window.matchMedia?.("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/**
 * After the PNG File is ready: try Web Share (best on mobile), then
 * Mini App openUrl(hostedUrl), then a desktop <a download>. Always
 * returns a user-facing message; never throws out to the click handler.
 */
export async function saveGhostFile(opts: {
  file: File;
  hostedUrl: string;
  inMiniApp: boolean;
}): Promise<SaveGhostResult> {
  const { file, hostedUrl, inMiniApp } = opts;
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title: "Youcog ghost", text: "My Youcog ghost" });
      return { kind: "shared", message: "Shared — pick Photos or Files to keep it." };
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") {
        return { kind: "canceled", message: "Share canceled. Press and hold the image to save it." };
      }
      console.error("[ghost-lab] share failed", e);
    }
  }
  if (inMiniApp) {
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.openUrl(hostedUrl);
      return { kind: "opened", message: "Opened in your browser. Press and hold the image to save it." };
    } catch (e) {
      console.error("[ghost-lab] openUrl failed", e);
      return { kind: "hold", message: "Press and hold the image to save it." };
    }
  }
  try {
    triggerDownload(file);
    if (isCoarsePointer()) {
      return { kind: "saved", message: "Saved. If you don’t see the file, press and hold the image to save it." };
    }
    return { kind: "saved", message: "Saved." };
  } catch (e) {
    console.error("[ghost-lab] download failed", e);
    return { kind: "hold", message: "Press and hold the image to save it." };
  }
}

export async function canvasToPngFile(canvas: HTMLCanvasElement, name = "youcog-ghost.png"): Promise<File> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render PNG"))), "image/png");
  });
  return new File([blob], name, { type: "image/png" });
}
