import { stripEventSourceBrands } from "@/lib/event-name";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CoursePicker, type PickedCourse, type PickedLayout } from "@/components/course-picker";
import { ExternalScoringGate } from "@/components/event/external-scoring-gate";
import {
  PDGA_DIVISIONS,
  divisionRatingLabel,
  TIME_ZONES,
  slugify,
  type PdgaDivision,
} from "@/lib/pdga-data";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MapPinned,
  Trophy,
  DollarSign,
  Shield,
  Users,
  ClipboardList,
  ContactRound,
  Info,
  ListChecks,
  ScrollText,
} from "lucide-react";
import {
  defaultEventSetup,
  legacyFormat,
  setupToColumns,
  rulesSnapshot,
  requiresPreRegClose,
  summarizeSetup,
  type SignupType,
  FORMAT_FAMILY_OPTIONS,
  PLAY_STYLE_OPTIONS,
  SCORING_MODE_OPTIONS,
  type EventSetupState,
} from "@/lib/event-setup";
import { FormatStep } from "@/components/event-setup/format-step";
import { ScoringStep } from "@/components/event-setup/scoring-step";
import { RulesStep } from "@/components/event-setup/rules-step";
import { SeriesPicker } from "@/components/event-setup/series-picker";
import { FeesStep } from "@/components/event-setup/fees-step";
import {
  SanctioningStep,
  type SanctionConfirmations,
} from "@/components/event-setup/sanctioning-step";
import { EventPlaybook } from "@/components/event-setup/event-playbook";
import {
  payoutStyleLabel,
  buildEventPlaybook,
  buildTdChecklist,
  sanctioningChecks,
  tierProfile,
} from "@/lib/sanctioning-plan";
import { FeeBreakdown } from "@/components/event-setup/fee-breakdown";
import { EventImportPanel } from "@/components/event-setup/event-import-panel";
import { normalizeTierCode, type ImportedEventDraft } from "@/lib/event-import";
import { DraftResumeCard, DraftSaveStatusLine } from "@/components/event-setup/draft-resume-card";
import { useEventDraft } from "@/hooks/use-event-draft";
import { field, type EventDraftRow } from "@/lib/event-draft-state";
import { deleteEventDraft, getEventDraft, listEventDrafts } from "@/lib/event-drafts.functions";

import {
  computeFeeBreakdown,
  defaultEventFees,
  feeChecks,
  feesToColumns,
  summarizeFees,
  type EventFees,
} from "@/lib/event-fees";


type Round = {
  round_number: number;
  date: string;
  tee_time_type: "shotgun" | "tee_times" | "flex_start";
  shotgun_time: string;
  tee_time_start: string;
  tee_time_interval_min: number;
  holes_played: number;
  course_id?: string | null;
  layout_id?: string | null;
  notes: string;
};

type DivisionSel = {
  code: string;
  name: string;
  entry_fee_cents: number;
  max_players: number | null;
  min_rating: number | null;
  max_rating: number | null;
  gender: string | null;
  age_min: number | null;
  age_max: number | null;
  sort_order: number;
};

const STEPS = [
  { k: "basics", label: "Basics", icon: Info },
  { k: "dates", label: "Dates", icon: CalendarDays },
  { k: "sanctioning", label: "Sanctioning", icon: Shield },
  { k: "course", label: "Course", icon: MapPinned },
  { k: "format", label: "Format", icon: Users },
  { k: "scoring", label: "Scoring", icon: ListChecks },
  { k: "rules", label: "Rules & extras", icon: ScrollText },
  { k: "rounds", label: "Rounds", icon: Trophy },
  { k: "divisions", label: "Divisions", icon: Users },
  { k: "fees", label: "Fees & Payouts", icon: DollarSign },
  { k: "contact", label: "Contact", icon: ContactRound },
  { k: "review", label: "Review", icon: ClipboardList },
] as const;


