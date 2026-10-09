import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapPin,
  Play,
  ListChecks,
  CalendarDays,
  Users,
  BookOpen,
  Activity,
  Trophy,
  Target,
  Sparkles,
  MessageCircle,
  PenSquare,
  ArrowDown,
  ArrowUp,
  Check,
  RotateCcw,
  Settings2,
  X,
  Radio,
  Backpack,
  Bot,
  CloudSun,
  Compass,
  Flag,
  Search,
  ShoppingBag,
  Upload,
} from "lucide-react";

type QuickLink = {
  key: string;
  /** Canonical destination — never a route that only redirects somewhere else. */
  to: string;
  /** Search params the destination needs to open on the right view. */
  search?: Record<string, string>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
};

/** Every quick action a player can pin to their dashboard. */
export const QUICK_LINK_CATALOG: QuickLink[] = [
  {
    key: "start-round",
    to: "/play/pick-course",
    label: "Start a round",
    icon: Play,
    tone: "text-primary",
  },
  { key: "rounds", to: "/play", label: "My rounds", icon: ListChecks, tone: "text-sky-500" },
  {
    key: "tournaments",
    to: "/events",
    label: "Find events",
    icon: Trophy,
    tone: "text-yellow-500",
  },
  {
    key: "schedule",
    to: "/events",
    search: { hub: "mine" },
    label: "My events & calendar",
    icon: CalendarDays,
    tone: "text-amber-500",
  },
  {
    key: "tracker",
    to: "/tracker",
    label: "Crew Tracker",
    icon: Radio,
    tone: "text-red-500",
  },
  { key: "courses", to: "/courses", label: "Courses", icon: Compass, tone: "text-fuchsia-500" },
  {
    key: "course-book",
    to: "/course-book",
    label: "Course Scrapbook",
    icon: BookOpen,
    tone: "text-fuchsia-400",
  },
  {
    key: "game-plan",
    to: "/game-plan",
    label: "Course data & game plan",
    icon: Flag,
    tone: "text-orange-500",
  },
  {
    key: "course-builder",
    to: "/courses?add=1",
    label: "Course Builder",
    icon: MapPin,
    tone: "text-lime-500",
  },
  { key: "practice", to: "/practice", label: "Practice", icon: Target, tone: "text-rose-500" },
  {
    key: "crew",
    to: "/people",
    search: { tab: "friends" },
    label: "Crew & friends",
    icon: Users,
    tone: "text-emerald-500",
  },
  {
    key: "find-players",
    to: "/people",
    label: "Find players",
    icon: Search,
    tone: "text-emerald-400",
  },
  { key: "messages", to: "/dgim", label: "Messages", icon: MessageCircle, tone: "text-indigo-500" },
  { key: "statlink", to: "/stats", label: "DG Statboard", icon: Activity, tone: "text-blue-500" },
  { key: "ace", to: "/ace", label: "Ask Ace", icon: Bot, tone: "text-cyan-500" },
  { key: "bag", to: "/me/bag", label: "My Bag", icon: Backpack, tone: "text-stone-400" },
  {
    key: "marketplace",
    to: "/marketplace",
    label: "Marketplace",
    icon: ShoppingBag,
    tone: "text-green-500",
  },
  {
    key: "import",
    to: "/settings/imports",
    label: "Import & sync",
    icon: Upload,
    tone: "text-slate-400",
  },
  { key: "weather", to: "/weather", label: "Course weather", icon: CloudSun, tone: "text-sky-400" },
  {
    key: "rewards",
    to: "/achievements",
    label: "Rewards",
    icon: Sparkles,
    tone: "text-purple-500",
  },
  {
    key: "studio",
    to: "/studio",
    label: "Creator Studio",
    icon: PenSquare,
    tone: "text-teal-500",
  },
];

const DEFAULT_KEYS = [
  "start-round",
  "rounds",
  "tournaments",
  "tracker",
  "courses",
  "practice",
  "statlink",
];

