/**
 * Phase 9 — server-only Tier worker. Gathers verified evidence, runs the pure
 * engine, writes state/ledger/history with the service role. Never reads ratings.
 */
import { computeTier, resolveTier, CORRECTION_REASONS, TIER_VERSION, type CredentialKind, type TierSignals, type Tier, type Category } from "./engine";

type Admin = any;

async function all<T = any>(q: any): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error("Tier evidence read failed");
  return (data ?? []) as T[];
}

export async function gatherSignals(admin: Admin, u: string, asOf = new Date().toISOString().slice(0, 10)) {
  const [rounds, ext, contrib, tours, leagues, clubs, director, creds, adj] = await Promise.all([
    all(admin.from("canonical_rounds").select("id,played_on,course_id,course_key,eligibility,has_possible_duplicate").eq("user_id", u).limit(20000)),
    all(admin.from("external_rounds").select("source,pdga_event_ref,event_name,played_on,event_context").eq("user_id", u).limit(20000)),
    all(admin.from("contributions").select("id,points,kind,verified_at").eq("user_id", u).eq("status", "verified").limit(5000)),
    all(admin.from("tournaments").select("id,name,end_date").eq("owner_id", u).eq("status", "completed").is("imported_source", null).limit(1000)),
    all(admin.from("leagues").select("id,name,start_date").eq("owner_id", u).in("status", ["active", "completed"]).limit(1000)),
    all(admin.from("club_members").select("club_id,role").eq("user_id", u).in("role", ["owner", "admin"]).limit(100)),
    all(admin.from("director_profiles").select("status,approved_at,pdga_number").eq("user_id", u).eq("status", "approved").limit(1)),
    all(admin.from("dgd_credentials").select("id,kind,source,verified_at,expires_at").eq("user_id", u).eq("status", "verified").limit(50)),
    all(admin.from("dgd_tier_adjustments").select("id,category,points,reason,created_at").eq("user_id", u).is("revoked_at", null).limit(200)),
  ]);

  const good = rounds.filter((r: any) => !r.has_possible_duplicate && r.played_on);
  const days = [...new Set(good.map((r: any) => r.played_on as string))].sort();
  const courses = new Set(good.map((r: any) => String(r.course_id ?? r.course_key ?? "")).filter(Boolean));
  const eventKeys = new Set<string>();
  for (const e of ext) {
    if (e.source === "pdga" && (e.pdga_event_ref || e.event_name)) eventKeys.add(`pdga:${e.pdga_event_ref ?? e.event_name}`);
    else if (e.event_context && e.event_name) eventKeys.add(`${e.source}:${e.event_name}:${String(e.played_on).slice(0, 7)}`);
  }
  // Clubs only count when they have real membership.
  let clubLead = 0;
  for (const c of clubs) {
    const { count } = await admin.from("club_members").select("user_id", { count: "exact", head: true }).eq("club_id", c.club_id);
    if ((count ?? 0) >= 5) clubLead++;
  }
  const now = Date.now();
  const credKinds = new Set<CredentialKind>(creds.filter((c: any) => !c.expires_at || Date.parse(c.expires_at) > now).map((c: any) => c.kind));
  if (director.length) credKinds.add("TOURNAMENT_DIRECTOR");

  const signals: TierSignals = {
    first_activity_on: days[0] ?? null, as_of: asOf,
    active_years: new Set(days.map((d) => d.slice(0, 4))).size,
    active_months: new Set(days.map((d) => d.slice(0, 7))).size,
    verified_rounds: good.length, play_days: days.length, unique_courses: courses.size,
    events_played: eventKeys.size, events_directed: tours.length, leagues_organized: leagues.length,
    club_leadership: clubLead,
    contribution_points: contrib.reduce((a: number, c: any) => a + Number(c.points ?? 0), 0),
    credentials: [...credKinds],
    adjustments: adj.map((a: any) => ({ category: a.category as Category, points: Number(a.points) })),
  };

  const ledger = [
    { category: "EXPERIENCE", source: "canonical_rounds", verification: "CANONICAL", detail: `First verified round ${signals.first_activity_on ?? "—"}; ${signals.active_years} active years`, occurred_on: signals.first_activity_on },
    { category: "PLAYING", source: "canonical_rounds", verification: "CANONICAL", detail: `${signals.play_days} play days, ${signals.verified_rounds} verified rounds (possible duplicates excluded)` },
    { category: "COURSES", source: "canonical_rounds", verification: "CANONICAL", detail: `${signals.unique_courses} unique courses (layouts not counted separately)` },
    { category: "EVENTS", source: "external_rounds", verification: "SOURCE_RECORD", detail: `${signals.events_played} unique organized events` },
    ...tours.map((t: any) => ({ category: "SERVICE", source: "tournaments", source_record: t.id, verification: "OWNER_RECORD", detail: `Directed: ${t.name}`, occurred_on: t.end_date })),
    ...leagues.map((l: any) => ({ category: "SERVICE", source: "leagues", source_record: l.id, verification: "OWNER_RECORD", detail: `Organized league: ${l.name}`, occurred_on: l.start_date })),
    ...(clubLead ? [{ category: "SERVICE", source: "club_members", verification: "ROLE_RECORD", detail: `Leads ${clubLead} club(s) with 5+ members` }] : []),
    ...contrib.map((c: any) => ({ category: "SERVICE", source: "contributions", source_record: c.id, verification: "APPROVED", detail: `Approved contribution: ${c.kind} (${c.points} pts)`, occurred_on: c.verified_at?.slice(0, 10) })),
    ...creds.map((c: any) => ({ category: "CREDENTIALS", source: `dgd_credentials:${c.source}`, source_record: c.id, verification: "VERIFIED", detail: c.kind, occurred_on: c.verified_at?.slice(0, 10) })),
    ...(director.length ? [{ category: "CREDENTIALS", source: "director_profiles", verification: "ADMIN_APPROVED", detail: "TOURNAMENT_DIRECTOR", occurred_on: director[0].approved_at?.slice(0, 10) }] : []),
    ...adj.map((a: any) => ({ category: a.category, source: "dgd_tier_adjustments", source_record: a.id, verification: "ADMIN_ADJUSTMENT", detail: a.reason, occurred_on: a.created_at?.slice(0, 10), points: Number(a.points) })),
  ];
  return { signals, ledger };
}

