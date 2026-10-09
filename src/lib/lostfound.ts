/**
 * Lost & Found — reports for discs that went missing and discs that were picked
 * up, plus the claim handshake that closes a report as reunited.
 *
 * Matching between found discs, listings, and open lost reports runs inside the
 * database on insert, so it cannot be skipped from the client.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeStateCode, stateFilterVariants } from "@/lib/us-states";
import { fetchProfileMap, milesBetween } from "@/lib/marketplace";

async function withReporters(rows: LostFoundReport[]): Promise<LostFoundReport[]> {
  const map = await fetchProfileMap(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, reporter: map[r.user_id] ?? null }));
}

export type LostFoundKind = "lost" | "found";
export type LostFoundStatus = "open" | "matched" | "reunited" | "closed";
export type ClaimState = "pending" | "confirmed" | "rejected";

export type LostFoundReport = {
  id: string;
  user_id: string;
  kind: LostFoundKind;
  mold_name: string;
  brand: string | null;
  color: string | null;
  weight_grams: number | null;
  ink_name: string | null;
  /** Never returned in list/detail reads. Fetch with fetchReportContactPhone() when authorized. */
  ink_phone?: never;
  ink_pdga_number: number | null;
  course_id: string | null;
  hole_number: number | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  occurred_on: string;
  reward: string | null;
  handoff_notes: string | null;
  photo_url: string | null;
  status: LostFoundStatus;
  reunited_at: string | null;
  created_at: string;
  reporter: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  course: { id: string; name: string; city: string | null; state: string | null } | null;
};

const REPORT_SELECT = `
  id, user_id, kind, mold_name, brand, color, weight_grams, ink_name,
  ink_pdga_number, course_id, hole_number, latitude, longitude, city, state,
  occurred_on, reward, handoff_notes, photo_url, status, reunited_at, created_at,
  course:courses(id, name, city, state)
`;

export type ReportFilters = {
  kind?: LostFoundKind | "all";
  courseId?: string | null;
  state?: string | null;
  search?: string;
  sinceDays?: number | null;
  radiusMiles?: number | null;
  origin?: { lat: number; lng: number } | null;
  includeClosed?: boolean;
  page?: number;
  pageSize?: number;
};

export async function fetchReports(
  filters: ReportFilters,
): Promise<{ rows: LostFoundReport[]; total: number }> {
  const pageSize = filters.pageSize ?? 24;
  const page = filters.page ?? 0;

  let query = supabase
    .from("lost_disc_reports")
    .select(REPORT_SELECT, { count: "exact" })
    .order("occurred_on", { ascending: false });

  if (filters.kind && filters.kind !== "all") query = query.eq("kind", filters.kind);
  if (!filters.includeClosed) query = query.in("status", ["open", "matched"]);
  if (filters.courseId) query = query.eq("course_id", filters.courseId);
  if (filters.state?.trim()) {
    const variants = stateFilterVariants(filters.state.trim());
    query = query.in("state", variants.length ? variants : [filters.state.trim()]);
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(`mold_name.ilike.${term},brand.ilike.${term},ink_name.ilike.${term}`);
  }
  if (filters.sinceDays) {
    const since = new Date(Date.now() - filters.sinceDays * 86_400_000);
    query = query.gte("occurred_on", since.toISOString().slice(0, 10));
  }

  const wideFetch = Boolean(filters.radiusMiles && filters.origin);
  const from = wideFetch ? 0 : page * pageSize;
  const to = wideFetch ? 199 : from + pageSize - 1;

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  let rows = (data ?? []) as unknown as LostFoundReport[];
  if (wideFetch && filters.origin && filters.radiusMiles) {
    const origin = filters.origin;
    rows = rows.filter(
      (r) =>
        r.latitude != null &&
        r.longitude != null &&
        milesBetween(origin, { lat: r.latitude, lng: r.longitude }) <= filters.radiusMiles!,
    );
  }
  const total = wideFetch ? rows.length : (count ?? rows.length);
  if (wideFetch) rows = rows.slice(page * pageSize, page * pageSize + pageSize);
  return { rows: await withReporters(rows), total };
}

export function reportsQueryOptions(filters: ReportFilters) {
  return queryOptions({
    queryKey: ["lost-found-reports", filters] as const,
    queryFn: () => fetchReports(filters),
    staleTime: 30_000,
  });
}

export async function fetchReport(id: string): Promise<LostFoundReport | null> {
  const { data, error } = await supabase
    .from("lost_disc_reports")
    .select(REPORT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [row] = await withReporters([data as unknown as LostFoundReport]);
  return row ?? null;
}

export function reportQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["lost-found-report", id] as const,
    queryFn: () => fetchReport(id),
    staleTime: 15_000,
  });
}

