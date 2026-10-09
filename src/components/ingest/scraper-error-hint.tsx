import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Turns raw scraper error strings into actionable guidance for the user.
 * Pass either a thrown Error, a string message, or null/undefined.
 */
export function ScraperErrorHint({ error, url }: { error: unknown; url?: string | null }) {
  const message = normalize(error);
  if (!message) return null;
  const hint = hintFor(message, url ?? "");
  return (
    <Alert variant="destructive" className="border-rose-500/30 bg-rose-500/5">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Couldn't read that link</AlertTitle>
      <AlertDescription className="space-y-1">
        <div className="text-xs opacity-80">{message}</div>
        <div className="text-sm">{hint}</div>
      </AlertDescription>
    </Alert>
  );
}

function normalize(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return null;
  }
}

function hintFor(msg: string, url: string): string {
  const m = msg.toLowerCase();
  const host = safeHost(url);

  if (m.includes("timeout") || m.includes("timed out")) {
    return "The source took too long to respond. Try again in a minute, or paste a more specific page URL.";
  }
  if (host.includes("facebook") || host.includes("fb.com")) {
    return "Facebook blocks automated reads of club and group pages. Paste the link on the Clubs page — we'll ask for the name and location and keep the link attached.";
  }
  if (host.includes("instagram")) {
    return "Instagram blocks automated reads. Add the club by hand on the Clubs page and we'll keep the Instagram link attached.";
  }
  if (m.includes("403") || m.includes("forbidden") || m.includes("blocked")) {
    return "That site is blocking automated reads. Try the club's own website, or add the details by hand.";
  }
  if (m.includes("404") || m.includes("not found")) {
    return "The page doesn't exist. Double-check the URL — some clubs rename their pages.";
  }
  if (m.includes("login") || m.includes("sign in") || m.includes("auth")) {
    return "That page requires a login to view. Use a public URL, or add the data manually via Manual Entry.";
  }

  if (host.includes("pdga.com")) {
    return "Use the event or player page URL directly (not a search result). Or import the PDGA number under Settings → Imports.";
  }
  if (host.includes("udisc")) {
    return "UDisc course URLs work best. For rounds, upload the CSV under Import → UDisc.";
  }
  return "Try a different URL (event or profile page), or add this manually via Manual Entry.";
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
