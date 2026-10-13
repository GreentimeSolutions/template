import { useEffect, useState } from "react";

export type MiniAppUser = { fid: number; username?: string; displayName?: string };
export type MiniAppState = { checked: boolean; inMiniApp: boolean; user: MiniAppUser | null };

let state: MiniAppState = { checked: false, inMiniApp: false, user: null };
let started = false;
const listeners = new Set<(s: MiniAppState) => void>();

async function detect() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    const inMiniApp = await sdk.isInMiniApp();
    let user: MiniAppUser | null = null;
    if (inMiniApp) {
      try {
        const ctx = await sdk.context;
        if (ctx?.user?.fid) user = { fid: ctx.user.fid, username: ctx.user.username, displayName: ctx.user.displayName };
      } catch {
        /* context optional */
      }
      await sdk.actions.ready();
    }
    state = { checked: true, inMiniApp, user };
  } catch {
    state = { checked: true, inMiniApp: false, user: null };
  }
  for (const l of listeners) l(state);
}

/** Detects the Farcaster Mini App host, hides its splash (ready), and exposes the user context. Plain web stays unaffected. */
export function useMiniApp(): MiniAppState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    void detect();
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