/**
 * The phone number inked on a disc, released only to the report owner, an admin,
 * or a claimant whose claim has been confirmed. Returns null otherwise.
 */
export async function fetchReportContactPhone(reportId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_lost_disc_contact", { _report_id: reportId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export type NewReportInput = {
  kind: LostFoundKind;
  moldName: string;
  brand?: string | null;
  color?: string | null;
  weightGrams?: number | null;
  inkName?: string | null;
  inkPhone?: string | null;
  inkPdgaNumber?: number | null;
  courseId?: string | null;
  holeNumber?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
  occurredOn: string;
  reward?: string | null;
  handoffNotes?: string | null;
  photoUrl?: string | null;
};

export async function createReport(userId: string, input: NewReportInput): Promise<string> {
  const { data, error } = await supabase
    .from("lost_disc_reports")
    .insert({
      user_id: userId,
      kind: input.kind,
      mold_name: input.moldName,
      brand: input.brand ?? null,
      color: input.color ?? null,
      weight_grams: input.weightGrams ?? null,
      ink_name: input.inkName ?? null,
      ink_phone: input.inkPhone ?? null,
      ink_pdga_number: input.inkPdgaNumber ?? null,
      course_id: input.courseId ?? null,
      hole_number: input.holeNumber ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      city: input.city ?? null,
      state: normalizeStateCode(input.state) ?? input.state ?? null,
      occurred_on: input.occurredOn,
      reward: input.reward ?? null,
      handoff_notes: input.handoffNotes ?? null,
      photo_url: input.photoUrl ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function setReportStatus(id: string, status: LostFoundStatus) {
  const { error } = await supabase.from("lost_disc_reports").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function myReports(userId: string): Promise<LostFoundReport[]> {
  const { data, error } = await supabase
    .from("lost_disc_reports")
    .select(REPORT_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return withReporters((data ?? []) as unknown as LostFoundReport[]);
}

export function myReportsQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["lost-found-my-reports", userId] as const,
    queryFn: () => myReports(userId as string),
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
}

// ── Claims ──────────────────────────────────────────────────────────────────

export type LostFoundClaim = {
  id: string;
  report_id: string;
  claimant_id: string;
  message: string | null;
  conversation_id: string | null;
  state: ClaimState;
  created_at: string;
  claimant: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

const CLAIM_SELECT = `
  id, report_id, claimant_id, message, conversation_id, state, created_at
`;

export async function fetchClaims(reportId: string): Promise<LostFoundClaim[]> {
  const { data, error } = await supabase
    .from("lost_disc_claims")
    .select(CLAIM_SELECT)
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as LostFoundClaim[];
  const map = await fetchProfileMap(rows.map((r) => r.claimant_id));
  return rows.map((r) => ({ ...r, claimant: map[r.claimant_id] ?? null }));
}

export function claimsQueryOptions(reportId: string) {
  return queryOptions({
    queryKey: ["lost-found-claims", reportId] as const,
    queryFn: () => fetchClaims(reportId),
    staleTime: 15_000,
  });
}

export async function claimReport(
  reportId: string,
  claimantId: string,
  message: string | null,
  conversationId?: string | null,
) {
  const { error } = await supabase.from("lost_disc_claims").insert({
    report_id: reportId,
    claimant_id: claimantId,
    message,
    conversation_id: conversationId ?? null,
  });
  if (error) throw error;
}

/** Finder confirms a claim: the claim is accepted and the report is reunited. */
export async function confirmClaim(claimId: string, reportId: string) {
  const { error } = await supabase
    .from("lost_disc_claims")
    .update({ state: "confirmed" })
    .eq("id", claimId);
  if (error) throw error;
  await setReportStatus(reportId, "reunited");
}

export async function rejectClaim(claimId: string) {
  const { error } = await supabase
    .from("lost_disc_claims")
    .update({ state: "rejected" })
    .eq("id", claimId);
  if (error) throw error;
}

/** Uploads a report photo and returns a long-lived signed URL. */
export async function uploadReportPhoto(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}/lost-found/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("marketplace").upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = await supabase.storage
    .from("marketplace")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (!data?.signedUrl) throw new Error("Photo uploaded, but we couldn't build a link for it.");
  return data.signedUrl;
}

export function reportHeadline(report: LostFoundReport): string {
  const bits = [report.color, report.brand, report.mold_name].filter(Boolean);
  return bits.join(" ");
}

export function reportPlace(report: LostFoundReport): string | null {
  if (report.course?.name) {
    return report.hole_number
      ? `${report.course.name} · hole ${report.hole_number}`
      : report.course.name;
  }
  const parts = [report.city, report.state].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
