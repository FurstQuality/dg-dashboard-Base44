import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeCode } from "@/lib/guest-scoring";

export type CodeEntryVariant = "card" | "inline";

type Props = {
  variant?: CodeEntryVariant;
};

/**
 * Public entry point for guests handed a scoring code or QR code.
 * Sends the player to /score?c=CODE — no account needed.
 */
export function CodeEntryCard({ variant = "card" }: Props) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = normalizeCode(code);
    if (clean.length < 4) {
      setHint("Enter the code from your tee sign, QR poster, or text message.");
      return;
    }
    setHint(null);
    void navigate({ to: "/score", search: { c: clean } });
  }

  if (variant === "inline") {
    return (
      <form onSubmit={submit} className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            aria-label="Scoring code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Scoring code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="h-10 font-mono tracking-[0.2em]"
          />
          <Button type="submit" variant="outline" className="h-10 shrink-0">
            Start scoring
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {hint ?? "Playing an event today? Score from your browser — no account needed."}
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2">
        <QrCode className="h-4 w-4 text-primary" />
        <span className="font-semibold">Have a scoring code?</span>
      </div>
      <p className="mb-3 text-[13px] text-muted-foreground">
        {hint ?? "Keep score for today's event right in your browser — no account needed."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="landing-scoring-code" className="sr-only">
          Scoring code
        </Label>
        <Input
          id="landing-scoring-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="h-11 max-w-[180px] font-mono text-lg tracking-[0.25em]"
        />
        <Button type="submit" className="h-11">
          Start scoring
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
