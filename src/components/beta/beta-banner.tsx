import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FlaskConical, X } from "lucide-react";
import { useSession } from "@/lib/current-user";
import { useBetaProgram } from "@/lib/beta";

/** Slim strip naming the build under test, shown to signed-in testers. */
export function BetaBanner() {
  const { user } = useSession();
  const { data } = useBetaProgram();
  // Dismissal is remembered per build label, so a new test build shows again.
  const storageKey = data?.build_label ? `beta-banner-dismissed:${data.build_label}` : null;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!storageKey) return;
    setDismissed(window.localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (!user || !data?.is_enabled || !data.show_banner || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    if (storageKey) window.localStorage.setItem(storageKey, "1");
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
      <FlaskConical className="h-4 w-4 text-primary" />
      <span className="font-medium">{data.program_name}</span>
      <span className="text-muted-foreground">
        Testing {data.build_label} — tell us about any dead links, incorrect data, or improvements that you would like to see!
      </span>
      <Link to="/beta" className="ml-auto font-medium text-primary hover:underline">
        Open the beta hub
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss beta banner"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
