/**
 * Shared course-source refresh.
 *
 * One place that searches PDGA, Disc Golf Scene and UDisc for a single course,
 * stores what it finds, and (when a person triggered it) submits a PDGA rating
 * profile for review. Used both by the button on the course page and by the
 * background crawler, so a course looks the same whether a player refreshed it
 * or the scheduler did.
 */
import type { CourseAutoPopulateResult } from "./course-auto-populate.functions";

export type RefreshCourseSourcesOptions = {
  sources?: Array<"pdga" | "dgs" | "udisc">;
  /** User id to attribute an auto-submitted rating profile to; null skips it. */
  submittedBy?: string | null;
};

export async function refreshCourseSourcesForCourse(
  courseId: string,
  opts: RefreshCourseSourcesOptions = {},
): Promise<CourseAutoPopulateResult> {
  const {
    resolvePdgaForCourse,
    resolveUdiscForCourse,
    resolveDgsFromExistingLinks,
    upsertSource,
    replaceLayouts,
    backfillCourseFromUdisc,
  } = await import("@/lib/course-auto-populate.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { buildCourseModel } = await import("@/lib/course-target");
  const admin = supabaseAdmin;
  const submittedBy = opts.submittedBy ?? null;

  const { data: course, error: courseErr } = await admin
    .from("courses")
    .select("id, name, city, state")
    .eq("id", courseId)
    .maybeSingle();
  if (courseErr || !course) throw new Error("Course not found");

  const result: CourseAutoPopulateResult = {
    course_id: course.id,
    course_name: course.name,
    sources: {
      pdga: { status: "not_found" },
      dgs: { status: "not_found" },
      udisc: { status: "not_found" },
    },
    rating_profile: { action: "skipped" },
  };

  const want = new Set(opts.sources ?? ["pdga", "dgs", "udisc"]);

  const [pdga, udisc, dgs] = await Promise.all([
    want.has("pdga")
      ? resolvePdgaForCourse(course.name, course.state ?? null)
      : Promise.resolve(null),
    want.has("udisc")
      ? resolveUdiscForCourse(course.name, course.state ?? null, course.city ?? null)
      : Promise.resolve(null),
    want.has("dgs") ? resolveDgsFromExistingLinks(course.id) : Promise.resolve(null),
  ]);

  if (pdga) {
    result.sources.pdga = {
      status: pdga.status,
      matched_name: pdga.matched?.name ?? null,
      matched_url: pdga.matched?.url ?? null,
      confidence: pdga.confidence,
      rounds: pdga.rows.length,
      events: pdga.events.length,
      error: pdga.error ?? null,
    };
    await upsertSource(admin, course.id, "pdga", {
      external_id: pdga.matched?.slug ?? null,
      canonical_url: pdga.matched?.url ?? null,
      matched_name: pdga.matched?.name ?? null,
      raw: { rows: pdga.rows, summaries: pdga.summaries, events: pdga.events },
      confidence: pdga.confidence,
      last_error: pdga.error ?? null,
    });
  }

  if (udisc) {
    result.sources.udisc = {
      status: udisc.status,
      matched_name: udisc.course?.name ?? null,
      matched_url: udisc.course?.url ?? null,
      confidence: udisc.confidence,
      layouts: udisc.course?.layouts.length ?? 0,
      error: udisc.error ?? null,
    };
    if (udisc.course && udisc.status === "ok") {
      await upsertSource(admin, course.id, "udisc", {
        external_id: udisc.course.short_id ?? udisc.course.slug,
        canonical_url: udisc.course.url,
        matched_name: udisc.course.name,
        raw: udisc.course as unknown,
        confidence: udisc.confidence,
      });
      await replaceLayouts(
        admin,
        course.id,
        "udisc",
        udisc.course.layouts.map((l) => ({
          layout_name: l.name,
          holes: l.holes,
          par: l.par,
          length_ft: l.length_ft,
          difficulty: l.difficulty,
          // Hole distances/pars only ship for the layout UDisc marks popular.
          data:
            udisc.course!.holes_detail.length && l.holes === udisc.course!.holes_detail.length
              ? { holes_detail: udisc.course!.holes_detail }
              : {},
        })),
      );
      result.sources.udisc.reviews =
        udisc.course.reviews_all?.length ?? udisc.course.reviews.length;
      result.sources.udisc.backfilled = await backfillCourseFromUdisc(
        admin,
        course.id,
        udisc.course,
      );
    }
  }

  if (dgs) {
    result.sources.dgs = {
      status: dgs.status,
      matched_url: dgs.url ?? null,
      confidence: dgs.confidence,
    };
    if (dgs.status === "ok") {
      await upsertSource(admin, course.id, "dgs", {
        canonical_url: dgs.url ?? null,
        raw: dgs.data as unknown,
        confidence: dgs.confidence,
      });
      const parsed = (dgs.data ?? null) as null | {
        holes?: number | null;
        par?: number | null;
        length_ft?: number | null;
        layouts?: string[];
      };
      if (parsed) {
        await replaceLayouts(admin, course.id, "dgs", [
          {
            layout_name: parsed.layouts?.[0] ?? "DGS layout",
            holes: parsed.holes ?? null,
            par: parsed.par ?? null,
            length_ft: parsed.length_ft ?? null,
            difficulty: null,
          },
        ]);
      }
    }
  }

  if (pdga && pdga.rows.length >= 3 && pdga.events.length >= 2) {
    const { data: existingApproved } = await admin
      .from("course_rating_profiles")
      .select("id")
      .eq("course_id", course.id)
      .eq("status", "approved")
      .maybeSingle();
    if (existingApproved) {
      result.rating_profile = {
        action: "existing_approved",
        profile_id: existingApproved.id,
        reason: "An approved rating profile already exists for this course.",
      };
    } else if (!submittedBy) {
      // Background refresh: keep the source data, leave the review submission
      // to a signed-in player so the profile has an owner.
      result.rating_profile = {
        action: "skipped",
        reason: "Background refresh stores source data only.",
      };
    } else {
      const { data: existingPending } = await admin
        .from("course_rating_profiles")
        .select("id")
        .eq("course_id", course.id)
        .eq("submitted_by", submittedBy)
        .eq("status", "pending")
        .maybeSingle();
      if (existingPending) {
        result.rating_profile = {
          action: "existing_pending",
          profile_id: existingPending.id,
          reason: "You already have a pending submission for this course.",
        };
      } else {
        const rounds = pdga.rows.map((r) => ({
          played_on: r.event_date ?? new Date().toISOString().slice(0, 10),
          score: r.score,
          round_rating: r.round_rating,
          to_par: null,
          ssa: null,
        }));
        const model = buildCourseModel(rounds);
        if (model && model.ssa != null && model.stroke_value != null) {
          const { data: inserted, error: insErr } = await admin
            .from("course_rating_profiles")
            .insert({
              course_id: course.id,
              course_name: course.name,
              pdga_course_ref: pdga.matched?.slug ?? null,
              pdga_course_name: pdga.matched?.name ?? null,
              pdga_course_url: pdga.matched?.url ?? null,
              ssa: model.ssa,
              stroke_value: model.stroke_value,
              par_total: null,
              sample_size: pdga.rows.length,
              event_refs: pdga.events,
              round_summaries: pdga.summaries as never,
              rated_rounds: rounds as never,
              matched_course: (pdga.matched ?? null) as never,
              notes: "Auto-populated from PDGA course search.",
              submitted_by: submittedBy,
              status: "pending",
              auto_populated: true,
              source_mix: { pdga: pdga.confidence, udisc: udisc?.confidence ?? 0 } as never,
              confidence: pdga.confidence,
            })
            .select("id")
            .maybeSingle();
          if (insErr) {
            result.rating_profile = { action: "skipped", reason: insErr.message };
          } else {
            result.rating_profile = {
              action: "created_pending",
              profile_id: inserted?.id,
              sample_size: pdga.rows.length,
              ssa: model.ssa,
              stroke_value: model.stroke_value,
            };
          }
        } else {
          result.rating_profile = {
            action: "insufficient_data",
            reason: "Could not fit a course model from the retrieved rounds.",
          };
        }
      }
    }
  } else {
    result.rating_profile = {
      action: "insufficient_data",
      reason: pdga
        ? `Need ≥3 rounds across ≥2 events; found ${pdga.rows.length} rounds / ${pdga.events.length} events.`
        : "PDGA lookup skipped.",
    };
  }

  return result;
}
