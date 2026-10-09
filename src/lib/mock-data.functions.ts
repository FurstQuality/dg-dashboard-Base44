import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only mock data toggle.
 *
 * Every row created by the seeder is recorded in `mock_seed_registry`
 * so the unseeder can remove exactly what it added — nothing real is
 * ever touched. A dedicated sandbox auth user is provisioned via the
 * Supabase Admin API so the admin can sign in as a non-privileged
 * account to test end-to-end flows.
 */

const SANDBOX_BATCH = "chainlink_sandbox";
const SANDBOX_EMAIL = "sandbox-player@dgdashboard.local";

async function assertAdmin(context: any) {
  const rpc = context.supabase.rpc.bind(context.supabase);
  const [admin, superAdmin] = await Promise.all([
    rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
  ]);
  if (!admin.data && !superAdmin.data) throw new Error("Forbidden — admin only");
}

function randomPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function dateDaysAgo(n: number): string {
  return daysAgo(n).slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Status                                                             */
/* ------------------------------------------------------------------ */

export const getMockDataStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const settings = await context.supabase
      .from("admin_settings")
      .select(
        "mock_data_enabled, sandbox_user_id, sandbox_email, sandbox_password_hint, last_seeded_at, last_activity_at",
      )
      .eq("id", true)
      .maybeSingle();

    const registry = await context.supabase
      .from("mock_seed_registry")
      .select("table_name")
      .eq("batch", SANDBOX_BATCH);

    const counts: Record<string, number> = {};
    for (const row of registry.data ?? []) {
      const t = (row as { table_name: string }).table_name;
      counts[t] = (counts[t] ?? 0) + 1;
    }

    return {
      enabled: !!settings.data?.mock_data_enabled,
      sandboxUserId: settings.data?.sandbox_user_id ?? null,
      sandboxEmail: settings.data?.sandbox_email ?? null,
      sandboxPasswordHint: settings.data?.sandbox_password_hint ?? null,
      lastSeededAt: settings.data?.last_seeded_at ?? null,
      lastActivityAt: settings.data?.last_activity_at ?? null,
      counts,
      total: (registry.data ?? []).length,
    };
  });

/* ------------------------------------------------------------------ */
/* Enable / Seed                                                       */
/* ------------------------------------------------------------------ */

