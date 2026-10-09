import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Home,
  Bell,
  Users,
  UserPlus,
  MapPin,
  Trophy,
  ClipboardCheck,
  Target,
  LogOut,
  User as UserIcon,
  Search,
  Disc,
  Award,
  Gift,
  TrendingUp,
  ChevronDown,
  Play,
  BarChart3,
  Settings,
  QrCode,
  Shield,
  Sprout,
  Calendar,
  HeartHandshake,
  MessageCircle,
  Menu,
  Plus,
  Gauge,
  Bookmark,
  Palette,
  Store,
  PackageSearch,
  CloudSun,
  Sparkles,
  Wallet,
  FlaskConical,
  ListChecks,
  Lightbulb,
  Scale,
  BookOpen,
  Wrench,
} from "lucide-react";
import { MoreNavSheet, type MoreNavGroup } from "@/components/mobile/more-nav-sheet";
import { BottomNavCustomizer } from "@/components/mobile/bottom-nav-customizer";
import { useBottomNavPrefs, BOTTOM_NAV_SLOTS } from "@/hooks/use-bottom-nav-prefs";
import type { ReactNode, ComponentType, CSSProperties } from "react";
import { useMemo, useState } from "react";
import { navMascotFor, navThemeFor, resolveNavAccent } from "@/lib/nav-theme";
import { useTheme } from "@/lib/theme-context";
import { GlobalSearch, useGlobalSearchHotkey } from "@/components/global-search";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useMyProfile, initials, useIsSuperAdmin } from "@/lib/current-user";
import { NotificationsBell } from "@/components/notifications-bell";
import { PlayStatusMenu } from "@/components/play/play-status-menu";
import { useUnreadNotifications } from "@/lib/use-unread-notifications";
import { XpPill } from "@/components/xp-pill";
import { ThemeStudioButton } from "@/components/theme-studio";
import { useDirectorAccess } from "@/lib/director-access";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrackedEvents } from "@/lib/tracker-watchlist.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";
import { useCreatorAccess } from "@/lib/creator-access";
import { LocationPermissionBanner } from "@/components/location-permission-banner";
import { UdiscImportReminder } from "@/components/imports/udisc-import-reminder";
import { mascotUrl } from "@/components/mascot";
import { PlaySubnav } from "@/components/play/play-subnav";
import { HeaderAsideSlot } from "@/components/hub-tabs";
import { PlayWeatherBanner } from "@/components/play/play-weather-banner";
import { CommunitySubnav } from "@/components/community/community-subnav";
import { SECTION_PATHS, sectionFor } from "@/lib/section-nav";
import { useCommunityBadges } from "@/components/community/use-community-badges";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandMark } from "@/components/brand/brand-mark";
import { BrandedPageBackdrop } from "@/components/branded-page-frame";
import { MascotSceneBand } from "@/components/mascot-scene-band";
import { SmartBackButton } from "@/components/smart-back-button";

type NavChild = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  desc?: string;
  search?: Record<string, string>;
};
type NavHub = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  match: string[];
  children: NavChild[];
  defaultTo?: string;
};

// Compact labels for the mobile bottom nav so every slot fits at 375px.
const MOBILE_NAV_LABELS: Record<string, string> = {
  "Event Director": "Director",
  "Tournament Tracker": "Tracker",
  "Live Trackers": "Trackers",
  "Social Feed": "Feed",
  Community: "Community",
  "DG Statboard": "Statboard",
  Notifications: "Alerts",
  "DGIM messages": "Chat",
  "My bag": "Bag",
};

// The seven sections that get a permanent slot in the phone bottom bar, laid
// out as two rows of four with "More" always holding the final slot.
// Ordered by how often a player reaches for each one during a normal week.
// "director" only exists for approved hosts, so it drops out for everyone else
// and Community takes the seventh slot instead.
const MOBILE_NAV_KEYS = [
  "play",
  "events",
  "tracker",
  "courses",
  "insights",
  "director",
  "community",
];

// Compact labels for the desktop header between md and 2xl, where the full
// names ("Event Director", "Tournament Tracker") crowd the utilities column.
const HEADER_NAV_LABELS: Record<string, string> = {
  "Event Management": "Event Manager",
  "Live Trackers": "Trackers",
};

