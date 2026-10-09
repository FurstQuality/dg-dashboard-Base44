import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const AUTH_REDIRECT_KEY = "chainlink:auth-redirect-after-login";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function tokenParams(): URLSearchParams {
  if (!isBrowser()) return new URLSearchParams();
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const search = window.location.search.startsWith("?")
    ? window.location.search.slice(1)
    : window.location.search;
  const params = new URLSearchParams(hash);
  new URLSearchParams(search).forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return params;
}

function cleanAuthTokensFromUrl() {
  if (!isBrowser()) return;
  const params = tokenParams();
  if (
    !params.has("access_token") &&
    !params.has("refresh_token") &&
    !params.has("code") &&
    !params.has("token_hash") &&
    !params.has("error")
  )
    return;
  window.history.replaceState(window.history.state, document.title, window.location.pathname);
}

/** True only for a same-origin relative path (no protocol-relative or backslash tricks). */
export function isSafeRelativePath(path: string | null | undefined): path is string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false;
  if (/[\\\u0000-\u001f]/.test(path)) return false;
  try {
    const base = "https://app.invalid";
    return new URL(path, base).origin === base;
  } catch {
    return false;
  }
}

export function rememberPostLoginPath(path = "/play") {
  if (!isBrowser()) return;
  const safePath = isSafeRelativePath(path) ? path : "/play";
  window.sessionStorage.setItem(AUTH_REDIRECT_KEY, safePath);
}

export function consumePostLoginPath(): string {
  if (!isBrowser()) return "/play";
  const stored = window.sessionStorage.getItem(AUTH_REDIRECT_KEY);
  window.sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  if (!isSafeRelativePath(stored) || stored.startsWith("/auth"))
    return "/play";
  return stored;
}

export async function persistSessionFromUrl(): Promise<Session | null> {
  const params = tokenParams();

  if (params.has("error")) {
    cleanAuthTokensFromUrl();
    throw new Error("Sign in was cancelled or rejected. Please try again.");
  }

  // Newer Supabase recovery/magic-link format: ?token_hash=...&type=recovery
  const tokenHash = params.get("token_hash");
  const otpType = params.get("type");
  if (tokenHash && otpType) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as "recovery" | "magiclink" | "signup" | "invite" | "email_change" | "email",
    });
    if (error) throw error;
    cleanAuthTokensFromUrl();
    return data.session;
  }

  const code = params.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    cleanAuthTokensFromUrl();
    return data.session;
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  cleanAuthTokensFromUrl();
  return data.session;
}

export async function waitForAuthSession(timeoutMs = 8000): Promise<Session | null> {
  const urlSession = await persistSessionFromUrl();
  if (urlSession) return urlSession;

  const existing = await supabase.auth.getSession();
  if (existing.data.session) return existing.data.session;

  return await new Promise<Session | null>((resolve) => {
    let resolved = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let authSubscription: { subscription: { unsubscribe: () => void } } | undefined;
    const finish = (session: Session | null) => {
      if (resolved) return;
      resolved = true;
      if (timeout) clearTimeout(timeout);
      authSubscription?.subscription.unsubscribe();
      resolve(session);
    };

    authSubscription = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session);
    }).data;

    timeout = setTimeout(() => finish(null), timeoutMs);
  });
}