export async function recomputeTier(admin: Admin, u: string, reason: string) {
  const { signals, ledger } = await gatherSignals(admin, u);
  const r = computeTier(signals);
  const { data: prev } = await admin.from("dgd_tier_state").select("current_tier,highest_tier_earned,tier_earned_at").eq("user_id", u).maybeSingle();
  const correction = CORRECTION_REASONS.has(reason);
  const current: Tier = resolveTier((prev?.current_tier as Tier) ?? null, r.computed_tier, correction);
  const highest: Tier = resolveTier((prev?.highest_tier_earned as Tier) ?? null, current, false);
  const changed = prev?.current_tier !== current;
  const now = new Date().toISOString();
  const career = {
    years_active: Math.round(((Date.parse(signals.as_of) - Date.parse(signals.first_activity_on ?? signals.as_of)) / (365.25 * 86_400_000)) * 10) / 10,
    verified_rounds: signals.verified_rounds, events_played: signals.events_played, unique_courses: signals.unique_courses,
    events_directed: signals.events_directed, leagues_organized: signals.leagues_organized,
    courses_stewarded: signals.credentials.includes("COURSE_STEWARD") ? 1 : 0,
    community_contributions: Math.round(signals.contribution_points), credentials: signals.credentials,
  };
  await admin.from("dgd_tier_state").upsert({
    user_id: u, tier_version: TIER_VERSION, tier_score: r.score, current_tier: current, highest_tier_earned: highest,
    tier_earned_at: changed ? now : (prev?.tier_earned_at ?? now), categories: r.categories, career, next_tier: r.next, updated_at: now,
  }, { onConflict: "user_id" });
  // Ledger is a derived explanation: replaced on each recompute; history stays immutable.
  await admin.from("dgd_tier_ledger").delete().eq("user_id", u);
  const per = r.categories;
  if (ledger.length) await admin.from("dgd_tier_ledger").insert(ledger.map((l: any) => ({
    user_id: u, tier_version: TIER_VERSION, category: l.category, source: l.source, source_record: l.source_record ?? null,
    verification: l.verification, detail: l.detail ?? null, occurred_on: l.occurred_on ?? null,
    points: l.points ?? (["EXPERIENCE", "PLAYING", "COURSES", "EVENTS"].includes(l.category) ? per[l.category as Category].points : 0),
  })));
  if (changed) await admin.from("dgd_tier_history").insert({ user_id: u, from_tier: prev?.current_tier ?? null, to_tier: current, tier_version: TIER_VERSION, tier_score: r.score, reason });
  const earned: string[] = [];
  if (career.verified_rounds >= 1) earned.push("dgd_first_rated");
  if (career.unique_courses >= 10) earned.push("dgd_courses_10");
  if (career.unique_courses >= 25) earned.push("courses_25");
  if (career.years_active >= 1) earned.push("dgd_years_1");
  if (career.years_active >= 3) earned.push("dgd_years_3");
  if (career.events_directed >= 1) earned.push("dgd_td_first");
  if (career.events_directed >= 10) earned.push("dgd_td_10");
  if (signals.credentials.length > 0) earned.push("dgd_verified_credential");
  if (highest === "GOLD") earned.push("dgd_tier_gold");
  for (const key of earned) await admin.rpc("award_achievement", { _user: u, _key: key });
  return { user: u, tier: current, score: r.score, changed };
}

export async function processTierJobs(admin: Admin, limit = 25) {
  const { data: jobs } = await admin.from("dgd_tier_jobs").select("user_id,reason,queued_at").order("queued_at").limit(limit);
  let done = 0, failed = 0;
  for (const j of jobs ?? []) {
    try {
      await recomputeTier(admin, j.user_id, j.reason);
      await admin.from("dgd_tier_jobs").delete().eq("user_id", j.user_id).lte("queued_at", j.queued_at);
      done++;
    } catch { failed++; }
  }
  return { tier_jobs: (jobs ?? []).length, tier_done: done, tier_failed: failed };
}