export function TournamentWizard({ initialDraftId = null }: { initialDraftId?: string | null }) {
  const { user } = useSession();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Basics
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [timeZone, setTimeZone] = useState("America/New_York");
  const [seriesId, setSeriesId] = useState<string | null>(null);
  // Set when Step 1 details were pulled from PDGA/UDisc — shown as a chip so the
  // TD can see where the values came from. Import only prefills; it submits nothing.
  const [importedFrom, setImportedFrom] = useState<ImportedEventDraft | null>(null);


  // Dates
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [regOpens, setRegOpens] = useState("");
  const [regCloses, setRegCloses] = useState("");
  const [checkInOpens, setCheckInOpens] = useState("");
  const [playersMeetingAt, setPlayersMeetingAt] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("72");
  const [waitlist, setWaitlist] = useState(true);

  // Course
  const [course, setCourse] = useState<PickedCourse | null>(null);
  const [layout, setLayout] = useState<PickedLayout | null>(null);
  // Events may only publish when the course has a built layout, or the TD
  // confirms scoring runs on PDGA Live / UDisc instead.
  const [externalScoring, setExternalScoring] = useState<"" | "pdga_live" | "udisc">("");

  // Rounds
  const [playersPerCard, setPlayersPerCard] = useState(4);
  const [rounds, setRounds] = useState<Round[]>([
    {
      round_number: 1,
      date: "",
      tee_time_type: "shotgun",
      shotgun_time: "10:00",
      tee_time_start: "09:00",
      tee_time_interval_min: 10,
      holes_played: 18,
      notes: "",
    },
  ]);

  // Divisions
  const [divisions, setDivisions] = useState<DivisionSel[]>([
    divisionFromPdga(PDGA_DIVISIONS.find((d) => d.code === "MPO")!, 0),
    divisionFromPdga(PDGA_DIVISIONS.find((d) => d.code === "FPO")!, 1),
    divisionFromPdga(PDGA_DIVISIONS.find((d) => d.code === "MA1")!, 2),
    divisionFromPdga(PDGA_DIVISIONS.find((d) => d.code === "MA2")!, 3),
  ]);

  // Fees — same money model leagues use, plus the tournament players' pack.
  const [fees, setFees] = useState<EventFees>(() => defaultEventFees("tournament"));
  const [playersPackCents, setPlayersPackCents] = useState(2000);

  // Sanctioning
  const [pdgaSanctioned, setPdgaSanctioned] = useState(false);
  const [pdgaTier, setPdgaTier] = useState("C");
  const [pdgaEventNumber, setPdgaEventNumber] = useState("");
  const [sanctionConfirmations, setSanctionConfirmations] = useState<SanctionConfirmations>({
    approvalConfirmed: false,
    officialsConfirmed: false,
    insuranceConfirmed: false,
  });
  const tierRules = useMemo(
    () => (pdgaSanctioned ? tierProfile(pdgaTier) : null),
    [pdgaSanctioned, pdgaTier],
  );

  /** Apply imported event details onto the wizard. Empty values never blank a field. */
  function applyImportedDetails(draft: ImportedEventDraft) {
    if (draft.name) setName(draft.name);
    if (draft.description) setDescription(draft.description);
    if (draft.cover_url) setCoverUrl(draft.cover_url);
    if (draft.time_zone) setTimeZone(draft.time_zone);
    if (draft.start_date) setStartDate(draft.start_date);
    if (draft.end_date) setEndDate(draft.end_date);
    if (draft.pdga_event_number) {
      setPdgaEventNumber(draft.pdga_event_number);
      setPdgaSanctioned(true);
    }
    const tier = normalizeTierCode(draft.pdga_tier);
    if (tier) {
      setPdgaTier(tier);
      setPdgaSanctioned(true);
    }
    if (draft.source_url && !websiteUrl) setWebsiteUrl(draft.source_url);
    setImportedFrom(draft);
  }


  // Contact
  const [tdName, setTdName] = useState("");

  const [tdEmail, setTdEmail] = useState("");
  const [tdPhone, setTdPhone] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [registrationUrl, setRegistrationUrl] = useState("");
  const [rulesUrl, setRulesUrl] = useState("https://www.pdga.com/rules");

  // Shared event setup: format, sign-up, scoring, rules, extras
  const [setup, setSetup] = useState<EventSetupState>(() => defaultEventSetup("tournament"));

  // Play format (singles/doubles/teams) and scoring rules (stroke, match, skins…)
  // are separate answers — both live in the Format and Scoring steps.
  const formatFamilyLabel =
    FORMAT_FAMILY_OPTIONS.find((o) => o.value === setup.format_family)?.label ?? "Singles";
  const playStyleLabel =
    setup.format_family === "singles"
      ? ""
      : (PLAY_STYLE_OPTIONS.find((o) => o.value === setup.play_style)?.label ?? "");
  const scoringModeLabel =
    SCORING_MODE_OPTIONS.find((o) => o.value === setup.scoring_mode)?.label ?? "Stroke play";

  // ---- Saved draft: autosave as steps are filled, resume later ----
  const [pendingDraft, setPendingDraft] = useState<EventDraftRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  const draftFields = useMemo(
    () => ({
      name,
      description,
      coverUrl,
      timeZone,
      seriesId,
      startDate,
      endDate,
      regOpens,
      regCloses,
      checkInOpens,
      playersMeetingAt,
      maxPlayers,
      waitlist,
      course,
      layout,
      externalScoring,
      playersPerCard,
      rounds,
      divisions,
      fees,
      playersPackCents,
      pdgaSanctioned,
      pdgaTier,
      pdgaEventNumber,
      sanctionConfirmations,
      tdName,
      tdEmail,
      tdPhone,
      websiteUrl,
      registrationUrl,
      rulesUrl,
      setup,
      // Read by the autosave hook to decide whether there is anything to save.
      course_id: course?.id ?? null,
      start_date: startDate,
    }),
    [
      name,
      description,
      coverUrl,
      timeZone,
      seriesId,
      startDate,
      endDate,
      regOpens,
      regCloses,
      checkInOpens,
      playersMeetingAt,
      maxPlayers,
      waitlist,
      course,
      layout,
      externalScoring,
      playersPerCard,
      rounds,
      divisions,
      fees,
      playersPackCents,
      pdgaSanctioned,
      pdgaTier,
      pdgaEventNumber,
      sanctionConfirmations,
      tdName,
      tdEmail,
      tdPhone,
      websiteUrl,
      registrationUrl,
      rulesUrl,
      setup,
    ],
  );

  const draftState = useEventDraft({
    kind: "tournament",
    initialId: initialDraftId,
    fields: draftFields,
    title: name,
    step,
    seriesId,
    // Autosave stays on even while a resume prompt is showing, so a brand-new
    // setup started alongside an old draft is never lost.
    enabled: !restoring,
  });

  /** Remove a draft the user chose not to resume. */
  async function deleteDraftById(id: string) {
    try {
      await deleteEventDraft({ data: { id } });
    } catch {
      // Nothing to do — an undeleted draft simply stays in the list.
    }
  }

  /** Put a saved draft's answers back into the builder. */
  function restoreDraft(draft: EventDraftRow) {
    const f = draft.state?.fields;
    if (!f) {
      toast.error("That draft was saved by an older version — start fresh instead.");
      void draftState.discard();
      setPendingDraft(null);
      return;
    }
    setRestoring(true);
    setName(field(f, "name", ""));
    setDescription(field(f, "description", ""));
    setCoverUrl(field(f, "coverUrl", ""));
    setTimeZone(field(f, "timeZone", "America/New_York"));
    setSeriesId(field<string | null>(f, "seriesId", null));
    setStartDate(field(f, "startDate", ""));
    setEndDate(field(f, "endDate", ""));
    setRegOpens(field(f, "regOpens", ""));
    setRegCloses(field(f, "regCloses", ""));
    setCheckInOpens(field(f, "checkInOpens", ""));
    setPlayersMeetingAt(field(f, "playersMeetingAt", ""));
    setMaxPlayers(field(f, "maxPlayers", "72"));
    setWaitlist(field(f, "waitlist", true));
    setCourse(field<PickedCourse | null>(f, "course", null));
    setLayout(field<PickedLayout | null>(f, "layout", null));
    setExternalScoring(field<"" | "pdga_live" | "udisc">(f, "externalScoring", ""));
    setPlayersPerCard(field(f, "playersPerCard", 4));
    setRounds(field<Round[]>(f, "rounds", []));
    setDivisions(field<DivisionSel[]>(f, "divisions", []));
    setFees(field(f, "fees", defaultEventFees("tournament")));
    setPlayersPackCents(field(f, "playersPackCents", 2000));
    setPdgaSanctioned(field(f, "pdgaSanctioned", false));
    setPdgaTier(field(f, "pdgaTier", "C"));
    setPdgaEventNumber(field(f, "pdgaEventNumber", ""));
    setSanctionConfirmations(
      field<SanctionConfirmations>(f, "sanctionConfirmations", {
        approvalConfirmed: false,
        officialsConfirmed: false,
        insuranceConfirmed: false,
      }),
    );
    setTdName(field(f, "tdName", ""));
    setTdEmail(field(f, "tdEmail", ""));
    setTdPhone(field(f, "tdPhone", ""));
    setWebsiteUrl(field(f, "websiteUrl", ""));
    setRegistrationUrl(field(f, "registrationUrl", ""));
    setRulesUrl(field(f, "rulesUrl", "https://www.pdga.com/rules"));
    setSetup(field(f, "setup", defaultEventSetup("tournament")));
    setStep(Math.min(STEPS.length - 1, Math.max(0, draft.step)));
    draftState.adopt(draft.id);
    setPendingDraft(null);
    setRestoring(false);
  }

  // Load a draft named in the URL, or offer the most recent unfinished tournament.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (initialDraftId) {
          const draft = await getEventDraft({ data: { id: initialDraftId } });
          if (!cancelled && draft) restoreDraft(draft);
          return;
        }
        const drafts = await listEventDrafts({ data: { kind: "tournament" } });
        if (!cancelled && drafts.length > 0) setPendingDraft(drafts[0]!);
      } catch {
        // No saved drafts available — the builder still works normally.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftId]);





  // Legacy tournament fee columns stay in step with the shared money plan.
  const feeBreakdown = useMemo(() => computeFeeBreakdown(fees), [fees]);
  const legacyFeeColumns = useMemo(() => {
    const hasLine = (d: "ace_pot" | "ctp") =>
      fees.lines.some((l) => l.destination === d && l.amount_cents > 0);
    const payoutType: "trophy_only" | "cash" | "merchandise" | "mixed" =
      fees.payout.style === "none" || fees.payout.kind === "trophy_only"
        ? "trophy_only"
        : fees.payout.kind === "cash"
          ? "cash"
          : fees.payout.kind === "merch"
            ? "merchandise"
            : "mixed";
    const entry = fees.entry_fee_cents || 0;
    const ratio = entry > 0 ? Math.min(1, Math.max(0, feeBreakdown.payout_per_player_cents / entry)) : 0;
    return {
      ace_pot_enabled: hasLine("ace_pot"),
      ctp_enabled: hasLine("ctp"),
      payout_type: payoutType,
      payout_ratio: Number(ratio.toFixed(3)),
    };
  }, [fees, feeBreakdown]);

  // Sync round dates against tournament dates
  useEffect(() => {
    if (!startDate) return;
    setRounds((prev) => prev.map((r, i) => (r.date ? r : { ...r, date: addDays(startDate, i) })));
  }, [startDate]);

  // Auto-fill location from course
  const location = useMemo(
    () => (course ? [course.city, course.state].filter(Boolean).join(", ") : ""),
    [course],
  );

  const validation = validate({
    name,
    startDate,
    endDate,
    course,
    rounds,
    divisions,
    tdEmail,
    pdgaSanctioned,
    pdgaTier,
    pdgaEventNumber,
    externalScoring,
    signupType: setup.signup_type,
    regCloses,
    feeChecks: feeChecks(fees),
    sanctionChecks: sanctioningChecks({
      sanctioned: pdgaSanctioned,
      tier: pdgaSanctioned ? pdgaTier : null,
      eventNumber: pdgaEventNumber,
      rounds: rounds.map((r) => ({ holes_played: r.holes_played })),
      signupType: setup.signup_type,
      officialsConfirmed: sanctionConfirmations.officialsConfirmed,
      approvalConfirmed: sanctionConfirmations.approvalConfirmed,
      insuranceConfirmed: sanctionConfirmations.insuranceConfirmed,
      payoutKind: fees.payout.kind,
      divisionCodes: divisions.map((d) => d.code),
    }),
  });

  async function publish() {
    if (!user) return;
    if (!validation.ok) {
      toast.error(validation.errors[0] ?? "Please fix errors before publishing");
      return;
    }
    setBusy(true);
    try {
      const cleanName = stripEventSourceBrands(name);
      const slug = `${slugify(cleanName)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: t, error } = await supabase
        .from("tournaments")
        .insert({
          owner_id: user.id,
          name: cleanName,
          slug,
          description: description || null,
          cover_url: coverUrl || null,
          format: legacyFormat(setup),
          ...setupToColumns(setup, { fees }),
          series_id: seriesId,
          tournament_shape: seriesId ? "series_stop" : rounds.length > 1 ? "multi_round" : "single",


          status: "published",
          start_date: startDate,
          end_date: endDate,
          registration_opens: regOpens || null,
          registration_closes: regCloses || null,
          check_in_opens: checkInOpens || null,
          players_meeting_at: playersMeetingAt || null,
          location: location || null,
          latitude: course?.latitude ?? null,
          longitude: course?.longitude ?? null,
          course_id: course?.id ?? null,
          layout_id: layout?.id ?? null,
          external_scoring: externalScoring || null,
          time_zone: timeZone,
          tee_time_type: rounds[0]?.tee_time_type ?? null,
          players_per_card: playersPerCard,
          pdga_sanctioned: pdgaSanctioned,
          pdga_tier: pdgaSanctioned ? pdgaTier : null,
          pdga_event_number: pdgaSanctioned ? pdgaEventNumber || null : null,
          entry_fee_cents: feesToColumns(fees, "event").entry_fee_cents,
          players_pack_cents: playersPackCents,
          ...legacyFeeColumns,
          max_players: maxPlayers ? parseInt(maxPlayers) : null,
          waitlist_enabled: waitlist,
          refund_policy: fees.refund_policy || null,
          td_name: tdName || null,
          td_email: tdEmail || null,
          td_phone: tdPhone || null,
          rules_url: rulesUrl || null,
          website_url: websiteUrl || null,
          registration_url: registrationUrl || null,
        })
        .select("id, slug")
        .single();
      if (error) throw error;

      // Rounds
      if (rounds.length) {
        const roundRows = rounds.map((r) => ({
          tournament_id: t!.id,
          round_number: r.round_number,
          course_id: r.course_id ?? course?.id ?? null,
          layout_id: r.layout_id ?? layout?.id ?? null,
          starts_at: r.date
            ? new Date(
                `${r.date}T${r.tee_time_type === "shotgun" ? r.shotgun_time : r.tee_time_start}:00`,
              ).toISOString()
            : null,
          tee_time_type: r.tee_time_type,
          shotgun_time: r.tee_time_type === "shotgun" ? r.shotgun_time : null,
          tee_time_start: r.tee_time_type === "tee_times" ? r.tee_time_start : null,
          tee_time_interval_min: r.tee_time_type === "tee_times" ? r.tee_time_interval_min : null,
          holes_played: r.holes_played,
          notes: r.notes || null,
          rules_snapshot: rulesSnapshot(setup),
        }));
        const { error: rErr } = await supabase.from("tournament_rounds").insert(roundRows);
        if (rErr) throw rErr;
      }

      // Divisions
      const divRows = divisions.map((d) => ({
        tournament_id: t!.id,
        code: d.code,
        name: d.name,
        pdga_code: d.code,
        entry_fee_cents: d.entry_fee_cents,
        max_players: d.max_players,
        min_rating: d.min_rating,
        max_rating: d.max_rating,
        gender: d.gender,
        age_min: d.age_min,
        age_max: d.age_max,
        sort_order: d.sort_order,
      }));
      const { error: dErr } = await supabase.from("tournament_divisions").insert(divRows);
      if (dErr) throw dErr;

      // Checklist template
      const checklistRows = buildTdChecklist({
        sanctioned: pdgaSanctioned,
        tier: pdgaSanctioned ? pdgaTier : null,
      }).map((c, i) => ({
        tournament_id: t!.id,
        phase: c.phase,
        label: c.label,
        sort_order: i,
      }));
      await supabase.from("tournament_checklist_items").insert(checklistRows);

      await draftState.discard();
      toast.success("Tournament published — invite your players next");
      navigate({ to: "/tournaments/$slug", params: { slug: t!.slug }, search: { tab: "invite" } });
    } catch (e: any) {
      toast.error(e.message || "We couldn't publish this. Give it another shot.");
    } finally {
      setBusy(false);
    }
  }

  const current = STEPS[step];
  const CurrentIcon = current.icon;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[220px_1fr]">
      {/* Step rail */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <ol className="space-y-1 rounded-xl border border-border bg-card p-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <li key={s.k}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${active ? "bg-primary/10 text-primary" : done ? "text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted"}`}
                >
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full text-xs ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/20" : "bg-muted"}`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="flex-1">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Body */}
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <CurrentIcon className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-semibold">{current.label}</h2>
            <div className="ml-auto">
              <DraftSaveStatusLine
                status={draftState.status}
                lastSavedAt={draftState.lastSavedAt}
              />
            </div>
          </div>

          {pendingDraft && (
            <div className="mb-4">
              <DraftResumeCard
                draft={pendingDraft}
                stepLabel={STEPS[pendingDraft.step]?.label ?? null}
                busy={restoring}
                onResume={() => restoreDraft(pendingDraft)}
                onDiscard={() => {
                  const id = pendingDraft.id;
                  setPendingDraft(null);
                  void deleteDraftById(id);
                }}
              />
            </div>
          )}

          {current.k === "basics" && (
            <div className="space-y-4">
              <EventImportPanel kind="tournament" onApply={applyImportedDetails} />
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Label>Event name *</Label>
                  {importedFrom && (
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Imported from {importedFrom.source === "pdga" ? "PDGA" : "UDisc"}
                    </span>
                  )}
                </div>

                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Spring Fling Open"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Overview, added money, food trucks, whatever players should know…"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cover image URL</Label>
                  <Input
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Time zone</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                  >
                    {TIME_ZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <SeriesPicker value={seriesId} onChange={setSeriesId} kind="tournament" />
            </div>

          )}

          {current.k === "dates" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldDate label="Start date *" value={startDate} onChange={setStartDate} />
                <FieldDate label="End date *" value={endDate} onChange={setEndDate} />
                {setup.signup_type === "casual" ? null : (
                  <>
                    <FieldDateTime
                      label="Registration opens"
                      value={regOpens}
                      onChange={setRegOpens}
                    />
                    <FieldDateTime
                      label={
                        requiresPreRegClose(setup.signup_type)
                          ? "Registration closes *"
                          : "Registration closes"
                      }
                      value={regCloses}
                      onChange={setRegCloses}
                    />
                  </>
                )}
                <FieldDateTime
                  label="Check-in opens"
                  value={checkInOpens}
                  onChange={setCheckInOpens}
                />
                <FieldDateTime
                  label="Players' meeting"
                  value={playersMeetingAt}
                  onChange={setPlayersMeetingAt}
                />
                <div className="space-y-1.5">
                  <Label>Max players</Label>
                  <Input
                    type="number"
                    min="1"
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Waitlist</Label>
                  <div className="flex h-10 items-center gap-3">
                    <Switch checked={waitlist} onCheckedChange={setWaitlist} />
                    <span className="text-xs text-muted-foreground">
                      Auto-promote when a spot opens
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {current.k === "course" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick the primary course. You can override the course per-round on the next step
                (multi-course events).
              </p>
              <CoursePicker
                courseId={course?.id ?? null}
                layoutId={layout?.id ?? null}
                onCourse={setCourse}
                onLayout={setLayout}
              />
              {course ? (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <div className="font-medium">{course.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {location || "Location unknown"} · {course.hole_count} holes
                    {layout ? ` · Layout: ${layout.name}` : ""}
                  </div>
                  <div className="mt-1 text-xs">
                    {(course.layout_count ?? 0) > 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {course.layout_verified
                          ? "Verified layout built — live scoring is ready."
                          : "Layout built — live scoring is ready."}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">
                        No layout built yet. Build it in the course builder, or confirm external
                        scoring below.
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
              <ExternalScoringGate
                courseName={course?.name ?? null}
                layoutBuilt={(course?.layout_count ?? 0) > 0}
                courseSelected={!!course}
                layoutVerified={!!course?.layout_verified}
                holeCount={course?.hole_count ?? null}
                value={externalScoring}
                onChange={setExternalScoring}
              />
            </div>
          )}

          {current.k === "format" && (
            <FormatStep
              value={setup}
              onChange={(next) => {
                setSetup(next);
                if (next.signup_type === "casual") {
                  setRegOpens("");
                  setRegCloses("");
                }
              }}
              kind="tournament"
              registrationCloses={regCloses}
              onRegistrationClosesChange={setRegCloses}
            />
          )}

          {current.k === "scoring" && <ScoringStep value={setup} onChange={setSetup} />}

          {current.k === "rules" && (
            <div className="space-y-4">
              <RulesStep value={setup} onChange={setSetup} />
              <div>
                <div className="mb-2 text-[14px] font-semibold">
                  {pdgaSanctioned ? "Rules to hold the field to" : "Fun formats and quirks to try"}
                </div>
                <EventPlaybook
                  sections={buildEventPlaybook({
                    sanctioned: pdgaSanctioned,
                    tier: pdgaSanctioned ? pdgaTier : null,
                    rounds: rounds.length,
                    hasEntryFee: (fees.entry_fee_cents || 0) > 0,
                  }).filter((sec) => (pdgaSanctioned ? sec.id === "course" : sec.id === "fun"))}
                />
              </div>
            </div>
          )}



          {current.k === "rounds" && (
            <div className="space-y-4">
              {tierRules ? (
                <TierNote
                  text={`${tierRules.label} needs at least ${tierRules.minRounds} round${tierRules.minRounds > 1 ? "s" : ""} and ${tierRules.minHoles} holes of competition in total.`}
                />
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Format and scoring</Label>
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Format:</span>{" "}
                      {formatFamilyLabel}
                      {playStyleLabel ? ` · ${playStyleLabel}` : ""}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Scoring rules:</span>{" "}
                      {scoringModeLabel}
                    </div>
                    <button
                      type="button"
                      className="mt-1 text-xs text-primary hover:underline"
                      onClick={() => setStep(STEPS.findIndex((s) => s.k === "format"))}
                    >
                      Change format or scoring
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Players per card</Label>
                  <Input
                    type="number"
                    min="2"
                    max="5"
                    value={playersPerCard}
                    onChange={(e) => setPlayersPerCard(parseInt(e.target.value) || 4)}
                  />
                </div>
              </div>


              <div className="space-y-3">
                {rounds.map((r, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-medium">Round {r.round_number}</div>
                      {rounds.length > 1 && (
                        <button
                          className="text-xs text-destructive hover:underline"
                          onClick={() =>
                            setRounds((prev) =>
                              prev
                                .filter((_, j) => j !== i)
                                .map((rr, j) => ({ ...rr, round_number: j + 1 })),
                            )
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <FieldDate
                        label="Date"
                        value={r.date}
                        onChange={(v) => updateRound(setRounds, i, { date: v })}
                      />
                      <div className="space-y-1.5">
                        <Label>Tee format</Label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={r.tee_time_type}
                          onChange={(e) =>
                            updateRound(setRounds, i, { tee_time_type: e.target.value as any })
                          }
                        >
                          <option value="shotgun">Shotgun</option>
                          <option value="tee_times">Tee times</option>
                          <option value="flex_start">Flex start</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Holes</Label>
                        <Input
                          type="number"
                          min="9"
                          max="27"
                          value={r.holes_played}
                          onChange={(e) =>
                            updateRound(setRounds, i, {
                              holes_played: parseInt(e.target.value) || 18,
                            })
                          }
                        />
                      </div>
                      {r.tee_time_type === "shotgun" ? (
                        <div className="space-y-1.5">
                          <Label>Shotgun time</Label>
                          <Input
                            type="time"
                            value={r.shotgun_time}
                            onChange={(e) =>
                              updateRound(setRounds, i, { shotgun_time: e.target.value })
                            }
                          />
                        </div>
                      ) : r.tee_time_type === "tee_times" ? (
                        <>
                          <div className="space-y-1.5">
                            <Label>First tee</Label>
                            <Input
                              type="time"
                              value={r.tee_time_start}
                              onChange={(e) =>
                                updateRound(setRounds, i, { tee_time_start: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Interval (min)</Label>
                            <Input
                              type="number"
                              min="5"
                              value={r.tee_time_interval_min}
                              onChange={(e) =>
                                updateRound(setRounds, i, {
                                  tee_time_interval_min: parseInt(e.target.value) || 10,
                                })
                              }
                            />
                          </div>
                        </>
                      ) : (
                        <div className="col-span-2 text-xs text-muted-foreground">
                          Flex start: players play any time during the window.
                        </div>
                      )}
                      <div className="sm:col-span-3 space-y-1.5">
                        <Label>Round notes</Label>
                        <Input
                          value={r.notes}
                          onChange={(e) => updateRound(setRounds, i, { notes: e.target.value })}
                          placeholder="Layout override, alt basket positions, etc."
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setRounds((prev) => [
                      ...prev,
                      {
                        round_number: prev.length + 1,
                        date: addDays(
                          startDate || new Date().toISOString().slice(0, 10),
                          prev.length,
                        ),
                        tee_time_type: "shotgun",
                        shotgun_time: "10:00",
                        tee_time_start: "09:00",
                        tee_time_interval_min: 10,
                        holes_played: 18,
                        notes: "",
                      },
                    ])
                  }
                >
                  + Add round
                </Button>
              </div>
            </div>
          )}

          {current.k === "divisions" && (
            <div className="space-y-4">
              {tierRules ? (
                <TierNote
                  text={
                    tierRules.payoutStyle === "merch_only"
                      ? `${tierRules.label} is amateur-only — offer amateur divisions and leave MPO/FPO off.`
                      : `${tierRules.label} must offer the open divisions MPO and FPO alongside your amateur divisions.`
                  }
                />
              ) : null}
              <p className="text-sm text-muted-foreground">
                Toggle PDGA divisions the event will offer. Rating floors and ceilings come from the
                current PDGA Competition Manual; override per-division if needed.
              </p>
              <div className="max-h-[420px] overflow-y-auto rounded-md border border-border">
                {PDGA_DIVISIONS.map((d) => {
                  const chosen = divisions.find((x) => x.code === d.code);
                  return (
                    <div
                      key={d.code}
                      className="flex items-center justify-between border-b border-border/60 px-3 py-2 last:border-b-0"
                    >
                      <div>
                        <div className="text-sm font-medium">
                          {d.code} — {d.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {divisionRatingLabel(d)}{" "}
                          {d.age_min ? `${d.age_min}+ ` : ""}
                          {d.age_max ? `≤${d.age_max}yo ` : ""}
                          {d.gender === "M" ? "Men " : d.gender === "F" ? "Women " : ""}·{" "}
                          {d.category.replace("_", " ")}
                        </div>
                      </div>
                      <Switch
                        checked={!!chosen}
                        onCheckedChange={(on) => {
                          setDivisions((prev) =>
                            on
                              ? [...prev, divisionFromPdga(d, prev.length)]
                              : prev.filter((x) => x.code !== d.code),
                          );
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              {divisions.length > 0 && (
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Div</th>
                        <th className="p-2 text-left">Fee $</th>
                        <th className="p-2 text-left">Cap</th>
                        <th className="p-2 text-left">Min rating</th>
                        <th className="p-2 text-left">Max rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divisions.map((d, i) => (
                        <tr key={d.code} className="border-t border-border">
                          <td className="p-2">{d.code}</td>
                          <td className="p-2">
                            <Input
                              className="h-8"
                              type="number"
                              value={d.entry_fee_cents / 100}
                              onChange={(e) =>
                                updateDivision(setDivisions, i, {
                                  entry_fee_cents: Math.round(
                                    parseFloat(e.target.value || "0") * 100,
                                  ),
                                })
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              className="h-8 w-20"
                              type="number"
                              value={d.max_players ?? ""}
                              onChange={(e) =>
                                updateDivision(setDivisions, i, {
                                  max_players: e.target.value ? parseInt(e.target.value) : null,
                                })
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              className="h-8 w-24"
                              type="number"
                              value={d.min_rating ?? ""}
                              onChange={(e) =>
                                updateDivision(setDivisions, i, {
                                  min_rating: e.target.value ? parseInt(e.target.value) : null,
                                })
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              className="h-8 w-24"
                              type="number"
                              value={d.max_rating ?? ""}
                              onChange={(e) =>
                                updateDivision(setDivisions, i, {
                                  max_rating: e.target.value ? parseInt(e.target.value) : null,
                                })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {current.k === "fees" && (
            <div className="space-y-5">
              {tierRules ? (
                <TierNote
                  text={`${tierRules.label} payout: ${payoutStyleLabel(tierRules.payoutStyle)}. Sanctioning fee is $${(tierRules.playerFeeCents / 100).toFixed(2)} per player, added on top of your entry fee.`}
                />
              ) : null}
              <FeesStep value={fees} onChange={setFees} unit="event" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Players' pack value (USD)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={playersPackCents / 100}
                    onChange={(e) =>
                      setPlayersPackCents(Math.round(parseFloat(e.target.value || "0") * 100))
                    }
                  />
                  <p className="text-[13px] text-muted-foreground">
                    Retail value of the disc, gear, or merch each registered player receives.
                  </p>
                </div>
              </div>
            </div>
          )}

          {current.k === "sanctioning" && (
            <SanctioningStep
              sanctioned={pdgaSanctioned}
              tier={pdgaTier}
              eventNumber={pdgaEventNumber}
              confirmations={sanctionConfirmations}
              rounds={rounds.length}
              hasEntryFee={(fees.entry_fee_cents || 0) > 0}
              onSanctionedChange={setPdgaSanctioned}
              onTierChange={setPdgaTier}
              onEventNumberChange={setPdgaEventNumber}
              onConfirmationsChange={setSanctionConfirmations}
            />
          )}

          {current.k === "contact" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Tournament director (TD) name</Label>
                  <Input value={tdName} onChange={(e) => setTdName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tournament director email *</Label>
                  <Input
                    type="email"
                    value={tdEmail}
                    onChange={(e) => setTdEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tournament director phone</Label>
                  <Input value={tdPhone} onChange={(e) => setTdPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Event website</Label>
                  <Input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Registration URL</Label>
                  <Input
                    value={registrationUrl}
                    onChange={(e) => setRegistrationUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Rules URL</Label>
                  <Input value={rulesUrl} onChange={(e) => setRulesUrl(e.target.value)} />
                </div>
              </div>
              <div className="rounded-md border border-border p-3 text-[13px] text-muted-foreground">
                Refund policy is set with the rest of the money details on the Fees & Payouts step:{" "}
                <span className="text-foreground">
                  {fees.refund_policy.trim() || "no refund policy written yet"}
                </span>
              </div>
            </div>
          )}

          {current.k === "review" && (
            <div className="space-y-4">
              <div className="rounded-md border border-border p-3">
                <div className="mb-1 text-sm font-semibold">How this event plays</div>
                <p className="text-[13px] text-muted-foreground">{summarizeSetup(setup)}</p>
              </div>
              <FeeBreakdown fees={fees} unit="event" />
              <div className="rounded-md border border-border p-3">

                <div className="mb-2 text-sm font-semibold">Compliance check</div>
                <ul className="space-y-1 text-sm">
                  {validation.checks.map((c) => (
                    <li
                      key={c.label}
                      className={`flex items-center gap-2 ${c.pass ? "text-emerald-600" : "text-destructive"}`}
                    >
                      {c.pass ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <span className="grid h-4 w-4 place-items-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                          !
                        </span>
                      )}
                      {c.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <SummaryCard
                  title="Event"
                  body={
                    <>
                      <div>{name || <em>Untitled</em>}</div>
                      <div className="text-muted-foreground">
                        {startDate} → {endDate} · {timeZone}
                      </div>
                    </>
                  }
                />
                <SummaryCard
                  title="Course"
                  body={
                    course ? (
                      <>
                        <div>{course.name}</div>
                        <div className="text-muted-foreground">
                          {location || "Location unknown"} {layout ? `· ${layout.name}` : ""}
                        </div>
                      </>
                    ) : (
                      <em>Not selected</em>
                    )
                  }
                />
                <SummaryCard
                  title={`${rounds.length} round(s)`}
                  body={
                    <ul className="space-y-0.5">
                      {rounds.map((r) => (
                        <li key={r.round_number}>
                          R{r.round_number}: {r.date} · {r.tee_time_type.replace("_", " ")} ·{" "}
                          {r.holes_played} holes
                        </li>
                      ))}
                    </ul>
                  }
                />
                <SummaryCard
                  title={`${divisions.length} division(s)`}
                  body={
                    <div className="flex flex-wrap gap-1">
                      {divisions.map((d) => (
                        <span
                          key={d.code}
                          className="rounded-full bg-muted px-2 py-0.5 text-[11px]"
                        >
                          {d.code}
                        </span>
                      ))}
                    </div>
                  }
                />
                <SummaryCard
                  title="Fees"
                  body={
                    <>
                      <div>{summarizeFees(fees, "event")}</div>
                      <div className="text-muted-foreground">
                        Players' pack valued at ${playersPackCents / 100}
                      </div>
                    </>
                  }
                />
                <SummaryCard
                  title="Sanctioning"
                  body={
                    pdgaSanctioned ? (
                      <>
                        <div>
                          PDGA {pdgaTier} #{pdgaEventNumber}
                        </div>
                      </>
                    ) : (
                      <em>Casual event</em>
                    )
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="text-xs text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </div>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={publish} disabled={busy || !validation.ok}>
              {busy ? "Publishing…" : "Publish tournament"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers & inputs ---------- */

function FieldDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function FieldDateTime({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function SummaryCard({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <div>{body}</div>
    </div>
  );
}
function updateRound(
  setter: React.Dispatch<React.SetStateAction<Round[]>>,
  i: number,
  patch: Partial<Round>,
) {
  setter((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
}
function updateDivision(
  setter: React.Dispatch<React.SetStateAction<DivisionSel[]>>,
  i: number,
  patch: Partial<DivisionSel>,
) {
  setter((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
}

function divisionFromPdga(d: PdgaDivision, sort_order: number): DivisionSel {
  return {
    code: d.code,
    name: d.name,
    entry_fee_cents: 0,
    max_players: null,
    min_rating: d.min_rating ?? null,
    max_rating: d.max_rating ?? null,
    gender: d.gender === "X" ? null : d.gender,
    age_min: d.age_min ?? null,
    age_max: d.age_max ?? null,
    sort_order,
  };
}

function addDays(iso: string, days: number) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function validate(args: {
  name: string;
  startDate: string;
  endDate: string;
  course: PickedCourse | null;
  rounds: Round[];
  divisions: DivisionSel[];
  tdEmail: string;
  pdgaSanctioned: boolean;
  pdgaTier: string;
  pdgaEventNumber: string;
  externalScoring: "" | "pdga_live" | "udisc";
  signupType: SignupType;
  regCloses: string;
  feeChecks: { label: string; pass: boolean }[];
  sanctionChecks: { label: string; pass: boolean }[];
}) {
  const checks = [
    { label: "Event has a name", pass: !!args.name.trim() },
    { label: "Start & end dates set", pass: !!args.startDate && !!args.endDate },
    {
      label: "End date is not before start",
      pass: !args.startDate || !args.endDate || args.endDate >= args.startDate,
    },
    { label: "Course selected", pass: !!args.course },
    {
      label: "Course layout built, or PDGA Live / UDisc scoring confirmed",
      pass: !!args.externalScoring || (args.course?.layout_count ?? 0) > 0,
    },
    {
      label: "At least one round scheduled",
      pass: args.rounds.length > 0 && args.rounds.every((r) => r.date),
    },
    { label: "At least one division offered", pass: args.divisions.length > 0 },
    { label: "Tournament director email captured", pass: /^\S+@\S+\.\S+$/.test(args.tdEmail) },
    ...args.sanctionChecks,
    {
      label: "Pre-registration closing time set (pre-registration only events)",
      pass: !requiresPreRegClose(args.signupType) || !!args.regCloses,
    },
    ...args.feeChecks,
  ];
  const errors = checks.filter((c) => !c.pass).map((c) => c.label);
  return { ok: errors.length === 0, errors, checks };
}

/** Inline reminder of what the chosen PDGA tier requires on this step. */
function TierNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-[13px]">
      <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{text}</span>
    </div>
  );
}
