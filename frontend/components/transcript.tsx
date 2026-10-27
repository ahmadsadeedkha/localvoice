import { cn } from "@/lib/utils";

type Turn = { role: "agent" | "user"; text: string };

// Retell sends the transcript as plain text: "Agent: ...\nUser: ...".
// Lines that don't start with a speaker belong to the previous turn.
function parse(text: string): Turn[] {
  const turns: Turn[] = [];
  for (const line of text.split("\n")) {
    const m = /^(Agent|User):\s?(.*)$/.exec(line);
    if (m) {
      turns.push({
        role: m[1] === "Agent" ? "agent" : "user",
        text: m[2],
      });
    } else if (turns.length && line.trim()) {
      turns[turns.length - 1].text += `\n${line}`;
    }
  }
  return turns;
}

export function Transcript({ text }: { text: string }) {
  const turns = parse(text);

  if (turns.length === 0) {
    return (
      <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
        {text}
      </pre>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {turns.map((t, i) => (
        <li
          key={i}
          className={cn(
            "flex flex-col gap-1",
            t.role === "user" ? "items-end" : "items-start",
          )}
        >
          <span className="text-xs font-medium text-muted-foreground">
            {t.role === "agent" ? "AI agent" : "Caller"}
          </span>
          <p
            className={cn(
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
              t.role === "user"
                ? "bg-primary/10 text-foreground"
                : "bg-muted text-foreground",
            )}
          >
            {t.text}
          </p>
        </li>
      ))}
    </ol>
  );
}
