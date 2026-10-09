import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search, User as UserIcon, MapPin, HeartHandshake, Loader2, Compass } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { globalSearch, type SearchHit } from "@/lib/search.functions";
import { searchPages } from "@/lib/smart-routes";

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const search = useServerFn(globalSearch);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await search({ data: { q: term } });
        setHits(r);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open, search]);

  const players = hits.filter((h) => h.kind === "player");
  const courses = hits.filter((h) => h.kind === "course");
  const clubs = hits.filter((h) => h.kind === "club");
  const pages = searchPages(q);

  function go(hit: SearchHit) {
    onOpenChange(false);
    setQ("");
    navigate({ to: hit.to as never, params: hit.params as never });
  }

  function goTo(href: string) {
    onOpenChange(false);
    setQ("");
    navigate({ to: href as never });
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search pages, players, courses, clubs…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </div>
        ) : q.trim().length < 2 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Type at least 2 characters to search.
          </div>
        ) : hits.length === 0 && pages.length === 0 ? (
          <CommandEmpty>No results for "{q}".</CommandEmpty>
        ) : null}

        {pages.length > 0 && (
          <CommandGroup heading="Pages and tools">
            {pages.map((p) => (
              <CommandItem
                key={p.href}
                value={`page ${p.label} ${p.keywords?.join(" ") ?? ""}`}
                onSelect={() => goTo(p.href)}
              >
                <Compass className="mr-2 h-4 w-4 text-primary" />
                <span className="font-medium">{p.label}</span>
                <span className="ml-2 truncate text-xs text-muted-foreground">{p.description}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {players.length > 0 && (
          <CommandGroup heading="Players">
            {players.map((h) => (
              <CommandItem
                key={`p-${h.id}`}
                value={`player ${h.title} ${h.subtitle}`}
                onSelect={() => go(h)}
              >
                <UserIcon className="mr-2 h-4 w-4 text-primary" />
                <span className="font-medium">{h.title}</span>
                <span className="ml-2 text-xs text-muted-foreground">{h.subtitle}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {courses.length > 0 && (
          <>
            {players.length > 0 && <CommandSeparator />}
            <CommandGroup heading="Courses">
              {courses.map((h) => (
                <CommandItem
                  key={`c-${h.id}`}
                  value={`course ${h.title} ${h.subtitle}`}
                  onSelect={() => go(h)}
                >
                  <MapPin className="mr-2 h-4 w-4 text-primary" />
                  <span className="font-medium">{h.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{h.subtitle}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {clubs.length > 0 && (
          <>
            {(players.length > 0 || courses.length > 0) && <CommandSeparator />}
            <CommandGroup heading="Clubs">
              {clubs.map((h) => (
                <CommandItem key={`cl-${h.id}`} value={`club ${h.title}`} onSelect={() => go(h)}>
                  <HeartHandshake className="mr-2 h-4 w-4 text-primary" />
                  <span className="font-medium">{h.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** Global keyboard hook: Cmd/Ctrl+K toggles search. */
export function useGlobalSearchHotkey(setOpen: (v: boolean) => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

export { Search };
