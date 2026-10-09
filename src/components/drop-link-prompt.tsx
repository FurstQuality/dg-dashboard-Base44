import { useState, type ReactNode } from "react";
import { Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Drop-a-Link — the friendly, one-line prompt that replaces every "data connector".
 * Users just paste a URL (Facebook page, UDisc course, PDGA event, club website…)
 * and the app pulls in the details behind the scenes.
 */
export function DropLinkPrompt({
  title,
  subtitle,
  placeholder = "https://www.facebook.com/YourLocalDGC",
  cta = "Drop it in",
  submittingLabel = "Grabbing details…",
  onSubmit,
  accent = "primary",
  footer,
}: {
  title: string;
  subtitle?: string;
  placeholder?: string;
  cta?: string;
  submittingLabel?: string;
  onSubmit: (url: string) => Promise<void> | void;
  accent?: "primary" | "sky" | "amber";
  footer?: ReactNode;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const ring =
    accent === "sky"
      ? "from-sky-500/15 to-transparent border-sky-500/30"
      : accent === "amber"
        ? "from-amber-500/15 to-transparent border-amber-500/30"
        : "from-primary/15 to-transparent border-primary/30";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(url.trim());
      setUrl("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${ring} p-5`}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-background/60">
          <Link2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="font-display text-lg font-semibold leading-tight">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={placeholder}
              className="bg-background/70"
              disabled={busy}
            />
            <Button type="submit" disabled={!url.trim() || busy} className="sm:min-w-[140px]">
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {submittingLabel}
                </>
              ) : (
                cta
              )}
            </Button>
          </form>
          {footer ? <div className="text-xs text-muted-foreground">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
