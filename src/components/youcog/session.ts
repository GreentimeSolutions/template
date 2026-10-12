import { create } from "zustand";
import type { Source } from "@/lib/youcog/types";

export type SealTab = {
  id: string;
  groupId?: string;
  kind: "brief" | "page";
  title: string;
  url?: string;
  why?: string;
  status: "ready" | "idle" | "reading" | "error";
  body: string;
  error?: string;
};

export type TraceItem = { id: string; text: string };

type SessionState = {
  booted: boolean;
  startedAt: number;
  now: number;
  mission: string;
  address: string;
  running: boolean;
  runError: string | null;
  tabs: SealTab[];
  activeId: string | null;
  trace: TraceItem[];
  boot: () => void;
  tick: () => void;
  setMission: (value: string) => void;
  setAddress: (value: string) => void;
  beginRun: () => void;
  finishRun: (mission: string, brief: string, sources: Source[]) => void;
  failRun: (error: string) => void;
  openAddress: (url: string) => string | null;
  select: (id: string) => void;
  closeTab: (id: string) => void;
  markReading: (id: string) => void;
  retryPage: (id: string) => void;
  fillPage: (id: string, title: string, body: string, url: string) => void;
  failPage: (id: string, error: string) => void;
  burn: () => void;
};

function uid(): string {
  return crypto.randomUUID();
}

function briefTitle(mission: string): string {
  const clean = mission.replace(/\s+/g, " ").trim();
  if (clean.length <= 36) return clean;
  return `${clean.slice(0, 34).trimEnd()}…`;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "page";
  }
}

const empty = {
  mission: "",
  address: "",
  running: false,
  runError: null as string | null,
  tabs: [] as SealTab[],
  activeId: null as string | null,
  trace: [] as TraceItem[],
};

export const useSession = create<SessionState>((set, get) => ({
  booted: false,
  startedAt: 0,
  now: 0,
  ...empty,
  boot: () => {
    if (get().booted) return;
    const now = Date.now();
    set({ booted: true, startedAt: now, now });
  },
  tick: () => set({ now: Date.now() }),
  setMission: (mission) => set({ mission }),
  setAddress: (address) => set({ address }),
  beginRun: () =>
    set((state) => ({
      running: true,
      runError: null,
      trace: [
        ...state.trace,
        { id: uid(), text: "Kept the mission in memory only" },
        { id: uid(), text: "Asked Youcog with storage turned off" },
      ],
    })),
  finishRun: (mission, brief, sources) =>
    set((state) => {
      const groupId = uid();
      const briefTab: SealTab = {
        id: uid(),
        groupId,
        kind: "brief",
        title: briefTitle(mission),
        status: "ready",
        body: brief,
      };
      const pages: SealTab[] = sources.map((source) => ({
        id: uid(),
        groupId,
        kind: "page" as const,
        title: source.title,
        url: source.url,
        why: "Opened by Youcog",
        status: "idle" as const,
        body: "",
      }));
      const tabs = [...state.tabs, briefTab, ...pages].slice(-12);
      const note =
        pages.length === 0
          ? "Answered without opening pages"
          : `Opened ${pages.length} sealed ${pages.length === 1 ? "tab" : "tabs"}`;
      return {
        running: false,
        tabs,
        activeId: briefTab.id,
        trace: [...state.trace, { id: uid(), text: note }],
      };
    }),
  failRun: (error) =>
    set((state) => ({
      running: false,
      runError: error,
      trace: [...state.trace, { id: uid(), text: "The search stopped before any tab opened" }],
    })),
  openAddress: (raw) => {
    let url: string;
    try {
      const parsed = new URL(raw.trim());
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
      url = parsed.toString();
    } catch {
      return null;
    }
    const existing = get().tabs.find((tab) => tab.kind === "page" && tab.url === url);
    if (existing) {
      set({ activeId: existing.id, address: "" });
      return existing.id;
    }
    const tab: SealTab = {
      id: uid(),
      kind: "page",
      title: hostLabel(url),
      url,
      why: "Opened by you",
      status: "idle",
      body: "",
    };
    set((state) => ({
      address: "",
      tabs: [...state.tabs, tab].slice(-12),
      activeId: tab.id,
      trace: [...state.trace, { id: uid(), text: `Sealed a tab for ${hostLabel(url)}` }],
    }));
    return tab.id;
  },
  select: (id) => set({ activeId: id }),
  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      const activeId =
        state.activeId === id ? (tabs[tabs.length - 1]?.id ?? null) : state.activeId;
      return { tabs, activeId };
    }),
  markReading: (id) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, status: "reading", error: undefined } : tab)),
    })),
  retryPage: (id) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, status: "idle", error: undefined, body: "" } : tab,
      ),
    })),
  fillPage: (id, title, body, url) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, status: "ready", title: title || tab.title, body, url } : tab,
      ),
    })),
  failPage: (id, error) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, status: "error", error } : tab)),
    })),
  burn: () => set({ ...empty, now: Date.now(), startedAt: Date.now(), booted: true }),
}));
