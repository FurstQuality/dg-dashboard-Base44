import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type BetaProgram = Database["public"]["Tables"]["beta_program"]["Row"];
export type BetaFeedback = Database["public"]["Tables"]["beta_feedback"]["Row"];
export type BetaFeedbackKind = Database["public"]["Enums"]["beta_feedback_kind"];
export type BetaFeedbackStatus = Database["public"]["Enums"]["beta_feedback_status"];
export type BetaFeedbackSeverity = Database["public"]["Enums"]["beta_feedback_severity"];

export const BETA_STATUSES: { value: BetaFeedbackStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "triaged", label: "Triaged" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "wont_fix", label: "Won't fix" },
  { value: "duplicate", label: "Duplicate" },
];

export const BETA_SEVERITIES: { value: BetaFeedbackSeverity; label: string; hint: string }[] = [
  { value: "blocker", label: "Blocker", hint: "I can't finish what I was doing" },
  { value: "major", label: "Major", hint: "Works, but the result is wrong" },
  { value: "minor", label: "Minor", hint: "Annoying but I can work around it" },
  { value: "cosmetic", label: "Cosmetic", hint: "Layout, spacing, or wording" },
];

export const BETA_PRIORITIES: { value: number; label: string }[] = [
  { value: 1, label: "P1 · Ship fix now" },
  { value: 2, label: "P2 · This week" },
  { value: 3, label: "P3 · Backlog" },
  { value: 4, label: "P4 · Someday" },
];

export const FEATURE_AREAS = [
  "Scoring & rounds",
  "Courses & course builder",
  "Tournaments & leagues",
  "Friend tracker",
  "Community & messages",
  "DG Statboard & ratings",
  "Profile & settings",
  "Navigation & layout",
  "Sign in & account",
  "Something else",
] as const;

/** Client-side guard rails; the same limits are enforced by column types. */
export const betaFeedbackSchema = z.object({
  kind: z.enum(["bug", "idea", "rating"]),
  title: z.string().trim().min(4, "Give it a short title (4+ characters)").max(140),
  body: z.string().trim().max(4000).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  severity: z.enum(["blocker", "major", "minor", "cosmetic"]).nullable().optional(),
  feature_area: z.string().trim().max(80).nullable().optional(),
});

export function statusLabel(s: BetaFeedbackStatus) {
  return BETA_STATUSES.find((x) => x.value === s)?.label ?? s;
}

export function kindLabel(k: BetaFeedbackKind) {
  return k === "bug" ? "Bug" : k === "idea" ? "Idea" : "Page rating";
}

export function useBetaProgram() {
  return useQuery({
    queryKey: ["beta", "program"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("beta_program").select("*").maybeSingle();
      if (error) throw error;
      return (data as BetaProgram | null) ?? null;
    },
  });
}

/** Human label for the current screen, used to tag feedback. */
export function pageLabelFor(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return "Home";
  return parts
    .map((p) => (p.startsWith("$") || p.length > 24 ? "detail" : p.replace(/-/g, " ")))
    .join(" › ");
}
