import type { ReactNode } from "react";
import { ListenButton } from "@/components/youcog/listen";

type BriefProps = {
  text: string;
  onOpenUrl: (url: string) => void;
};

function inlineNodes(text: string, onOpenUrl: (url: string) => void, keyPrefix: string): ReactNode[] {
  const pattern = /\[\[(\d+)\]\]\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const key = `${keyPrefix}-${index}`;
    if (match[1] && match[2]) {
      nodes.push(
        <button
          key={key}
          type="button"
          className="press mx-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-seal border border-line px-1.5 align-baseline text-xs text-ink"
          onClick={() => onOpenUrl(match[2])}
        >
          {match[1]}
        </button>,
      );
    } else if (match[3] && match[4]) {
      nodes.push(
        <button
          key={key}
          type="button"
          className="press text-ink underline decoration-line-strong underline-offset-4"
          onClick={() => onOpenUrl(match[4])}
        >
          {match[3]}
        </button>,
      );
    } else if (match[5]) {
      nodes.push(
        <strong key={key} className="font-medium text-ink">
          {match[5]}
        </strong>,
      );
    }
    last = start + match[0].length;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Brief({ text, onOpenUrl }: BriefProps) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-4 text-base leading-relaxed text-mist">
      {text.trim().length > 1 ? <ListenButton text={text} /> : null}
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter((line) => line.trim().length > 0);
        const heading = lines.length === 1 ? lines[0].match(/^(#{1,3})\s+(.+)$/) : null;
        if (heading) {
          return (
            <h2 key={blockIndex} className="font-display text-2xl font-medium tracking-tight text-ink">
              {inlineNodes(heading[2], onOpenUrl, `h-${blockIndex}`)}
            </h2>
          );
        }
        const isList = lines.length > 0 && lines.every((line) => /^\s*(?:[-*]|\d+\.)\s+/.test(line));
        if (isList) {
          return (
            <ul key={blockIndex} className="flex flex-col gap-2 pl-4">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex} className="list-disc">
                  {inlineNodes(line.replace(/^\s*(?:[-*]|\d+\.)\s+/, ""), onOpenUrl, `l-${blockIndex}-${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={blockIndex}>
            {inlineNodes(lines.join(" "), onOpenUrl, `p-${blockIndex}`)}
          </p>
        );
      })}
    </div>
  );
}
