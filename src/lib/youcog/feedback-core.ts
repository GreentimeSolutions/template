/**
 * Feedback survey: the questions and the pure validator, shared by the client
 * form and the server (no I/O, no imports, so unit tests can load it directly).
 */

export type FeedbackQuestion =
  | { id: string; kind: "single"; label: string; options: readonly string[] }
  | { id: string; kind: "multi"; label: string; options: readonly string[] }
  | { id: string; kind: "scale"; label: string; min: number; max: number; minLabel: string; maxLabel: string; naLabel?: string }
  | { id: string; kind: "text"; label: string; placeholder: string; minLength: number; optional?: boolean };

export const TEXT_MAX = 500;
export const COMMENT_MAX = 1000;

export const FEEDBACK_QUESTIONS: readonly FeedbackQuestion[] = [
  { id: "q1", kind: "single", label: "How did you first hear about Youcognito?", options: ["Farcaster", "X", "Telegram", "Base app", "A friend", "Other"] },
  {
    id: "q2",
    kind: "multi",
    label: "Which parts have you tried? Pick all that apply.",
    options: ["Private research chat", "Deep Mission", "Faucet", "Listen boost", "Youcognito Run game", "Stats page"],
  },
  { id: "q3", kind: "text", label: "What did you come to Youcognito for in the first place?", placeholder: "A few words is fine", minLength: 3 },
  { id: "q4", kind: "scale", label: "How easy was it to claim YOUCOG from the faucet?", min: 1, max: 5, minLabel: "Very hard", maxLabel: "Very easy" },
  {
    id: "q5",
    kind: "scale",
    label: "How useful was the private research for what you asked?",
    min: 1,
    max: 5,
    minLabel: "Not useful",
    maxLabel: "Very useful",
    naLabel: "Haven't tried it",
  },
  { id: "q6", kind: "text", label: "Did anything break, confuse you, or feel slow? Tell us where.", placeholder: "Or just say no", minLength: 2 },
  { id: "q7", kind: "single", label: "How often would you come back?", options: ["Daily", "A few times a week", "Weekly", "Rarely"] },
  { id: "q8", kind: "text", label: "What would make you come back every day?", placeholder: "Your idea", minLength: 3 },
  {
    id: "q9",
    kind: "single",
    label: "Which upcoming idea sounds most fun?",
    options: ["Forge DeFi tutorial quests", "NFT upgrades and boosts", "DAO voting with NITO", "More games"],
  },
  { id: "q10", kind: "scale", label: "How likely are you to tell a friend about Youcognito?", min: 0, max: 10, minLabel: "Not likely", maxLabel: "Very likely" },
  { id: "comment", kind: "text", label: "Anything else you want Andy and Youcog to know?", placeholder: "Optional", minLength: 0, optional: true },
];

export type FeedbackAnswers = Record<string, string | string[] | number>;
export type FeedbackCheck = { ok: true; answers: FeedbackAnswers } | { ok: false; reason: string; field?: string };

/** null = "not applicable" for scale questions that allow it. */
const NA = -1;

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** Plausible free text: has letters, isn't one repeated character, isn't a pile of links. */
function plausibleText(s: string): boolean {
  if (!/\p{L}/u.test(s)) return false;
  if (s.length >= 3 && new Set(s.toLowerCase().replace(/\s/g, "")).size <= 1) return false;
  if ((s.match(/https?:\/\//gi) ?? []).length > 2) return false;
  return true;
}

/** Validate and normalize a submission. Unknown keys are dropped. */
export function validateFeedback(raw: unknown): FeedbackCheck {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: FeedbackAnswers = {};
  const texts: string[] = [];
  for (const q of FEEDBACK_QUESTIONS) {
    const v = input[q.id];
    const n = FEEDBACK_QUESTIONS.indexOf(q) + 1;
    const which = q.id === "comment" ? "the last box" : `question ${n}`;
    if (q.kind === "single") {
      if (typeof v !== "string" || !q.options.includes(v)) return { ok: false, reason: `Pick an answer for ${which}.`, field: q.id };
      out[q.id] = v;
    } else if (q.kind === "multi") {
      const list = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];
      if (!list.length || list.some((x) => !q.options.includes(x))) return { ok: false, reason: `Pick at least one for ${which}.`, field: q.id };
      out[q.id] = q.options.filter((o) => list.includes(o));
    } else if (q.kind === "scale") {
      const num = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
      if (q.naLabel && num === NA) {
        out[q.id] = NA;
        continue;
      }
      if (!Number.isInteger(num) || num < q.min || num > q.max) return { ok: false, reason: `Pick a number for ${which}.`, field: q.id };
      out[q.id] = num;
    } else {
      const s = cleanText(v);
      const max = q.optional ? COMMENT_MAX : TEXT_MAX;
      if (q.optional && !s) continue;
      if (!s) return { ok: false, reason: `Answer ${which}.`, field: q.id };
      if (s.length < q.minLength) return { ok: false, reason: `Write a little more for ${which}.`, field: q.id };
      if (s.length > max) return { ok: false, reason: `Keep ${which} under ${max} characters.`, field: q.id };
      if (!plausibleText(s)) return { ok: false, reason: `That answer for ${which} doesn't look real. Write it in words.`, field: q.id };
      out[q.id] = s;
      if (!q.optional) texts.push(s.toLowerCase());
    }
  }
  // The same long text pasted into every short-answer box is a copy-paste farm, not feedback.
  if (texts.length >= 3 && new Set(texts).size === 1 && texts[0].length > 3) {
    return { ok: false, reason: "Each short answer should be its own answer." };
  }
  return { ok: true, answers: out };
}

export const FEEDBACK_NA = NA;
