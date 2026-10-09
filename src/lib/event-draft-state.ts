import { z } from "zod";

/** Kind of builder a saved draft belongs to. */
export type EventDraftKind = "league" | "tournament";

/**
 * Versioned snapshot of a builder's answers. The shape of `fields` is owned by
 * each wizard; bump SNAPSHOT_VERSION whenever a wizard's field names change in a
 * way that would half-fill an older draft.
 */
export const SNAPSHOT_VERSION = 1;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DraftFields = Record<string, any>;

export type EventDraftSnapshot = {
  v: number;
  fields: DraftFields;
};

const snapshotSchema = z.object({
  v: z.number(),
  fields: z.record(z.string(), z.unknown()),
});

/** A saved draft as returned to the builders. */
export type EventDraftRow = {
  id: string;
  kind: EventDraftKind;
  title: string | null;
  step: number;
  series_id: string | null;
  state: EventDraftSnapshot | null;
  created_at: string;
  updated_at: string;
};

export function makeSnapshot(fields: DraftFields): EventDraftSnapshot {
  return { v: SNAPSHOT_VERSION, fields };
}

/**
 * Read a draft's fields. Returns null for anything that isn't a snapshot of the
 * current version, so a stale draft never partially fills a builder.
 */
export function readSnapshot(state: unknown): DraftFields | null {
  const parsed = snapshotSchema.safeParse(state);
  if (!parsed.success) return null;
  if (parsed.data.v !== SNAPSHOT_VERSION) return null;
  return parsed.data.fields;
}

/** Typed field reader used by the wizards when restoring a draft. */
export function field<T>(fields: DraftFields, key: string, fallback: T): T {
  const value = fields[key];
  return value === undefined || value === null ? fallback : (value as T);
}

/** Human label for a draft in resume cards and director lists. */
export function draftTitle(draft: { title: string | null; kind: EventDraftKind }): string {
  const trimmed = draft.title?.trim();
  if (trimmed) return trimmed;
  return draft.kind === "league" ? "Untitled league" : "Untitled tournament";
}

/** "2 minutes ago" style stamp for the last save. */
export function savedAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "recently";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
