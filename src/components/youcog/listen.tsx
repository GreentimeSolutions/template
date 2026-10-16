import { useEffect, useRef, useState } from "react";

const cache = new Map<string, string>(); // answer text -> blob URL (reuse, never pay twice in a session)

export function ListenButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [note, setNote] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  async function onClick() {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    setNote(null);
    let url = cache.get(text);
    if (!url) {
      setState("loading");
      try {
        const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { reason?: string };
          throw new Error(j.reason ?? "Couldn't make the audio.");
        }
        url = URL.createObjectURL(await r.blob());
        cache.set(text, url);
      } catch (e) {
        setNote(e instanceof Error ? e.message : "Couldn't make the audio.");
        setState("idle");
        return;
      }
    }
    audio.current?.pause();
    const a = new Audio(url);
    audio.current = a;
    a.onended = () => setState("idle");
    setState("playing");
    a.play().catch(() => setState("idle"));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-testid="listen"
        disabled={state === "loading"}
        onClick={() => void onClick()}
        className="press rounded-seal border border-line px-3 py-1.5 text-sm text-ink disabled:opacity-60"
      >
        {state === "loading" ? "Making audio…" : state === "playing" ? "Stop" : "Listen (Grok Voice)"}
      </button>
      {note ? <span className="text-xs text-mist">{note}</span> : null}
    </div>
  );
}
