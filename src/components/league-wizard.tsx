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
import { PDGA_DIVISIONS, divisionRatingLabel, slugify } from "@/lib/pdga-data";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MapPinned,
  Trophy,
  DollarSign,
  Users,
  ContactRound,
  Info,
  ClipboardList,
  ListChecks,
  ScrollText,
  Shield,
} from "lucide-react";
import {
  activeWeeks,
  defaultEventSetup,
  defaultLeagueSchedule,
  rulesSnapshot,
  scheduleChecks,
  setupToColumns,
  standingsToColumns,
  summarizeSchedule,
  summarizeSetup,
  type EventSetupState,
  type LeagueSchedule,
  requiresPreRegClose,
} from "@/lib/event-setup";
import { FormatStep } from "@/components/event-setup/format-step";
import { ScoringStep } from "@/components/event-setup/scoring-step";
import { RulesStep } from "@/components/event-setup/rules-step";
import { ScheduleStep } from "@/components/event-setup/schedule-step";
import { VenueField } from "@/components/event-setup/venue-field";
import { SeasonPreview } from "@/components/event-setup/season-preview";
import { SeriesPicker } from "@/components/event-setup/series-picker";
import { FeesStep } from "@/components/event-setup/fees-step";
import { FeeBreakdown } from "@/components/event-setup/fee-breakdown";
import { EventImportPanel } from "@/components/event-setup/event-import-panel";
import { normalizeTierCode, type ImportedEventDraft } from "@/lib/event-import";
import { DraftResumeCard, DraftSaveStatusLine } from "@/components/event-setup/draft-resume-card";
import { useEventDraft } from "@/hooks/use-event-draft";
import { field, type EventDraftRow } from "@/lib/event-draft-state";
import { deleteEventDraft, getEventDraft, listEventDrafts } from "@/lib/event-drafts.functions";

import {
  SanctioningStep,
  type SanctionConfirmations,
} from "@/components/event-setup/sanctioning-step";
import { EventPlaybook } from "@/components/event-setup/event-playbook";
import {
  buildEventPlaybook,
  buildTdChecklist,
  payoutStyleLabel,
  sanctioningChecks,
  tierProfile,
} from "@/lib/sanctioning-plan";
import {
  defaultEventFees,
  feeChecks,
  feesToColumns,
  summarizeFees,
  type EventFees,
} from "@/lib/event-fees";

const STEPS = [
  { k: "basics", label: "Basics", icon: Info },
  { k: "course", label: "Course", icon: MapPinned },
  { k: "sanctioning", label: "Sanctioning", icon: Shield },
  { k: "schedule", label: "Schedule", icon: CalendarDays },
  { k: "format", label: "Format", icon: Trophy },
  { k: "scoring", label: "Scoring", icon: ListChecks },
  { k: "rules", label: "Rules & extras", icon: ScrollText },
  { k: "divisions", label: "Divisions", icon: Users },
  { k: "fees", label: "Fees", icon: DollarSign },
  { k: "contact", label: "Contact", icon: ContactRound },
  { k: "review", label: "Review", icon: ClipboardList },
] as const;

type Div = {
  code: string;
  name: string;
  pdga_code: string | null;
  min_rating: number | null;
  max_rating: number | null;
  entry_fee_cents: number;
  sort_order: number;
};

