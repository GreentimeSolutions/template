import { useEffect, useState } from "react";

/** FLUX 3 Klein meme maker. Renders nothing until the server reports BFL_API_KEY is set. */
export function ImageMaker() {
  const [enabled, setEnabled] = useState(false);
  const [perUser, setPerUser] = useState(2);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/image")
      .then((r) => r.json())
      .then((j: { enabled?: boolean; perUser?: number }) => {
        setEnabled(Boolean(j.enabled));
        if (j.perUser) setPerUser(j.perUser);
      })
      .catch(() => {});
  }, []);
  if (!enabled) return null;

  async function make() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
      const j = (await r.json()) as { ok?: boolean; url?: string; reason?: string };
      if (!j.ok || !j.url) throw new Error(j.reason ?? "Couldn't make that image.");
      setUrl(j.url);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't make that image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      data-testid="image-maker"
      className="flex flex-col gap-3 rounded-shell border border-line bg-panel p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && prompt.trim().length >= 3) void make();
      }}
    >
      <p className="text-sm font-medium text-ink">Make YOUCOG art (FLUX 3)</p>
      <p className="text-xs text-mist">Free, {perUser} per day. Save the image soon, the link expires in about 10 minutes.</p>
      <input
        value={prompt}
        maxLength={300}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. ghost mascot surfing a Base-blue wave"
        className="rounded-seal border border-line bg-transparent px-3 py-2 text-sm text-ink"
      />
      <button type="submit" disabled={busy || prompt.trim().length < 3} className="press rounded-seal border border-line px-3 py-2 text-sm text-ink disabled:opacity-60">
        {busy ? "Making art…" : "Make it"}
      </button>
      {note ? <p className="text-xs text-mist">{note}</p> : null}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt="Your YOUCOG art" className="w-full rounded-seal border border-line" />
        </a>
      ) : null}
    </form>
  );
}