// Primary navigation: Play (home) · · Event Director · Community · Tournament Tracker · StatLink.
// Data has been demoted to Profile → Settings → Connections & Imports.
const HUBS: NavHub[] = [
  {
    key: "play",
    label: "Play",
    icon: Play,
    match: SECTION_PATHS.play,
    defaultTo: "/play",
    children: [
      {
        to: "/play/pick-course",
        label: "Start a round",
        icon: Play,
        desc: "Pick a course and start scoring",
      },
      {
        to: "/practice",
        label: "Practice",
        icon: Target,
        desc: "Driving range & putting green history",
      },
      {
        to: "/rulebook",
        label: "Game rulebook",
        icon: BookOpen,
        desc: "Wolf, skins, doubles throw styles — every game explained",
      },
      {
        to: "/rules",
        label: "DGD Rules & Standards",
        icon: BookOpen,
        desc: "Official rules of play for DGD-sanctioned events",
      },
      {
        to: "/weather",
        label: "Course weather",
        icon: CloudSun,
        desc: "Wind, temp and conditions before you tee off",
      },
    ],
  },
  {
    key: "events",
    label: "Events",
    icon: Calendar,
    defaultTo: "/events",
    match: SECTION_PATHS.events,
    children: [
      {
        to: "/events",
        label: "Discover",
        icon: Calendar,
        desc: "Tournaments, leagues and Series near you",
      },
      {
        to: "/events",
        search: { hub: "mine" },
        label: "My Events",
        icon: Calendar,
        desc: "Everything you're registered for — list or calendar view",
      },
      {
        to: "/events",
        search: { hub: "community" },
        label: "Community events",
        icon: Sprout,
        desc: "Clean-ups, clinics, and meetups near you",
      },
      {
        to: "/tracker/events",
        label: "Event tracker",
        icon: Bookmark,
        desc: "Follow live and upcoming events — tee times, pools and results",
      },
    ],
  },
  {
    key: "courses",
    label: "Courses",
    icon: MapPin,
    defaultTo: "/courses",
    match: SECTION_PATHS.courses,
    children: [
      {
        to: "/courses",
        label: "Course directory",
        icon: MapPin,
        desc: "Search every course by name, city or state",
      },
      {
        to: "/game-plan",
        label: "Course analytics",
        icon: Gauge,
        desc: "Compare courses, see how you'll play them, and what to practice first",
      },

      {
        to: "/course-book",
        label: "Course scrapbook",
        icon: BookOpen,
        desc: "Your notes, photos and hole-by-hole memories from courses you've played",
      },
      {
        to: "/courses/needs-mapping",
        label: "Help map courses",
        icon: MapPin,
        desc: "Courses nationwide still missing tees or baskets",
      },
      {
        to: "/courses/steward-queue",
        label: "Course work queue",
        icon: Wrench,
        desc: "Open condition reports on courses you look after",
      },
    ],
  },

  {
    key: "community",

    label: "Community",
    icon: Users,
    defaultTo: "/community",
    match: SECTION_PATHS.community,
    children: [
      { to: "/community", label: "Feed", icon: Home, desc: "Posts from friends, clubs and players near you" },
      {
        to: "/studio",
        label: "Creator Studio",
        icon: BarChart3,
        desc: "Create, schedule & publish content to the feed",
      },
      {
        to: "/people",
        label: "People",
        icon: Users,
        desc: "Directory, friends & crews, and player tracking — all in one place",
      },
      { to: "/clubs", label: "Clubs", icon: HeartHandshake, desc: "Local & online clubs" },
      {
        to: "/arena",
        label: "Friends Arena",
        icon: Award,
        desc: "Challenges, King of the Hill & badges",
      },
      {
        to: "/dgim",
        label: "DGIM",
        icon: MessageCircle,
        desc: "Instant messenger for friends & events",
      },
      {
        to: "/marketplace",
        label: "Marketplace",
        icon: Store,
        desc: "Buy, sell and trade discs with local players",
      },
      {
        to: "/lost-found",
        label: "Lost & Found",
        icon: PackageSearch,
        desc: "Report a lost disc or return one you found",
      },
    ],
  },
  {
    key: "director",
    label: "Event Management",
    icon: Shield,
    defaultTo: "/director",
    match: SECTION_PATHS.director,
    children: [
      { to: "/director", label: "Overview", icon: Shield, desc: "Everything you run, at a glance" },
      { to: "/director/new", label: "Create event", icon: Plus, desc: "Tournament, league, Series or community event" },
      {
        to: "/director/registrations",
        label: "Registrations",
        icon: Users,
        desc: "Entries, waitlists & payment status",
      },
      {
        to: "/director/check-in",
        label: "Check-in",
        icon: QrCode,
        desc: "Scan passes & sign players in on site",
      },
      {
        to: "/director/tournaments",
        label: "Tournaments",
        icon: Trophy,
        desc: "Registrations, live scoring & payouts",
      },
      {
        to: "/director/leagues",
        label: "Leagues",
        icon: Calendar,
        desc: "Weekly nights, standings & sign-ups",
      },
      {
        to: "/director/clubs",
        label: "Clubs",
        icon: HeartHandshake,
        desc: "Members, announcements & club events",
      },
      {
        to: "/director/profile",
        label: "Profile",
        icon: UserIcon,
        desc: "The organizer identity players see",
      },
    ],
  },
  {
    key: "tracker",
    label: "Live Trackers",
    icon: Target,
    defaultTo: "/tracker",
    match: SECTION_PATHS.tracker,
    children: [
      {
        to: "/tracker",
        label: "Overview",
        icon: Bookmark,
        desc: "Jump into event, player, or course tracking",
      },
      {
        to: "/tracker/events",
        label: "Event tracker",
        icon: Bookmark,
        desc: "Follow live and upcoming events — tee times, pools and results",
      },

      {
        to: "/tracker/players",
        label: "Players & crews",
        icon: Target,
        desc: "Look up any player, manage your crews, and follow their ratings and finishes",
      },
      {
        to: "/game-plan",
        label: "Course analytics",
        icon: Gauge,
        desc: "Compare courses and see how you'll play them",
      },
    ],
  },

  {
    key: "insights",
    label: "DG Statboard",
    icon: TrendingUp,
    defaultTo: "/stats",
    match: SECTION_PATHS.statlink,
    children: [
      {
        to: "/stats",
        label: "DG StatBoard",
        icon: BarChart3,
        desc: "Rating, history, forecast, and every player tool",
      },
      {
        to: "/ace",
        label: "Ask Ace",
        icon: Sparkles,
        desc: "Your caddy — coaching answers built on your own rounds",
      },
      {
        to: "/insights",
        label: "Insights",
        icon: Lightbulb,
        desc: "What's improving, what's slipping, and what to work on",
      },
      {
        to: "/compare",
        label: "Compare players",
        icon: Scale,
        desc: "Put your numbers next to anyone else's",
      },
      {
        to: "/what-if",
        label: "What-if scenarios",
        icon: FlaskConical,
        desc: "See how a future round would move your rating",
      },
      {
        to: "/data-review",
        label: "Data review",
        icon: ClipboardCheck,
        desc: "Unfinished rounds, unverified scores, and pending submissions",
      },
    ],
  },
];