export function LeagueWizard({ initialDraftId = null }: { initialDraftId?: string | null }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const year = new Date().getFullYear();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [season, setSeason] = useState(`${year}`);
  const [seriesId, setSeriesId] = useState<string | null>(null);
  // Set when Step 1 details were pulled from PDGA/UDisc. Import only prefills.
  const [importedFrom, setImportedFrom] = useState<ImportedEventDraft | null>(null);


  const [schedule, setSchedule] = useState<LeagueSchedule>(() => defaultLeagueSchedule());


  const [course, setCourse] = useState<PickedCourse | null>(null);
  const [layout, setLayout] = useState<PickedLayout | null>(null);
  const [externalScoring, setExternalScoring] = useState<"" | "pdga_live" | "udisc">("");


  // Shared event setup: format, sign-up, scoring, rules, extras
  const [setup, setSetup] = useState<EventSetupState>(() => defaultEventSetup("league"));

  // Keep the legacy league format column in step with the setup answers.
  const legacyLeagueFormat: "singles" | "doubles" | "random_draw_doubles" | "handicap" =
    setup.handicap_enabled
      ? "handicap"
      : setup.format_family === "singles"
        ? "singles"
        : setup.pairing_method === "random_draw" || setup.pairing_method === "blind_draw"
          ? "random_draw_doubles"
          : "doubles";

  const [divs, setDivs] = useState<Div[]>([
    {
      code: "MPO",
      name: "Mixed Pro Open",
      pdga_code: "MPO",
      min_rating: null,
      max_rating: null,
      entry_fee_cents: 0,
      sort_order: 0,
    },
    {
      code: "MA1",
      name: "Mixed Amateur 1",
      pdga_code: "MA1",
      min_rating: null,
      max_rating: null,
      entry_fee_cents: 0,
      sort_order: 1,
    },
    {
      code: "MA2",
      name: "Mixed Amateur 2",
      pdga_code: "MA2",
      min_rating: null,
      max_rating: 934,
      entry_fee_cents: 0,
      sort_order: 2,
    },
  ]);

  // Divisions the TD invented — stored alongside PDGA picks with no pdga_code.
  const customDivs = divs.filter((d) => !d.pdga_code);
  const [customName, setCustomName] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [customMin, setCustomMin] = useState("");
  const [customMax, setCustomMax] = useState("");

  function addCustomDivision() {
    const name = customName.trim();
    if (!name) {
      toast.error("Give the division a name.");
      return;
    }
    const code = (customCode.trim() || slugify(name).replace(/-/g, "").slice(0, 8)).toUpperCase();
    if (!code) {
      toast.error("Give the division a short code.");
      return;
    }
    if (divs.some((d) => d.code === code)) {
      toast.error(`${code} is already on the list.`);
      return;
    }
    const min = customMin ? Number(customMin) : null;
    const max = customMax ? Number(customMax) : null;
    if (min !== null && max !== null && min > max) {
      toast.error("Min rating can't be higher than max rating.");
      return;
    }
    setDivs((prev) => [
      ...prev,
      {
        code,
        name,
        pdga_code: null,
        min_rating: min,
        max_rating: max,
        entry_fee_cents: 0,
        sort_order: prev.length,
      },
    ]);
    setCustomName("");
    setCustomCode("");
    setCustomMin("");
    setCustomMax("");
  }

  const [fees, setFees] = useState<EventFees>(() => defaultEventFees("league"));


  const [tdName, setTdName] = useState("");
  const [tdEmail, setTdEmail] = useState("");
  const [tdPhone, setTdPhone] = useState("");
  const [rulesUrl, setRulesUrl] = useState("https://www.pdga.com/rules");
  const [regCloses, setRegCloses] = useState("");

  // PDGA sanctioning — drives requirements for the rest of the setup.
  const [pdgaSanctioned, setPdgaSanctioned] = useState(false);
  const [pdgaTier, setPdgaTier] = useState("L");
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

  // ---- Saved draft: autosave as steps are filled, resume later ----
  const [pendingDraft, setPendingDraft] = useState<EventDraftRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  const draftFields = useMemo(
    () => ({
      name,
      description,
      season,
      seriesId,
      schedule,
      course,
      layout,
      externalScoring,
      setup,
      divs,
      fees,
      tdName,
      tdEmail,
      tdPhone,
      rulesUrl,
      regCloses,
      pdgaSanctioned,
      pdgaTier,
      pdgaEventNumber,
      sanctionConfirmations,
      // Read by the autosave hook to decide whether there is anything to save.
      course_id: course?.id ?? null,
      start_date: schedule.start_date,
    }),
    [
      name,
      description,
      season,
      seriesId,
      schedule,
      course,
      layout,
      externalScoring,
      setup,
      divs,
      fees,
      tdName,
      tdEmail,
      tdPhone,
      rulesUrl,
      regCloses,
      pdgaSanctioned,
      pdgaTier,
      pdgaEventNumber,
      sanctionConfirmations,
    ],
  );

  const draftState = useEventDraft({
    kind: "league",
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
    setSeason(field(f, "season", `${year}`));
    setSeriesId(field<string | null>(f, "seriesId", null));
    setSchedule(field(f, "schedule", defaultLeagueSchedule()));
    setCourse(field<PickedCourse | null>(f, "course", null));
    setLayout(field<PickedLayout | null>(f, "layout", null));
    setExternalScoring(field<"" | "pdga_live" | "udisc">(f, "externalScoring", ""));
    setSetup(field(f, "setup", defaultEventSetup("league")));
    setDivs(field<Div[]>(f, "divs", []));
    setFees(field(f, "fees", defaultEventFees("league")));
    setTdName(field(f, "tdName", ""));
    setTdEmail(field(f, "tdEmail", ""));
    setTdPhone(field(f, "tdPhone", ""));
    setRulesUrl(field(f, "rulesUrl", "https://www.pdga.com/rules"));
    setRegCloses(field(f, "regCloses", ""));
    setPdgaSanctioned(field(f, "pdgaSanctioned", false));
    setPdgaTier(field(f, "pdgaTier", "L"));
    setPdgaEventNumber(field(f, "pdgaEventNumber", ""));
    setSanctionConfirmations(
      field<SanctionConfirmations>(f, "sanctionConfirmations", {
        approvalConfirmed: false,
        officialsConfirmed: false,
        insuranceConfirmed: false,
      }),
    );
    setStep(Math.min(STEPS.length - 1, Math.max(0, draft.step)));
    draftState.adopt(draft.id);
    setPendingDraft(null);
    setRestoring(false);
  }

  // Load a draft named in the URL, or offer the most recent unfinished league.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (initialDraftId) {
          const draft = await getEventDraft({ data: { id: initialDraftId } });
          if (!cancelled && draft) restoreDraft(draft);
          return;
        }
        const drafts = await listEventDrafts({ data: { kind: "league" } });
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

  /** Apply imported event details onto the wizard. Empty values never blank a field. */
  function applyImportedDetails(draft: ImportedEventDraft) {
    if (draft.name) setName(draft.name);
    if (draft.description) setDescription(draft.description);
    if (draft.start_date) {
      setSeason(draft.start_date.slice(0, 4));
      setSchedule((prev) => ({
        ...prev,
        start_date: draft.start_date ?? prev.start_date,
        end_date: draft.end_date ?? prev.end_date,
      }));
    }
    if (draft.pdga_event_number) {
      setPdgaEventNumber(draft.pdga_event_number);
      setPdgaSanctioned(true);
    }
    const tier = normalizeTierCode(draft.pdga_tier);
    if (tier) {
      setPdgaTier(tier);
      setPdgaSanctioned(true);
    }
    setImportedFrom(draft);
  }


  const validation = useMemo(() => {
    const checks = [
      { label: "League has a name", pass: !!name.trim() },
      { label: "Season label set", pass: !!season.trim() },
      ...scheduleChecks(schedule),
      // Course belongs to each night, not the league. A default course is optional.
      { label: "At least one division", pass: divs.length > 0 },
      { label: "League director email captured", pass: /^\S+@\S+\.\S+$/.test(tdEmail) },
      {
        label: "Pre-registration closing time set (pre-registration only leagues)",
        pass: !requiresPreRegClose(setup.signup_type) || !!regCloses,
      },
      ...feeChecks(fees),
      ...sanctioningChecks({
        sanctioned: pdgaSanctioned,
        tier: pdgaSanctioned ? pdgaTier : null,
        eventNumber: pdgaEventNumber,
        rounds: [{ holes_played: schedule.holes_played }],
        signupType: setup.signup_type,
        officialsConfirmed: sanctionConfirmations.officialsConfirmed,
        approvalConfirmed: sanctionConfirmations.approvalConfirmed,
        insuranceConfirmed: sanctionConfirmations.insuranceConfirmed,
        payoutKind: fees.payout.kind,
        divisionCodes: divs.map((d) => d.code),
      }),
    ];
    return { checks, ok: checks.every((c) => c.pass) };
  }, [
    name,
    season,
    schedule,
    course,
    divs,
    tdEmail,
    externalScoring,
    fees,
    setup.signup_type,
    regCloses,
    pdgaSanctioned,
    pdgaTier,
    pdgaEventNumber,
    sanctionConfirmations,
  ]);

  async function publish() {
    if (!user || !validation.ok) return toast.error("Complete the required fields first");
    setBusy(true);
    try {
      const cleanName = stripEventSourceBrands(name);
      const slug = `${slugify(cleanName)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: l, error } = await supabase
        .from("leagues")
        .insert({
          owner_id: user.id,
          name: cleanName,
          slug,
          description: description || null,
          season: season || null,
          status: "active",
          series_id: seriesId,
          course_id: course?.id ?? null,
          layout_id: layout?.id ?? null,
          external_scoring: externalScoring || null,
          format: legacyLeagueFormat,
          ...setupToColumns(setup, { schedule, fees }),
          registration_closes: regCloses ? new Date(regCloses).toISOString() : null,
          ...standingsToColumns(schedule),
          handicap_method: setup.handicap_enabled ? setup.handicap.basis : null,
          day_of_week: schedule.day_of_week,
          start_time: schedule.start_time,
          start_date: schedule.start_date,
          end_date: schedule.end_date,
          holes_played: schedule.holes_played,
          weeks_planned: activeWeeks(schedule).length || schedule.weeks_planned,

          ...feesToColumns(fees, "night"),
          pdga_sanctioned: pdgaSanctioned,
          pdga_tier: pdgaSanctioned ? pdgaTier : null,
          pdga_event_number: pdgaSanctioned ? pdgaEventNumber || null : null,
          rules_url: rulesUrl || null,
          td_name: tdName || null,
          td_email: tdEmail || null,
          td_phone: tdPhone || null,
        })
        .select("id, slug")
        .single();
      if (error) throw error;

      if (divs.length) {
        await supabase.from("league_divisions").insert(
          divs.map((d) => ({
            league_id: l!.id,
            code: d.code,
            name: d.name,
            pdga_code: d.pdga_code,
            min_rating: d.min_rating,
            max_rating: d.max_rating,
            entry_fee_cents: d.entry_fee_cents,
            sort_order: d.sort_order,
          })),
        );
      }

      const nights = activeWeeks(schedule);
      if (schedule.create_events && nights.length > 0) {
        const snapshot = rulesSnapshot(setup);
        await supabase.from("league_events").insert(
          nights.map((w, i) => ({
            league_id: l!.id,
            week_number: i + 1,
            event_date: w.date,
            course_id: w.course_id ?? course?.id ?? null,
            layout_id: w.layout_id ?? null,
            holes_played: w.holes_played ?? schedule.holes_played,
            rounds: w.rounds && w.rounds > 0 ? w.rounds : 1,
            name: w.course_name && schedule.venue_mode === "rotate" ? w.course_name : null,
            rules_snapshot: snapshot,
          })),
        );
      }



      const checklist = buildTdChecklist({
        sanctioned: pdgaSanctioned,
        tier: pdgaSanctioned ? pdgaTier : null,
      });
      if (checklist.length) {
        await supabase.from("league_checklist_items").insert(
          checklist.map((c, i) => ({
            league_id: l!.id,
            phase: c.phase,
            label: c.label,
            sort_order: i,
          })),
        );
      }

      await draftState.discard();
      toast.success("League published — invite your regulars next");
      navigate({ to: "/leagues/$slug", params: { slug: l!.slug }, hash: "invite" });
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
              <EventImportPanel kind="league" onApply={applyImportedDetails} />
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Label>League name *</Label>
                  {importedFrom && (
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Imported from {importedFrom.source === "pdga" ? "PDGA" : "UDisc"}
                    </span>
                  )}
                </div>

                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tuesday Night Doubles"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Season</Label>
                  <Input
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    placeholder="Spring 2026"
                  />
                </div>
              </div>
              <SeriesPicker value={seriesId} onChange={setSeriesId} kind="league" />
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          )}


          {current.k === "schedule" && (
            <div className="space-y-4">
              <ScheduleStep
                value={schedule}
                onChange={setSchedule}
                home={{
                  course_id: course?.id ?? null,
                  course_name: course?.name ?? null,
                  layout_id: layout?.id ?? null,
                  layout_name: layout?.name ?? null,
                  layout_holes: layout?.hole_count ?? course?.hole_count ?? null,
                }}
              />
              <SeasonPreview
                value={schedule}
                onChange={setSchedule}
                home={{
                  course_id: course?.id ?? null,
                  course_name: course?.name ?? null,
                  layout_id: layout?.id ?? null,
                  layout_name: layout?.name ?? null,
                  layout_holes: layout?.hole_count ?? course?.hole_count ?? null,
                }}
              />
            </div>
          )}


          {current.k === "course" && (
            <div className="space-y-4">
              <CoursePicker
                courseId={course?.id ?? null}
                layoutId={layout?.id ?? null}
                onCourse={setCourse}
                onLayout={setLayout}
              />
              <VenueField
                value={schedule}
                onChange={setSchedule}
                home={{
                  course_id: course?.id ?? null,
                  course_name: course?.name ?? null,
                  layout_id: layout?.id ?? null,
                  layout_name: layout?.name ?? null,
                  layout_holes: layout?.hole_count ?? course?.hole_count ?? null,
                }}
              />
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
                if (next.signup_type === "casual") setRegCloses("");
              }}
              kind="league"
              registrationCloses={regCloses}
              onRegistrationClosesChange={setRegCloses}
            />
          )}

          {current.k === "sanctioning" && (
            <SanctioningStep
              kind="league"
              sanctioned={pdgaSanctioned}
              tier={pdgaTier}
              eventNumber={pdgaEventNumber}
              confirmations={sanctionConfirmations}
              rounds={activeWeeks(schedule).length || schedule.weeks_planned || 1}
              hasEntryFee={(fees.entry_fee_cents || 0) > 0}
              onSanctionedChange={setPdgaSanctioned}
              onTierChange={setPdgaTier}
              onEventNumberChange={setPdgaEventNumber}
              onConfirmationsChange={setSanctionConfirmations}
            />
          )}

          {current.k === "scoring" && (
            <div className="space-y-6">
              <ScoringStep
                value={setup}
                onChange={setSetup}
                schedule={schedule}
                onScheduleChange={setSchedule}
              />
            </div>
          )}

          {current.k === "rules" && (
            <div className="space-y-4">
              <RulesStep value={setup} onChange={setSetup} />
              <div>
                <div className="mb-2 text-[14px] font-semibold">
                  {pdgaSanctioned
                    ? "Rules to hold the field to"
                    : "Fun formats and weekly quirks to try"}
                </div>
                <EventPlaybook
                  sections={buildEventPlaybook({
                    sanctioned: pdgaSanctioned,
                    tier: pdgaSanctioned ? pdgaTier : null,
                    rounds: activeWeeks(schedule).length || schedule.weeks_planned || 1,
                    hasEntryFee: (fees.entry_fee_cents || 0) > 0,
                  }).filter((sec) => (pdgaSanctioned ? sec.id === "course" : sec.id === "fun"))}
                />
              </div>
            </div>
          )}

          {current.k === "divisions" && (
            <div className="space-y-3">
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
                Toggle divisions available for signup. Ratings brackets match the PDGA Competition
                Manual.
              </p>
              <div className="max-h-[360px] overflow-y-auto rounded-md border border-border">
                {PDGA_DIVISIONS.filter((d) => d.category !== "junior").map((d) => {
                  const on = divs.some((x) => x.code === d.code);
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
                          {divisionRatingLabel(d)}
                        </div>
                      </div>
                      <Switch
                        checked={on}
                        onCheckedChange={(v) =>
                          setDivs((prev) =>
                            v
                              ? [
                                  ...prev,
                                  {
                                    code: d.code,
                                    name: d.name,
                                    pdga_code: d.code,
                                    min_rating: d.min_rating ?? null,
                                    max_rating: d.max_rating ?? null,
                                    entry_fee_cents: 0,
                                    sort_order: prev.length,
                                  },
                                ]
                              : prev.filter((x) => x.code !== d.code),
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <div className="rounded-md border border-border p-3">
                <div className="text-sm font-medium">Custom divisions</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Add your own division for anything the PDGA list doesn't cover — juniors night,
                  putters only, first-timers. Rating limits are optional.
                </p>

                {customDivs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {customDivs.map((d) => (
                      <div
                        key={d.code}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {d.code} — {d.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {d.min_rating || d.max_rating
                              ? `${d.min_rating ?? "any"}–${d.max_rating ?? "any"} rating`
                              : "Any rating"}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDivs((prev) => prev.filter((x) => x.code !== d.code))}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_110px_110px_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Division name</Label>
                    <Input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Putters Only"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Short code</Label>
                    <Input
                      value={customCode}
                      onChange={(e) => setCustomCode(e.target.value.toUpperCase().slice(0, 12))}
                      placeholder="PUTT"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Min rating</Label>
                    <Input
                      inputMode="numeric"
                      value={customMin}
                      onChange={(e) => setCustomMin(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="Any"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max rating</Label>
                    <Input
                      inputMode="numeric"
                      value={customMax}
                      onChange={(e) => setCustomMax(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="Any"
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={addCustomDivision}>
                    Add division
                  </Button>
                </div>
              </div>
            </div>
          )}


          {current.k === "fees" && (
            <div className="space-y-4">
              {tierRules ? (
                <TierNote
                  text={`${tierRules.label} payout: ${payoutStyleLabel(tierRules.payoutStyle)}. Sanctioning fee is $${(tierRules.playerFeeCents / 100).toFixed(2)} per player per night, on top of your entry fee.`}
                />
              ) : null}
              <FeesStep value={fees} onChange={setFees} unit="night" />
            </div>
          )}


          {current.k === "contact" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>League director (LD) name</Label>
                <Input value={tdName} onChange={(e) => setTdName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>League director email *</Label>
                <Input type="email" value={tdEmail} onChange={(e) => setTdEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>League director phone</Label>
                <Input value={tdPhone} onChange={(e) => setTdPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Rules URL</Label>
                <Input value={rulesUrl} onChange={(e) => setRulesUrl(e.target.value)} />
              </div>
            </div>
          )}

          {current.k === "review" && (
            <div className="space-y-3">
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
              <div className="rounded-md border border-border p-3 text-sm">
                <div className="font-semibold">
                  {name || <em>Untitled</em>} — {season}
                </div>
                <div className="text-muted-foreground">
                  {summarizeSchedule(schedule, course?.name ?? null)}
                </div>
                <div className="text-muted-foreground">{summarizeSetup(setup)}</div>
                <div className="text-muted-foreground">
                  {schedule.start_date} → {schedule.end_date}
                </div>

                {schedule.venue_mode === "rotate" && schedule.rotation.length > 0 && (
                  <div className="text-muted-foreground">
                    Rotation: {schedule.rotation.map((r) => r.course_name).join(" → ")}
                  </div>
                )}

                <div className="text-muted-foreground">{summarizeFees(fees, "night")}</div>
              </div>
              <FeeBreakdown fees={fees} unit="night" />

            </div>
          )}
        </div>

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
              {busy ? "Publishing…" : "Publish league"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
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
