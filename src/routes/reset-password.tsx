import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { Mascot } from "@/components/mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { persistSessionFromUrl } from "@/lib/auth-flow";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password · DG Dashboard" },
      { name: "description", content: "Choose a new password for your DG Dashboard account." },
      { property: "og:title", content: "Reset password · DG Dashboard" },
      {
        property: "og:description",
        content: "Choose a new password for your DG Dashboard account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [recoveryState, setRecoveryState] = useState<"verifying" | "ready" | "expired">(
    "verifying",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const ready = recoveryState === "ready";

  // Supabase parses the recovery token from the URL hash and fires PASSWORD_RECOVERY.
  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) setRecoveryState("ready");
    });

    async function verifyRecoveryLink() {
      try {
        const session = await persistSessionFromUrl();
        if (!mounted) return;
        if (session) {
          setRecoveryState("ready");
          return;
        }

        // If the user is already signed in (opened link in-app), allow reset.
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setRecoveryState(data.session ? "ready" : "expired");
      } catch {
        if (!mounted) return;
        setRecoveryState("expired");
        toast.error("This reset link could not be verified. Request a fresh link and try again.");
      }
    }

    void verifyRecoveryLink();
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/home", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex flex-col items-center justify-center gap-2">
          <Mascot name="ace" size={112} className="drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]" />
          <span className="font-display text-4xl font-extrabold tracking-tight text-primary">
            DG Dashboard
          </span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
          <h1 className="text-xl font-semibold">Choose a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ready
              ? "Enter and confirm your new password below."
              : recoveryState === "expired"
                ? "This reset link is missing, expired, or opened in a browser that could not save the recovery session."
                : "Verifying recovery link…"}
          </p>

          {recoveryState === "expired" && (
            <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Request a fresh reset link.</p>
                  <p className="text-muted-foreground">
                    Open the newest email link in the same browser where you requested it. If your
                    mail app opens links in an in-app browser, use “Open in browser” first.
                  </p>
                  <Link to="/auth" className="inline-flex text-primary hover:underline">
                    Send another reset link
                  </Link>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                disabled={!ready || loading}
                label={showPassword ? "Hide new password" : "Show new password"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <PasswordInput
                id="confirm"
                value={confirm}
                onChange={setConfirm}
                show={showConfirm}
                onToggle={() => setShowConfirm((value) => !value)}
                disabled={!ready || loading}
                label={showConfirm ? "Hide confirmed password" : "Show confirmed password"}
              />
            </div>
            <Button
              type="submit"
              disabled={!ready || loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link to="/auth" className="hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggle,
  disabled,
  label,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        required
        minLength={8}
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        disabled={disabled}
        className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