export const enableMockData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { resetIfExists?: boolean }) =>
    z.object({ resetIfExists: z.boolean().optional() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminUserId = context.userId;

    // If an old sandbox exists and caller wants a reset, tear it down first.
    if (data.resetIfExists) {
      await tearDown(adminUserId);
    }

    // 1. Sandbox auth user ---------------------------------------------------
    const existing = await supabaseAdmin
      .from("admin_settings")
      .select("sandbox_user_id, sandbox_email")
      .eq("id", true)
      .maybeSingle();

    let sandboxUserId = existing.data?.sandbox_user_id as string | null;
    let sandboxEmail = existing.data?.sandbox_email as string | null;
    let password: string | null = null;

    if (!sandboxUserId) {
      // The sandbox auth user may already exist from a previous run even when
      // admin_settings lost the reference — reuse it instead of failing.
      const found = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const priorUser = (found.data?.users ?? []).find(
        (u) => (u.email ?? "").toLowerCase() === SANDBOX_EMAIL,
      );

      if (priorUser) {
        const password_ = randomPassword();
        const updated = await supabaseAdmin.auth.admin.updateUserById(priorUser.id, {
          password: password_,
          email_confirm: true,
          user_metadata: {
            username: "sandbox_player",
            display_name: "Sandbox Player",
            full_name: "Sandbox Player",
          },
        });
        if (updated.error) {
          throw new Error(`Could not reuse sandbox user: ${updated.error.message}`);
        }
        sandboxUserId = priorUser.id;
        sandboxEmail = priorUser.email ?? SANDBOX_EMAIL;
        password = password_;
      } else {
        const password_ = randomPassword();
        const created = await supabaseAdmin.auth.admin.createUser({
          email: SANDBOX_EMAIL,
          password: password_,
          email_confirm: true,
          user_metadata: {
            username: "sandbox_player",
            display_name: "Sandbox Player",
            full_name: "Sandbox Player",
          },
        });
        if (created.error || !created.data.user) {
          throw new Error(`Could not create sandbox user: ${created.error?.message ?? "unknown"}`);
        }
        sandboxUserId = created.data.user.id;
        sandboxEmail = SANDBOX_EMAIL;
        password = password_;
      }
    }

    const seeded: Array<{ table_name: string; row_id: string }> = [];
    const record = (table_name: string, row_id: string) => seeded.push({ table_name, row_id });

    // 2. Courses (approved, owned by admin) ---------------------------------
    const courseSpecs = [
      {
        name: "Sandbox Pines DGC",
        city: "Peoria",
        state: "IL",
        lat: 40.6936,
        lng: -89.589,
        difficulty: "intermediate",
      },
      {
        name: "Ledgestone Sandbox",
        city: "East Peoria",
        state: "IL",
        lat: 40.6698,
        lng: -89.5806,
        difficulty: "advanced",
      },
    ];
    const courses: Array<{ id: string; layoutId: string; name: string }> = [];

    for (const spec of courseSpecs) {
      // A previous partial run can leave sandbox courses behind — reuse them
      // instead of tripping the duplicate-course guard.
      const prior = await supabaseAdmin
        .from("courses")
        .select("id")
        .eq("source", "chainlink_sandbox")
        .eq("name", spec.name)
        .maybeSingle();

      let courseId = prior.data?.id as string | undefined;

      if (!courseId) {
        const suffix = Math.random().toString(36).slice(2, 6);
        const { data: c, error: ce } = await supabaseAdmin
          .from("courses")
          .insert({
            name: spec.name,
            slug: `${slugify(spec.name)}-${suffix}`,
            city: spec.city,
            state: spec.state,
            country: "USA",
            latitude: spec.lat,
            longitude: spec.lng,
            hole_count: 18,
            difficulty: spec.difficulty,
            moderation_status: "approved",
            reviewed_by: adminUserId,
            reviewed_at: new Date().toISOString(),
            created_by: adminUserId,
            source: "chainlink_sandbox",
          })
          .select("id")
          .single();
        if (ce || !c) throw new Error(`course insert failed: ${ce?.message}`);
        courseId = c.id;
      }
      record("courses", courseId);

      const priorLayout = await supabaseAdmin
        .from("course_layouts")
        .select("id")
        .eq("course_id", courseId)
        .eq("name", "Main 18")
        .maybeSingle();

      let layoutId = priorLayout.data?.id as string | undefined;

      if (!layoutId) {
        const { data: layout, error: le } = await supabaseAdmin
          .from("course_layouts")
          .insert({
            course_id: courseId,
            name: "Main 18",
            hole_count: 18,
            par_total: 54,
            distance_total: 6800,
            is_default: true,
            scratch_rating: 950,
            stroke_value: 10,
          })
          .select("id")
          .single();
        if (le || !layout) throw new Error(`layout insert failed: ${le?.message}`);
        layoutId = layout.id;

        const holes = Array.from({ length: 18 }, (_, i) => ({
          layout_id: layoutId!,
          number: i + 1,
          par: 3 + (i % 6 === 5 ? 1 : 0),
          distance_ft: 260 + ((i * 37) % 400),
        }));
        const { error: he } = await supabaseAdmin.from("holes").insert(holes);
        if (he) throw new Error(`holes insert failed: ${he.message}`);
      }
      record("course_layouts", layoutId);

      courses.push({ id: courseId, layoutId, name: spec.name });
    }

    // 3. Tournaments ---------------------------------------------------------
    const tournamentSpecs = [
      { name: "Sandbox Open — Draft", status: "draft", start: 30, end: 32 },
      { name: "Sandbox Open — Registration", status: "registration_open", start: 21, end: 23 },
      { name: "Sandbox Open — Live", status: "in_progress", start: -1, end: 1 },
    ] as const;
    for (const spec of tournamentSpecs) {
      const suffix = Math.random().toString(36).slice(2, 6);
      const { data: t, error: te } = await supabaseAdmin
        .from("tournaments")
        .insert({
          owner_id: adminUserId,
          name: spec.name,
          slug: `${slugify(spec.name)}-${suffix}`,
          format: "stroke_play",
          status: spec.status,
          start_date: dateDaysAgo(-spec.start),
          end_date: dateDaysAgo(-spec.end),
          location: `${courses[0].name}, Peoria IL`,
          latitude: courseSpecs[0].lat,
          longitude: courseSpecs[0].lng,
          course_id: courses[0].id,
          layout_id: courses[0].layoutId,
          pdga_sanctioned: spec.status !== "draft",
          pdga_tier: "C",
          entry_fee_cents: 5000,
          max_players: 72,
          td_name: "Sandbox TD",
          td_email: "td@dgdashboard.local",
        })
        .select("id")
        .single();
      if (te || !t) throw new Error(`tournament insert failed: ${te?.message}`);
      record("tournaments", t.id);

      // Skip tournament_registrations — requires a division_id and a
      // full division setup. Divisions are exercised in the tournament
      // wizard itself; the sandbox only needs the shell tournaments to
      // exist for TD console / registration list flows to render.
      void sandboxUserId;
    }

    // 4. Leagues -------------------------------------------------------------
    const leagueSuffix = Math.random().toString(36).slice(2, 6);
    const { data: league, error: lge } = await supabaseAdmin
      .from("leagues")
      .insert({
        owner_id: adminUserId,
        name: "Sandbox Weekly League",
        slug: `sandbox-weekly-${leagueSuffix}`,
        format: "singles",
        status: "active",
        points_system: "standard",
        course_id: courses[1].id,
        layout_id: courses[1].layoutId,
        day_of_week: 3,
        start_date: dateDaysAgo(28),
        end_date: dateDaysAgo(-56),
        holes_played: 18,
        weeks_planned: 12,
        td_name: "Sandbox TD",
      })
      .select("id")
      .single();
    if (lge || !league) throw new Error(`league insert failed: ${lge?.message}`);
    record("leagues", league.id);

    // 5. Rounds — scored, mix admin + sandbox user ---------------------------
    const roundSpecs: Array<{
      userId: string;
      dayOffset: number;
      toPar: number;
      courseIndex: number;
    }> = [
      { userId: adminUserId, dayOffset: 3, toPar: -4, courseIndex: 0 },
      { userId: adminUserId, dayOffset: 9, toPar: -1, courseIndex: 1 },
      { userId: adminUserId, dayOffset: 17, toPar: -6, courseIndex: 0 },
      { userId: adminUserId, dayOffset: 24, toPar: 2, courseIndex: 1 },
      { userId: sandboxUserId!, dayOffset: 5, toPar: 3, courseIndex: 0 },
      { userId: sandboxUserId!, dayOffset: 12, toPar: 0, courseIndex: 1 },
      { userId: sandboxUserId!, dayOffset: 20, toPar: -2, courseIndex: 0 },
      { userId: sandboxUserId!, dayOffset: 27, toPar: 5, courseIndex: 1 },
    ];
    for (const spec of roundSpecs) {
      const course = courses[spec.courseIndex];
      const started = daysAgo(spec.dayOffset);
      const ended = daysAgo(spec.dayOffset - 0.1);
      const { data: r, error: re } = await supabaseAdmin
        .from("rounds")
        .insert({
          course_id: course.id,
          layout_id: course.layoutId,
          created_by: spec.userId,
          status: "completed",
          started_at: started,
          ended_at: ended,
          notes: "Sandbox mock round",
        })
        .select("id")
        .single();
      if (re || !r) throw new Error(`round insert failed: ${re?.message}`);
      record("rounds", r.id);

      // Companion external_round so ratings & StatLink light up
      const rr = 950 - spec.toPar * 10;
      const { data: ext, error: ee } = await supabaseAdmin
        .from("external_rounds")
        .insert({
          user_id: spec.userId,
          source: "sandbox",
          course_name: course.name,
          layout_name: "Main 18",
          played_on: dateDaysAgo(spec.dayOffset),
          score: 54 + spec.toPar,
          to_par: spec.toPar,
          round_rating: rr,
          ssa: 54,
          format: "singles",
          trust_level: "manual",
          included: true,
        })
        .select("id")
        .single();
      if (!ee && ext) record("external_rounds", ext.id);
    }

    // 6. Feed posts ----------------------------------------------------------
    const postBodies = [
      {
        author: adminUserId,
        body: "🧪 Sandbox mode is on — testing tournament flows this week.",
        type: "text" as const,
      },
      {
        author: sandboxUserId!,
        body: "First round on Sandbox Pines. Course flows nice.",
        type: "text" as const,
      },
      {
        author: sandboxUserId!,
        body: "Card of -2 today. Feeling the form come back.",
        type: "roundcard" as const,
      },
    ];
    for (const p of postBodies) {
      const { data: post, error: pe } = await supabaseAdmin
        .from("posts")
        .insert({
          author_id: p.author,
          type: p.type,
          body: p.body,
        })
        .select("id")
        .single();
      if (!pe && post) record("posts", post.id);
    }

    // 7. Register everything in the seed registry ---------------------------
    if (seeded.length) {
      const rows = seeded.map((s) => ({
        table_name: s.table_name,
        row_id: s.row_id,
        batch: SANDBOX_BATCH,
        seeded_by: adminUserId,
      }));
      const { error: regErr } = await supabaseAdmin
        .from("mock_seed_registry")
        .upsert(rows, { onConflict: "table_name,row_id" });
      if (regErr) throw new Error(`registry insert failed: ${regErr.message}`);
    }

    // 8. Flip the flag -------------------------------------------------------
    const passwordHint = password ? `${password.slice(0, 3)}…${password.slice(-2)}` : null;
    await supabaseAdmin
      .from("admin_settings")
      .update({
        mock_data_enabled: true,
        sandbox_user_id: sandboxUserId,
        sandbox_email: sandboxEmail,
        sandbox_password_hint: password
          ? passwordHint
          : ((existing.data as { sandbox_password_hint?: string } | null)?.sandbox_password_hint ??
            null),
        last_seeded_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", true);

    return {
      ok: true,
      seededCount: seeded.length,
      sandboxUserId,
      sandboxEmail,
      // Password is only returned when the sandbox user was created THIS call.
      // On subsequent enables it is null — use rotateSandboxPassword to reveal a new one.
      sandboxPassword: password,
    };
  });

/* ------------------------------------------------------------------ */
/* Disable / tear down                                                */
/* ------------------------------------------------------------------ */

/**
 * FK-safe delete order. Parents cascade to their children (rounds ->
 * round_ratings/scores, courses -> layouts/holes/features) so we only
 * need to delete parents.
 */
const DELETE_ORDER = [
  "posts",
  "external_rounds",
  "tournament_registrations",
  "rounds",
  "tournaments",
  "leagues",
  "course_layouts",
  "courses",
];

async function tearDown(adminUserId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: registry } = await supabaseAdmin
    .from("mock_seed_registry")
    .select("id, table_name, row_id")
    .eq("batch", SANDBOX_BATCH);

  const grouped = new Map<string, string[]>();
  for (const r of registry ?? []) {
    const rec = r as { table_name: string; row_id: string };
    const arr = grouped.get(rec.table_name) ?? [];
    arr.push(rec.row_id);
    grouped.set(rec.table_name, arr);
  }

  for (const table of DELETE_ORDER) {
    const ids = grouped.get(table);
    if (!ids || !ids.length) continue;

    await (supabaseAdmin.from as any)(table).delete().in("id", ids);
  }

  // Safety sweep: earlier runs could lose their registry rows, leaving sandbox
  // records visible in search and directories. Clear anything still named for
  // the sandbox so "sandbox off" always means "no sandbox data".
  const sandboxCourses = await supabaseAdmin
    .from("courses")
    .select("id")
    .ilike("name", "%sandbox%");
  const courseIds = (sandboxCourses.data ?? []).map((c) => c.id);
  const sandboxTournaments = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .ilike("name", "%sandbox%");
  const tournamentIds = (sandboxTournaments.data ?? []).map((t) => t.id);

  if (tournamentIds.length) {
    await supabaseAdmin
      .from("tournament_registrations")
      .delete()
      .in("tournament_id", tournamentIds);
    await supabaseAdmin.from("tournament_rounds").delete().in("tournament_id", tournamentIds);
    await supabaseAdmin.from("tournaments").delete().in("id", tournamentIds);
  }
  await supabaseAdmin.from("leagues").delete().ilike("name", "%sandbox%");
  if (courseIds.length) {
    await supabaseAdmin.from("course_layouts").delete().in("course_id", courseIds);
    await supabaseAdmin.from("courses").delete().in("id", courseIds);
  }
  const sandboxProfiles = await supabaseAdmin
    .from("profiles")
    .select("id")
    .or("username.ilike.%sandbox%,display_name.ilike.%sandbox%");
  const profileIds = (sandboxProfiles.data ?? []).map((p) => p.id);
  if (profileIds.length) {
    await supabaseAdmin.from("posts").delete().in("author_id", profileIds);
    await supabaseAdmin.from("external_rounds").delete().in("user_id", profileIds);
    await supabaseAdmin.from("profiles").delete().in("id", profileIds);
  }

  // Delete sandbox auth user (cascades their profile, remaining posts, etc.)
  const { data: settings } = await supabaseAdmin
    .from("admin_settings")
    .select("sandbox_user_id")
    .eq("id", true)
    .maybeSingle();
  const sandboxUserId = settings?.sandbox_user_id as string | null;
  if (sandboxUserId) {
    await supabaseAdmin.auth.admin.deleteUser(sandboxUserId).catch(() => null);
  }

  await supabaseAdmin.from("mock_seed_registry").delete().eq("batch", SANDBOX_BATCH);

  await supabaseAdmin
    .from("admin_settings")
    .update({
      mock_data_enabled: false,
      sandbox_user_id: null,
      sandbox_email: null,
      sandbox_password_hint: null,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", true);

  // adminUserId reserved for future audit logging
  void adminUserId;
}

export const disableMockData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    await tearDown(context.userId);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Simulate activity — keeps data "moving"                             */
/* ------------------------------------------------------------------ */

export const simulateMockActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("admin_settings")
      .select("sandbox_user_id, mock_data_enabled")
      .eq("id", true)
      .maybeSingle();
    if (!settings?.mock_data_enabled || !settings.sandbox_user_id) {
      throw new Error("Enable mock data first.");
    }
    const sandboxUserId = settings.sandbox_user_id as string;

    // Pick any mock course still on file
    const { data: courseRows } = await supabaseAdmin
      .from("mock_seed_registry")
      .select("row_id")
      .eq("batch", SANDBOX_BATCH)
      .eq("table_name", "courses");
    if (!courseRows?.length) throw new Error("No mock courses on file.");

    const pick = courseRows[Math.floor(Math.random() * courseRows.length)] as { row_id: string };
    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("id, name")
      .eq("id", pick.row_id)
      .maybeSingle();
    const { data: layout } = await supabaseAdmin
      .from("course_layouts")
      .select("id")
      .eq("course_id", pick.row_id)
      .eq("is_default", true)
      .maybeSingle();
    if (!course || !layout) throw new Error("Mock course not found.");

    const toPar = Math.round((Math.random() - 0.5) * 10);
    const rr = 950 - toPar * 10;

    const { data: round, error: re } = await supabaseAdmin
      .from("rounds")
      .insert({
        course_id: course.id,
        layout_id: layout.id,
        created_by: sandboxUserId,
        status: "completed",
        started_at: daysAgo(0.2),
        ended_at: new Date().toISOString(),
        notes: "Sandbox live activity",
      })
      .select("id")
      .single();
    if (re || !round) throw new Error(`round insert failed: ${re?.message}`);

    const { data: ext } = await supabaseAdmin
      .from("external_rounds")
      .insert({
        user_id: sandboxUserId,
        source: "sandbox",
        course_name: (course as { name: string }).name,
        layout_name: "Main 18",
        played_on: dateDaysAgo(0),
        score: 54 + toPar,
        to_par: toPar,
        round_rating: rr,
        ssa: 54,
        format: "singles",
        trust_level: "manual",
        included: true,
      })
      .select("id")
      .single();

    const { data: post } = await supabaseAdmin
      .from("posts")
      .insert({
        author_id: sandboxUserId,
        type: "text",
        body: `Sandbox round finished at ${toPar >= 0 ? "+" : ""}${toPar}.`,
      })
      .select("id")
      .single();

    const rows: Array<{ table_name: string; row_id: string; batch: string; seeded_by: string }> =
      [];
    const push = (t: string, id: string) =>
      rows.push({ table_name: t, row_id: id, batch: SANDBOX_BATCH, seeded_by: context.userId });
    push("rounds", round.id);
    if (ext) push("external_rounds", (ext as { id: string }).id);
    if (post) push("posts", (post as { id: string }).id);
    await supabaseAdmin
      .from("mock_seed_registry")
      .upsert(rows, { onConflict: "table_name,row_id" });

    await supabaseAdmin
      .from("admin_settings")
      .update({
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", true);

    return { ok: true, toPar, courseName: (course as { name: string }).name };
  });

/* ------------------------------------------------------------------ */
/* Rotate sandbox password                                             */
/* ------------------------------------------------------------------ */

export const rotateSandboxPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("admin_settings")
      .select("sandbox_user_id")
      .eq("id", true)
      .maybeSingle();
    const sandboxUserId = settings?.sandbox_user_id as string | null;
    if (!sandboxUserId) throw new Error("No sandbox user on file.");

    const password = randomPassword();
    const upd = await supabaseAdmin.auth.admin.updateUserById(sandboxUserId, { password });
    if (upd.error) throw new Error(upd.error.message);

    await supabaseAdmin
      .from("admin_settings")
      .update({
        sandbox_password_hint: `${password.slice(0, 3)}…${password.slice(-2)}`,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", true);

    return { ok: true, password };
  });
