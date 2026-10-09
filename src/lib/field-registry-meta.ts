/** Shared field-registry metadata used by both the admin UI and server functions. */
export const FIELD_DATA_TYPES = [
  "text",
  "number",
  "integer",
  "boolean",
  "datetime",
  "date",
  "uuid",
  "enum",
  "json",
  "array",
] as const;

export type FieldDataType = (typeof FIELD_DATA_TYPES)[number];