// Personal destinations that can also hold a bottom-bar slot, so the two-row
// bar can be filled with the places players tap most, not just sections.
const BOTTOM_NAV_EXTRAS: NavHub[] = [
  {
    key: "notifications",
    label: "Notifications",
    icon: Bell,
    defaultTo: "/notifications",
    match: ["/notifications"],
    children: [{ to: "/notifications", label: "Notifications", icon: Bell }],
  },
  {
    key: "messages",
    label: "DGIM messages",
    icon: MessageCircle,
    defaultTo: "/dgim",
    match: ["/dgim"],
    children: [{ to: "/dgim", label: "DGIM messages", icon: MessageCircle }],
  },
  {
    key: "bag",
    label: "My bag",
    icon: Disc,
    defaultTo: "/me/bag",
    match: ["/me/bag"],
    children: [{ to: "/me/bag", label: "My bag", icon: Disc }],
  },
  {
    key: "profile",
    label: "Profile",
    icon: UserIcon,
    defaultTo: "/me",
    match: ["/me"],
    children: [{ to: "/me", label: "Profile", icon: UserIcon }],
  },
  {
    key: "achievements",
    label: "Achievements",
    icon: Award,
    defaultTo: "/achievements",
    match: ["/achievements", "/rewards"],
    children: [
      { to: "/achievements", label: "Achievements", icon: Award },
      { to: "/rewards", label: "Contributor rewards", icon: Gift },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    defaultTo: "/settings",
    match: ["/settings"],
    children: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
];

import { BetaBanner } from "@/components/beta/beta-banner";
import { BetaFeedbackDialog, BetaFeedbackWidget } from "@/components/beta/beta-feedback-widget";
import { MessengerDock } from "@/components/dgim/messenger-dock";
import { useAutoDataRefresh } from "@/hooks/use-auto-data-refresh";
import { useLiveRoundSync } from "@/hooks/use-live-round-sync";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeSection = sectionFor(pathname);
  const { navColorMode } = useTheme();
  const navigate = useNavigate();
  const { user } = useSession();
  useAutoDataRefresh(user?.id);
  useLiveRoundSync(user?.id);
  const { profile } = useMyProfile(user);
  const unread = useUnreadNotifications(user?.id);
  const { unreadMessages, friendRequests } = useCommunityBadges();
  const isAdmin = useIsSuperAdmin(user);
  // Hosting and publishing are approved roles, so their entries only appear for
  // players who hold them. Route-level gates still protect direct visits.
  const { isDirector } = useDirectorAccess();
  const { isCreator } = useCreatorAccess();
  const visibleHubs = useMemo(
    () =>
      HUBS.filter((hub) => hub.key !== "director" || isDirector).map((hub) => ({
        ...hub,
        children: hub.children.filter((child) => {
          if (child.to === "/director") return isDirector;
          if (child.to === "/studio") return isCreator;
          return true;
        }),
      })),
    [isDirector, isCreator],
  );
  // A single shared read of the tracked-event watchlist so the bottom bar can
  // show a live dot when something a player follows is scoring right now.
  const trackedEventsFn = useServerFn(listTrackedEvents);
  const { data: trackedEvents } = useQuery({
    queryKey: trackerKeys.watchlist(),
    queryFn: () => trackedEventsFn(),
    enabled: !!user,
    staleTime: TRACKER_STALE.watchlist,
  });
  const liveTracked = (trackedEvents?.events ?? []).filter((e) => e.phase === "live").length;

  const [searchOpen, setSearchOpen] = useState(false);
  useGlobalSearchHotkey(setSearchOpen);
  const [moreOpen, setMoreOpen] = useState(false);
  const [betaOpen, setBetaOpen] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [bottomNavOpen, setBottomNavOpen] = useState(false);

  // Bottom-bar buttons a player picked, falling back to the stock two rows when
  // they have not customized it. Sections and personal destinations both qualify.
  const pinnableHubs = useMemo(() => [...visibleHubs, ...BOTTOM_NAV_EXTRAS], [visibleHubs]);
  const hubKeys = useMemo(() => pinnableHubs.map((h) => h.key), [pinnableHubs]);
  // Never more than the seven fixed slots: "More" always holds the eighth, so
  // an extra eligible section (Community for hosts who also see Director) must
  // drop out instead of pushing the bar onto a third row.
  const defaultBottomKeys = useMemo(
    () => MOBILE_NAV_KEYS.filter((k) => hubKeys.includes(k)).slice(0, BOTTOM_NAV_SLOTS),
    [hubKeys],
  );
  const {
    keys: bottomNavKeys,
    save: saveBottomNav,
    reset: resetBottomNav,
    saveAsAppDefault: saveBottomNavAsAppDefault,
  } = useBottomNavPrefs(hubKeys, defaultBottomKeys);
  const bottomHubs = useMemo(
    () =>
      bottomNavKeys
        .map((key) => pinnableHubs.find((h) => h.key === key))
        .filter((h): h is (typeof pinnableHubs)[number] => Boolean(h)),
    [bottomNavKeys, pinnableHubs],
  );

  // Sections without a permanent bottom-bar slot, plus every hub's tools and
  // the account utilities that are desktop-only in the header.
  const moreGroups: MoreNavGroup[] = [
    {
      key: "account",
      label: "Me",
      items: [
        { to: "/me", label: "Profile & DGD Rating", icon: UserIcon },
        { to: "/stats", label: "Statboard", icon: BarChart3 },
        { to: "/tracker", label: "Trackers", icon: Trophy },
        ...(isDirector ? [{ to: "/director", label: "Director mode", icon: ClipboardCheck }] : []),
        { to: "/notifications", label: "Notifications", icon: Bell },
        { to: "/dgim", label: "DGIM messages", icon: MessageCircle },
        { to: "/achievements", label: "Achievements", icon: Award },
        { to: "/rewards", label: "Contributor rewards", icon: Gift },
        { to: "/challenges", label: "Quests & challenges", icon: Trophy },

        { to: "/me/bag", label: "My bag", icon: Disc },
        { to: "/marketplace/mine", label: "My listings", icon: Store },
        { to: "/me", label: "Profile", icon: UserIcon },
        { to: "/billing", label: "Plan & billing", icon: Wallet },
        { to: "/settings", label: "Settings", icon: Settings },
        ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield }] : []),
      ],
    },
    {
      key: "sections",
      label: "Sections",
      items: visibleHubs.map((h) => ({
        to: h.defaultTo ?? h.children[0].to,
        label: h.label,
        icon: h.icon,
      })),
    },
    ...visibleHubs.map((h) => ({
      key: h.key,
      label: h.label,
      items: h.children.map((c) => ({
        to: c.to,
        label: c.label,
        icon: c.icon,
        desc: c.desc,
      })),
    })),
  ];
  const moreActive =
    moreOpen ||
    visibleHubs
      .filter((h) => !bottomNavKeys.includes(h.key))
      .some((h) => h.match.some((m) => pathname.startsWith(m)));

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh overflow-x-clip">
        {/*
          Global header — 4-column responsive grid:
            [Logo] [Search] [MainNav] [Utilities]
          The utilities column is `auto` (shrink-0 children); search + nav can
          both compress via minmax(0, …). No overlaps, no negative margins,
          no absolute positioning inside utilities. The dashboard toolbar
          renders in its own sticky bar per-page — never inside the header.
        */}
        <header
          className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="mx-auto w-full max-w-[1840px] px-3 sm:px-4 lg:px-6">
            <div className="flex h-16 items-center gap-2 sm:gap-3">
              {/* 1. Logo — compact until xl to reserve space for nav+utilities */}
              <Link
                to="/play"
                className="flex shrink-0 items-center gap-2"
                aria-label="DG Dashboard home"
              >
                <BrandMark variant="compact" className="xl:hidden" />
                <BrandMark variant="horizontal" className="hidden xl:inline-flex" />
              </Link>

              {/* 2. Universal search — full bar only on very wide screens, where
                it does not steal room from the primary nav; icon-only below. */}
              <div className="hidden min-w-0 flex-1 lg:block lg:max-w-[320px]">
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="relative flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background pl-8 pr-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                  aria-label="Search"
                >
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4" />
                  <span className="truncate">Search players, clubs, courses…</span>
                  <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground 2xl:inline">
                    ⌘K
                  </kbd>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>

              <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

              {/* 4. Utility controls — fixed order, reserved widths, no overlap.
                 Order: Ask Ace → Notifications → Progress → Personalization → Avatar.
                 Dashboard toolbars render inline on their own pages, never here. */}
              <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
                {/* Ask Ace — label at xl+, icon+tooltip below; shown on every size
                    now that the mobile floating button is gone */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/ace"
                      aria-label="Ask Ace"
                      className={
                        "group inline-flex h-10 shrink-0 items-center gap-2 rounded-full pl-1 pr-1 text-sm transition-colors 2xl:pr-3 " +
                        (pathname.startsWith("/ace")
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground")
                      }
                    >
                      <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/30">
                        <img
                          src={mascotUrl("ace", "default")}
                          alt=""
                          className="h-7 w-7 object-contain transition-transform group-hover:scale-110"
                          draggable={false}
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
                      </span>
                      <span className="hidden font-graphic text-[13px] leading-none 2xl:inline">
                        Ask Ace
                      </span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="2xl:hidden">
                    Ask Ace
                  </TooltipContent>
                </Tooltip>

                {/* My events & calendar — one tap from anywhere */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/schedule"
                      aria-label="My events and calendar"
                      className={
                        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors " +
                        (pathname.startsWith("/schedule")
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground")
                      }
                    >
                      <Calendar className="h-5 w-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">My events &amp; calendar</TooltipContent>
                </Tooltip>

                {/* DGIM — messaging lives in the header at every width, phone included */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/dgim"
                      aria-label="Open DGIM messages"
                      className={
                        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors " +
                        (pathname.startsWith("/dgim") || pathname.startsWith("/messages")
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground")
                      }
                    >
                      <MessageCircle className="h-5 w-5" />
                      {unreadMessages > 0 ? (
                        <span className="absolute right-1 top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-background">
                          {unreadMessages > 99 ? "99+" : unreadMessages}
                        </span>
                      ) : null}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">DGIM messages</TooltipContent>
                </Tooltip>

                {/* Friend requests waiting on you — one tap to answer them */}
                {friendRequests > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to="/friends"
                        aria-label={`${friendRequests} friend request${friendRequests === 1 ? "" : "s"} waiting for your answer`}
                        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-community-green hover:bg-muted"
                      >
                        <UserPlus className="h-5 w-5" />
                        <span className="absolute right-1 top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-background">
                          {friendRequests > 99 ? "99+" : friendRequests}
                        </span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {friendRequests === 1
                        ? "1 friend request waiting"
                        : `${friendRequests} friend requests waiting`}
                    </TooltipContent>
                  </Tooltip>
                ) : null}

                {/* Play status — always visible so friends see what you're doing */}
                <PlayStatusMenu />

                {/* Notifications — inline dropdown panel, no page navigation required */}
                <NotificationsBell unread={unread} />

                {/* Player progress — compact at all widths, full XP breakdown lives in profile menu */}
                <div className="hidden md:block">
                  <XpPill variant="compact" />
                </div>

                {/* Personalization lives in the profile menu */}
                <ThemeStudioButton
                  open={personalizeOpen}
                  onOpenChange={setPersonalizeOpen}
                  hideTrigger
                />

                {/* Profile avatar */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 rounded-full"
                      aria-label="Account menu"
                    >
                      <Avatar className="h-8 w-8">
                        {profile?.avatar_url ? (
                          <AvatarImage src={profile.avatar_url} alt={profile.display_name} />
                        ) : null}
                        <AvatarFallback>{initials(profile?.display_name)}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel>
                      <div className="text-sm font-medium">{profile?.display_name ?? "Player"}</div>
                      <div className="text-xs text-muted-foreground">
                        @{profile?.username ?? "…"}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {profile ? (
                      <DropdownMenuItem asChild>
                        <Link to="/u/$username" params={{ username: profile.username }}>
                          <UserIcon className="mr-2 h-4 w-4" /> View profile
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem asChild>
                      <Link to="/me/edit">Edit profile</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/me/bag">
                        <Disc className="mr-2 h-4 w-4" /> My Bag
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/challenges">
                        <Trophy className="mr-2 h-4 w-4" /> Achievements & Quests
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        setPersonalizeOpen(true);
                      }}
                    >
                      <Palette className="mr-2 h-4 w-4" /> Personalize
                    </DropdownMenuItem>

                    <DropdownMenuItem asChild>
                      <Link to="/billing">
                        <Wallet className="mr-2 h-4 w-4" /> Plan & billing
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/settings">
                        <Settings className="mr-2 h-4 w-4" /> Settings
                      </Link>
                    </DropdownMenuItem>

                    {isAdmin ? (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/admin">Admin dashboard</Link>
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    <DropdownMenuItem asChild>
                      <Link to="/beta">Beta program</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut}>
                      <LogOut className="mr-2 h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* 3. Main navigation */}
            <nav
              className="hidden flex-wrap items-center justify-start gap-1.5 pb-2 md:flex xl:justify-center"
              aria-label="Primary"
            >
              {visibleHubs.map((hub) => {
                const Icon = hub.icon;
                const active = hub.match.some((m) => pathname.startsWith(m));
                const hubPath = hub.defaultTo ?? hub.children[0]?.to ?? "/home";
                const hubTheme = navThemeFor(hubPath);
                const hubEmblem = navMascotFor(hubPath);
                const hubStyle = {
                  ["--nav-accent" as string]: resolveNavAccent(hubTheme.accent, navColorMode),
                } as CSSProperties;
                if (hub.children.length === 1) {
                  const to = hub.defaultTo ?? hub.children[0]?.to ?? "/home";
                  return (
                    <Link
                      key={hub.key}
                      to={to}
                      style={hubStyle}
                      className={
                        "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-all " +
                        (active
                          ? "bg-[color-mix(in_oklab,var(--nav-accent)_18%,transparent)] text-[var(--nav-accent)] glow-ring border"
                          : "border border-transparent text-muted-foreground hover:bg-[color-mix(in_oklab,var(--nav-accent)_12%,transparent)] hover:text-[var(--nav-accent)]")
                      }
                    >
                      <span className="relative grid h-6 w-6 shrink-0 place-items-center">
                        <img
                          src={hubEmblem.url}
                          alt=""
                          aria-hidden
                          draggable={false}
                          className={
                            "absolute inset-0 h-6 w-6 select-none object-contain transition-opacity " +
                            (active ? "opacity-70" : "opacity-35")
                          }
                        />
                        <Icon className="relative h-3.5 w-3.5" />
                      </span>
                      <span className="2xl:hidden">
                        {HEADER_NAV_LABELS[hub.label] ?? hub.label}
                      </span>
                      <span className="hidden 2xl:inline">{hub.label}</span>
                    </Link>
                  );
                }
                return (
                  <div
                    key={hub.key}
                    style={hubStyle}
                    className="inline-flex h-10 shrink-0 items-stretch"
                  >
                    <Link
                      to={hub.defaultTo ?? hub.children[0]?.to ?? "/home"}
                      className={
                        "inline-flex items-center gap-2 rounded-l-lg px-3 text-sm font-semibold transition-colors " +
                        (active
                          ? "bg-[color-mix(in_oklab,var(--nav-accent)_18%,transparent)] text-[var(--nav-accent)]"
                          : "text-muted-foreground hover:bg-[color-mix(in_oklab,var(--nav-accent)_12%,transparent)] hover:text-[var(--nav-accent)]")
                      }
                    >
                      <span className="relative grid h-6 w-6 shrink-0 place-items-center">
                        <img
                          src={hubEmblem.url}
                          alt=""
                          aria-hidden
                          draggable={false}
                          className={
                            "absolute inset-0 h-6 w-6 select-none object-contain " +
                            (active ? "opacity-70" : "opacity-35")
                          }
                        />
                        <Icon className="relative h-3.5 w-3.5" />
                      </span>
                      <span className="2xl:hidden">
                        {HEADER_NAV_LABELS[hub.label] ?? hub.label}
                      </span>
                      <span className="hidden 2xl:inline">{hub.label}</span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Open ${hub.label} menu`}
                          className={
                            "inline-flex items-center rounded-r-lg border-l border-border/40 px-2 text-sm transition-colors " +
                            (active
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground")
                          }
                        >
                          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="w-64">
                        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                          {hub.label}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {hub.children.map((c) => {
                          const CIcon = c.icon;
                          return (
                            <DropdownMenuItem key={`${c.to}-${c.label}`} asChild>
                              <Link
                                to={c.to}
                                search={c.search as never}
                                className="flex items-start gap-2"
                              >
                                <CIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium">{c.label}</span>
                                  {c.desc ? (
                                    <span className="block text-xs text-muted-foreground">
                                      {c.desc}
                                    </span>
                                  ) : null}
                                </span>
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </nav>
          </div>
        </header>

        <BrandedPageBackdrop />
        <div
          style={
            {
              "--accent-color": resolveNavAccent(navThemeFor(pathname).accent, navColorMode),
            } as CSSProperties
          }
          className="relative z-10 mx-auto grid max-w-[1840px] grid-cols-1 gap-6 px-3 pb-6 pt-2 sm:px-6"
        >
          <main className="min-w-0">
            <LocationPermissionBanner />
            <UdiscImportReminder />
            <BetaBanner />

            {activeSection === "play" ? (
              <>
                <PlaySubnav />
                <HeaderAsideSlot>
                  <PlayWeatherBanner />
                </HeaderAsideSlot>
              </>
            ) : null}
            {activeSection === "community" ? <CommunitySubnav /> : null}
            <SmartBackButton className="mb-2 -ml-2 text-muted-foreground hover:text-foreground" />
            {children}
            <MascotSceneBand />
          </main>
        </div>

        <BetaFeedbackWidget />
        <MessengerDock />

        {/* No floating action buttons on phones: Ask Ace lives in the header and
             beta feedback lives in the More sheet, so nothing overlaps page
             buttons or the bottom bar. */}

        {/* Mobile bottom nav — one row, five fixed destinations. "Me" opens the
             personal sheet (profile, stats, trackers, bag, director tools, settings). */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-lg md:hidden"
          aria-label="Primary mobile"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="grid grid-cols-5">
            {[
              { to: "/play", label: "Play", icon: HUBS.find((h) => h.key === "play")!.icon, match: ["/play"], badge: 0, live: false },
              { to: "/courses", label: "Courses", icon: HUBS.find((h) => h.key === "courses")!.icon, match: ["/courses"], badge: 0, live: false },
              { to: "/events", label: "Events", icon: HUBS.find((h) => h.key === "events")!.icon, match: ["/events", "/tracker", "/series"], badge: 0, live: liveTracked > 0 },
              { to: "/community", label: "Community", icon: Users, match: SECTION_PATHS.community, badge: friendRequests + unreadMessages, live: false },
            ].map((n) => {
              const Icon = n.icon;
              const active = n.match.some((m) => pathname.startsWith(m));
              const tabTheme = navThemeFor(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  aria-label={n.badge ? `${n.label} (${n.badge} new)` : n.live ? `${n.label} (live now)` : n.label}
                  style={{ ["--nav-accent" as string]: tabTheme.accent } as CSSProperties}
                  className={
                    "relative flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 py-2 text-[12px] font-semibold leading-tight transition-transform active:scale-95 motion-reduce:transform-none " +
                    (active ? "text-[var(--nav-accent)]" : "text-muted-foreground")
                  }
                >
                  <span
                    className={
                      "relative grid h-8 w-12 place-items-center rounded-full transition-colors duration-200 " +
                      (active ? "bg-[color-mix(in_oklab,var(--nav-accent)_18%,transparent)]" : "")
                    }
                  >
                    <Icon className="h-[22px] w-[22px]" />
                    {n.badge ? (
                      <span className="absolute -right-0.5 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                        {n.badge > 9 ? "9+" : n.badge}
                      </span>
                    ) : n.live ? (
                      <span aria-hidden className="absolute right-1.5 top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                    ) : null}
                  </span>
                  <span>{n.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="Me — profile, stats, trackers, bag and settings"
              className={
                "relative flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 py-2 text-[12px] font-semibold leading-tight transition-transform active:scale-95 motion-reduce:transform-none " +
                (moreOpen || moreActive || ["/me", "/stats", "/settings", "/director", "/achievements", "/notifications", "/dgim"].some((m) => pathname.startsWith(m))
                  ? "text-primary"
                  : "text-muted-foreground")
              }
            >
              <span className="relative grid h-8 w-12 place-items-center rounded-full">
                <UserIcon className="h-[22px] w-[22px]" />
                {unread > 0 ? (
                  <span className="absolute -right-0.5 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </span>
              <span>Me</span>
            </button>
          </div>
        </nav>
        <MoreNavSheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          groups={moreGroups}
          onSendBetaFeedback={() => setBetaOpen(true)}
        />
        <BetaFeedbackDialog open={betaOpen} onOpenChange={setBetaOpen} />
        <BottomNavCustomizer
          open={bottomNavOpen}
          onOpenChange={setBottomNavOpen}
          choices={pinnableHubs.map((h) => ({ key: h.key, label: h.label, icon: h.icon }))}
          selected={bottomNavKeys}
          onSave={saveBottomNav}
          onReset={resetBottomNav}
          canSetAppDefault={isAdmin}
          onSaveAsAppDefault={saveBottomNavAsAppDefault}
        />
        {/* Spacer reserving space under fixed bottom nav (nav ~56 + safe-area). */}
        <div
          aria-hidden
          className="md:hidden"
          style={{ height: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}
        />
      </div>
    </TooltipProvider>
  );
}
