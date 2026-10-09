import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { consumePostLoginPath, waitForAuthSession } from "@/lib/auth-flow";

export const Route = createFileRoute("/auth-callback")({
  head: () => ({
    meta: [
      { title: "Completing sign in · DG Dashboard" },
      { name: "description", content: "Completing your DG Dashboard sign in." },
      { property: "og:title", content: "Completing sign in · DG Dashboard" },
      { property: "og:description", content: "Completing your DG Dashboard sign in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    waitForAuthSession(10000)
      .then((session) => {
        if (!mounted) return;
        if (!session) {
          setFailed(true);
          return;
        }
        const destination = consumePostLoginPath();
        if (destination === "/play") {
          navigate({ to: "/play", replace: true });
          return;
        }
        window.location.replace(destination);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <h1 className="text-xl font-semibold">
          {failed ? "Sign in did not finish" : "Completing sign in…"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {failed
            ? "We couldn't complete sign in. Try again or use email sign in."
            : "Keep this screen open while DG Dashboard saves your mobile session."}
        </p>
        {failed && (
          <div className="mt-5 flex justify-center gap-2">
            <Link to="/auth">
              <Button>Back to sign in</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
