import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import { CodeEntryCard } from "@/components/scoring/code-entry-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { rememberPostLoginPath, isSafeRelativePath } from "@/lib/auth-flow";
import { InstallAppCard } from "@/components/install-app-card";

type Screen = "signin" | "signup" | "forgot";
type Busy = "google" | "apple" | "microsoft" | "email" | "signup" | "forgot" | null;

export const Route = createFileRoute("/auth")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { ref?: string; pdga?: string; name?: string; mode?: "signup" | "forgot"; next?: string } => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
    pdga: typeof search.pdga === "string" ? search.pdga : undefined,
    name: typeof search.name === "string" ? search.name : undefined,
    mode: search.mode === "signup" || search.mode === "forgot" ? search.mode : undefined,
    // Same-origin relative path only: used by flows that must return the
    // player to where they started (e.g. an app-connection consent screen).
    next:
      typeof search.next === "string" &&
      isSafeRelativePath(search.next) &&
      !search.next.startsWith("/auth")
        ? search.next
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in · DG Dashboard" },
      {
        name: "description",
        content: "Sign in or create your DG Dashboard | Ace disc golf account.",
      },
      { property: "og:title", content: "Sign in · DG Dashboard" },
      {
        property: "og:description",
        content: "Sign in to your DG Dashboard | Ace disc golf account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

/** Human wording for the handful of auth failures users actually hit. */
function humanAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/invalid.*(login|credentials|grant)/i.test(msg))
    return "That email and password don't match. Try again or reset your password.";
  if (/email.*not.*confirmed/i.test(msg))
    return "Confirm your email first — we sent a link when you signed up.";
  if (/already registered|user already/i.test(msg))
    return "An account already uses that email. Sign in instead, or reset your password.";
  if (/password.*(6|8|characters|short)/i.test(msg))
    return "Pick a password with at least 8 characters.";
  if (/rate|too many/i.test(msg)) return "Too many attempts. Wait a minute and try again.";
  if (/provider|unsupported|not enabled/i.test(msg))
    return "This sign-in service isn't available right now. Use email instead.";
  if (/popup|blocked/i.test(msg))
    return "Your browser blocked the Google window. Allow popups and try again.";
  if (/cancel/i.test(msg)) return "Google sign-in was cancelled.";
  if (!msg) return "Something went wrong. Try again.";
  return msg;
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const sharedInvite =
    search.ref === "share" && search.pdga ? { pdga: search.pdga, name: search.name ?? null } : null;
  const destination =
    search.next ?? (sharedInvite ? `/preview/${encodeURIComponent(sharedInvite.pdga)}` : "/play");

  const [screen, setScreen] = useState<Screen>(
    search.mode === "forgot" ? "forgot" : sharedInvite || search.mode === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const redirected = useRef(false);
  // Brand-new accounts land on the hands-on welcome page instead of an empty
  // feed, unless the visit already had a specific destination in mind.
  const justSignedUp = useRef(false);
  const go = useCallback(() => {
    if (redirected.current) return;
    redirected.current = true;
    const target = justSignedUp.current && !search.next ? "/welcome" : destination;
    // Destinations can carry a query string (e.g. a connection consent link),
    // which the router's typed `to` can't express — hand those to the browser.
    if (target.includes("?")) {
      window.location.replace(target);
      return;
    }
    navigate({ to: target, replace: true } as never);
  }, [navigate, destination, search.next]);

  /**
   * Single session watcher. Anything that produces a session — password
   * sign-in or an already-signed-in visit — lands here,
   * so no screen needs its own polling or timeout logic.
   */
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [go]);

  function reset() {
    setError(null);
    setNotice(null);
  }

  async function handleGoogle() {
    if (busy) return;
    reset();
    setBusy("google");
    try {
      rememberPostLoginPath(destination);
      const result = await supabase.auth.signInWithOAuth({
        provider: "google",
        // Public callback route: it hydrates the session, then forwards to the
        // remembered destination. Never point this at a protected route.
        options: {
          redirectTo: `${window.location.origin}/auth-callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (result.error) throw result.error;
      // Supabase redirects through Google back to the public callback route.
    } catch (err) {
      setError(humanAuthError(err));
      setBusy(null);
    }
  }

  async function handleApple() {
    if (busy) return;
    reset();
    setBusy("apple");
    try {
      rememberPostLoginPath(destination);
      const result = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: `${window.location.origin}/auth-callback` },
      });
      if (result.error) throw result.error;
    } catch {
      setError("Apple sign-in didn't go through. Try again or use email instead.");
      setBusy(null);
    }
  }

  async function handleMicrosoft() {
    if (busy) return;
    reset();
    setBusy("microsoft");
    try {
      rememberPostLoginPath(destination);
      const result = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: { redirectTo: `${window.location.origin}/auth-callback`, scopes: "email" },
      });
      if (result.error) throw result.error;
    } catch {
      setError("Microsoft sign-in didn't go through. Try again or use email instead.");
      setBusy(null);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    reset();
    setBusy("email");
    rememberPostLoginPath(destination);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) {
      setError(humanAuthError(err));
      setBusy(null);
    }
    // Success: the session watcher navigates.
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    reset();
    setBusy("signup");
    justSignedUp.current = true;
    rememberPostLoginPath(search.next ? destination : "/welcome");
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName.trim() || email.split("@")[0] },
        emailRedirectTo: `${window.location.origin}/auth-callback`,
      },
    });
    if (err) {
      setError(humanAuthError(err));
      setBusy(null);
      return;
    }
    if (data.session) {
      toast.success("Welcome to DG Dashboard");
      return; // watcher navigates
    }
    setNotice(
      `Almost there — confirm your email at ${email.trim()} to finish setting up your account.`,
    );
    setBusy(null);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    reset();
    setBusy("forgot");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(null);
    if (err) {
      setError(humanAuthError(err));
      return;
    }
    setNotice(`Reset link sent to ${email.trim()}. Check your inbox and spam folder.`);
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, hsl(var(--primary)) 0, transparent 40%), radial-gradient(circle at 80% 80%, hsl(var(--primary)) 0, transparent 45%)",
        }}
      />

      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-6 flex flex-col items-center gap-2">
          <Mascot name="ace" size={88} className="drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]" />
          <span className="font-display text-3xl font-extrabold tracking-tight text-primary">
            DG Dashboard
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Powered by Ace
          </span>
        </Link>

        {sharedInvite ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/20 text-primary">
              <UserPlus className="h-4 w-4" />
            </span>
            <div className="min-w-0 text-sm">
              <div className="font-semibold">
                You're invited to view {sharedInvite.name ?? `PDGA #${sharedInvite.pdga}`}'s stats
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Create a free account to see full ratings history, projections, and event odds.
              </p>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
          <h1 className="text-lg font-semibold">
            {screen === "signin" && "Sign in"}
            {screen === "signup" && "Create your account"}
            {screen === "forgot" && "Reset your password"}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {screen === "signin" && "Pick up your rounds, crews, and events where you left off."}
            {screen === "signup" && "One account for rounds, courses, crews, and tournaments."}
            {screen === "forgot" && "We'll email you a secure link to set a new password."}
          </p>

          {screen !== "forgot" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogle}
                disabled={busy !== null}
                className="mt-5 h-11 w-full text-sm font-medium"
              >
                {busy === "google" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opening Google…
                  </>
                ) : (
                  <>
                    <GoogleGlyph />
                    Continue with Google
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleApple}
                disabled={busy !== null}
                className="mt-2 h-11 w-full text-sm font-medium"
              >
                {busy === "apple" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opening Apple…
                  </>
                ) : (
                  <>
                    <AppleGlyph />
                    Continue with Apple
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleMicrosoft}
                disabled={busy !== null}
                className="mt-2 h-11 w-full text-sm font-medium"
              >
                {busy === "microsoft" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opening Microsoft…
                  </>
                ) : (
                  <>
                    <MicrosoftGlyph />
                    Continue with Microsoft
                  </>
                )}
              </Button>

              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                or with email
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[13px]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>{error}</span>
            </div>
          ) : null}

          {notice ? (
            <div
              role="status"
              className="mb-4 flex items-start gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-[13px]"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{notice}</span>
            </div>
          ) : null}

          {screen === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <EmailField value={email} onChange={setEmail} />
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                      setScreen("forgot");
                    }}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((s) => !s)}
                />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={busy !== null}>
                {busy === "email" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
              <p className="text-center text-[13px] text-muted-foreground">
                New to DG Dashboard?{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => {
                    reset();
                    setScreen("signup");
                  }}
                >
                  Create an account
                </button>
              </p>
            </form>
          ) : null}

          {/* Its own form — a form cannot be nested inside another one. */}
          {screen === "signin" ? (
            <div className="mt-4 border-t border-border pt-4">
              <CodeEntryCard variant="inline" />
            </div>
          ) : null}

          {screen === "signup" ? (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="display-name">Name</Label>
                <Input
                  id="display-name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How your name shows on cards"
                />
              </div>
              <EmailField value={email} onChange={setEmail} />
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Password</Label>
                <PasswordInput
                  id="new-password"
                  autoComplete="new-password"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((s) => !s)}
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              <Button
                type="submit"
                className="h-11 w-full"
                disabled={busy !== null || password.length < 8}
              >
                {busy === "signup" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account…
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
              <p className="text-center text-[13px] text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => {
                    reset();
                    setScreen("signin");
                  }}
                >
                  Sign in
                </button>
              </p>
            </form>
          ) : null}

          {screen === "forgot" ? (
            <form onSubmit={handleForgot} className="mt-5 space-y-4">
              <EmailField value={email} onChange={setEmail} />
              <Button
                type="submit"
                className="h-11 w-full"
                disabled={busy !== null || !email.trim()}
              >
                {busy === "forgot" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending link…
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send reset link
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  reset();
                  setScreen("signin");
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Button>
            </form>
          ) : null}
        </div>

        <div className="mt-4">
          <InstallAppCard />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Trouble signing in? Reset your password above — we'll never ask for it by email.
        </p>
      </div>
    </div>
  );
}

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="you@example.com"
      />
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="••••••••"
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="mr-2 h-4 w-4 fill-current">
      <path d="M16.37 12.76c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71s1.71.71 2.88.69c1.19-.02 1.94-1.08 2.67-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.31-.89-2.33-3.54zM14.17 6.3c.61-.74 1.02-1.76.91-2.78-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.69-.93 2.69.98.08 1.98-.5 2.59-1.23z" />
    </svg>
  );
}

function MicrosoftGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="mr-2 h-4 w-4">
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}