const STORAGE_KEY = "dgd:quick-links";

function byKey(key: string): QuickLink | undefined {
  return QUICK_LINK_CATALOG.find((l) => l.key === key);
}

function sanitize(keys: unknown): string[] | null {
  if (!Array.isArray(keys)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    if (typeof k !== "string" || seen.has(k) || !byKey(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** Reads/persists the player's pinned quick links (order matters). */
function useQuickLinkPrefs() {
  const [keys, setKeys] = useState<string[]>(DEFAULT_KEYS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = sanitize(JSON.parse(raw));
      if (parsed) setKeys(parsed);
    } catch {
      /* ignore malformed prefs */
    }
  }, []);

  const persist = useCallback((next: string[]) => {
    setKeys(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const reset = useCallback(() => {
    setKeys(DEFAULT_KEYS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const links = useMemo(() => keys.map(byKey).filter((l): l is QuickLink => Boolean(l)), [keys]);

  return { keys, links, persist, reset };
}

/**
 * Horizontal quick-links strip (mobile-only header on /home).
 */
export function QuickLinksWidget() {
  const { links } = useQuickLinkPrefs();

  return (
    <nav
      aria-label="Quick links"
      className="hidden flex-wrap items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5 md:flex"
    >
      {links.map((l) => {
        const Icon = l.icon;
        return (
          <Link
            key={l.key}
            to={l.to}
            search={l.search as never}
            className="group flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition hover:bg-muted hover:text-foreground"
          >
            <Icon className={`h-4 w-4 ${l.tone}`} />
            <span>{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Customizable quick-actions dashboard — used in the home page left rail.
 * Players choose which links appear and in what order; the choice is saved
 * on this device.
 */
export function QuickLinksGrid() {
  const { keys, links, persist, reset } = useQuickLinkPrefs();
  const [editing, setEditing] = useState(false);

  const toggle = (key: string) => {
    persist(keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]);
  };

  const move = (key: string, dir: -1 | 1) => {
    const idx = keys.indexOf(key);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= keys.length) return;
    const copy = [...keys];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    persist(copy);
  };

  const unpinned = QUICK_LINK_CATALOG.filter((l) => !keys.includes(l.key));

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Quick actions
        </h2>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-pressed={editing}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {editing ? (
            <>
              <Check className="h-3 w-3" /> Done
            </>
          ) : (
            <>
              <Settings2 className="h-3 w-3" /> Customize
            </>
          )}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-1.5">
            {links.map((l, i) => {
              const Icon = l.icon;
              return (
                <div
                  key={l.key}
                  className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background/60 px-2 text-[13px] font-medium"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${l.tone}`} />
                  <span className="min-w-0 flex-1 truncate">{l.label}</span>
                  <button
                    type="button"
                    onClick={() => move(l.key, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${l.label} up`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(l.key, 1)}
                    disabled={i === links.length - 1}
                    aria-label={`Move ${l.label} down`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(l.key)}
                    aria-label={`Remove ${l.label}`}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {links.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
                Nothing pinned yet — add the shortcuts you use most.
              </p>
            ) : null}
          </div>

          {unpinned.length > 0 ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Add a shortcut
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unpinned.map((l) => {
                  const Icon = l.icon;
                  return (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => toggle(l.key)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] font-medium text-foreground/85 hover:bg-muted"
                    >
                      <Icon className={`h-3.5 w-3.5 ${l.tone}`} />
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset to defaults
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.key}
                to={l.to}
                search={l.search as never}
                className="group flex h-10 items-center gap-2.5 rounded-lg border border-transparent bg-background/60 px-2.5 text-[13px] font-medium text-foreground/85 transition hover:border-border hover:bg-muted"
              >
                <Icon className={`h-4 w-4 shrink-0 ${l.tone}`} />
                <span className="whitespace-nowrap">{l.label}</span>
              </Link>
            );
          })}
          {links.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
              No shortcuts pinned — tap Customize to pick your own.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
