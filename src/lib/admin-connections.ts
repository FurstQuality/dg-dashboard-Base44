import { z } from "zod";

export const CONNECTION_SUGGESTIONS = {
  github: "FurstQuality/Disc-Golf-Dashboard",
  supabase: "aosklgewcakrhuxdynik",
} as const;
export type ConnectionProvider = keyof typeof CONNECTION_SUGGESTIONS;

/** Identify credential mix-ups without reflecting any part of a user's secret. */
export function connectionCredentialIssue(
  provider: ConnectionProvider,
  input: string,
): string | null {
  const token = input.trim();
  if (!token) return null;
  if (/^Bearer\s/i.test(token)) return "Paste only the token value, without the Bearer prefix.";
  const github = /^(github_pat_|gh[pous]_)[A-Za-z0-9_]+$/.test(token);
  const management = /^sbp_[A-Za-z0-9_-]+$/.test(token);
  if ((provider === "github" && github) || (provider === "supabase" && management)) return null;
  const kind = token.startsWith("sb_publishable_")
    ? "a Supabase publishable API key"
    : token.startsWith("sb_secret_")
      ? "a Supabase secret API key"
      : /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
        ? "a JWT/project API key"
        : management
          ? "a Supabase personal access token"
          : github
            ? "a GitHub access token"
            : null;
  const reason = kind ? `This is ${kind}. ` : "This credential format is not supported here. ";
  return (
    reason +
    (provider === "github"
      ? "Create a GitHub personal access token (github_pat_ or ghp_) in GitHub Settings → Developer settings → Personal access tokens."
      : "Create a Supabase account personal access token (sbp_) in Account → Access tokens. Project API keys cannot manage a Supabase project.")
  );
}

export function normalizeRepository(input: string): string {
  let value = input.trim();
  if (value.startsWith("https://")) {
    const url = new URL(value);
    if (
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("Use a github.com repository URL or owner/repository.");
    value = url.pathname.replace(/^\//, "");
  }
  value = value.replace(/\/$/, "").replace(/\.git$/, "");
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/.test(value) ||
    /\/(\.|\.\.)$/.test(value)
  )
    throw new Error("Use a github.com repository URL or owner/repository.");
  return value;
}

export function normalizeProject(input: string): string {
  let value = input.trim();
  if (value.startsWith("https://")) {
    const url = new URL(value);
    if (url.port || url.username || url.password || url.search || url.hash)
      throw new Error("Use a Supabase project ID, project URL, or dashboard URL.");
    if (url.hostname === "supabase.com")
      value = /^\/dashboard\/project\/([a-z0-9]{20})(?:\/|$)/.exec(url.pathname)?.[1] ?? "";
    else value = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname)?.[1] ?? "";
  }
  if (!/^[a-z0-9]{20}$/.test(value))
    throw new Error("Use a Supabase project ID, project URL, or dashboard URL.");
  return value;
}

export const connectionInputSchema = z.object({
  provider: z.enum(["github", "supabase"]),
  target: z.string().trim().min(1).max(500),
  branch: z
    .string()
    .trim()
    .max(200)
    .default("")
    .refine(
      (value) => !value || (/^[\w./-]+$/.test(value) && !/(\.\.|\/\/|^\/|\/$|\.lock$)/.test(value)),
      "Enter a valid branch name, or leave it blank for the repository default.",
    ),
  token: z
    .string()
    .trim()
    .max(4096)
    .default("")
    .refine((value) => !value || /^[\x21-\x7E]+$/.test(value), "Tokens cannot contain whitespace."),
  removeToken: z.boolean().default(false),
  revision: z.number().int().nonnegative(),
});
export type ConnectionInput = z.infer<typeof connectionInputSchema>;

/** Validation errors must never serialize a submitted credential. */
export function parseConnectionInput(input: unknown): ConnectionInput {
  const parsed = connectionInputSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("Check the connection fields. A target and valid branch/token are required.");
  const credentialIssue = parsed.data.removeToken
    ? null
    : connectionCredentialIssue(parsed.data.provider, parsed.data.token);
  if (credentialIssue) throw new Error(credentialIssue);
  return {
    ...parsed.data,
    target:
      parsed.data.provider === "github"
        ? normalizeRepository(parsed.data.target)
        : normalizeProject(parsed.data.target),
  };
}

export type ConnectionCheck = {
  ok: boolean;
  checkedAt: string;
  message: string;
  details: Record<string, string>;
};
export type ConnectionView = {
  provider: ConnectionProvider;
  target: string;
  branch: string;
  revision: number;
  saved: boolean;
  tokenPresent: boolean;
  tokenSource: "saved" | "environment" | null;
  credentialIssue: string | null;
  updatedAt: string | null;
  lastCheck: ConnectionCheck | null;
};
export type ConnectionSettings = {
  storage: { available: boolean; mode: "local" | "hosted"; message: string };
  activeProject: string | null;
  connections: Record<ConnectionProvider, ConnectionView>;
};
