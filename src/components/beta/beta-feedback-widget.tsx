import { useCallback, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bug, Lightbulb, Star, FlaskConical, Send, Camera, Trash2, RefreshCw } from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import {
  BETA_SEVERITIES,
  FEATURE_AREAS,
  betaFeedbackSchema,
  pageLabelFor,
  useBetaProgram,
  type BetaFeedbackKind,
  type BetaFeedbackSeverity,
} from "@/lib/beta";
import { cn } from "@/lib/utils";
import {
  CAPTURE_HIDE_ATTR,
  capturePageScreenshot,
  uploadBetaScreenshot,
} from "@/lib/beta-screenshot";
import { ScreenshotAnnotator } from "@/components/beta/screenshot-annotator";

/**
 * Floating beta feedback launcher. Rendered by AppShell for every signed-in
 * screen while the beta program is switched on. Captures the current route,
 * device, and build label automatically so testers only write the human part.
 */
export function BetaFeedbackWidget() {
  const { user } = useSession();
  const program = useBetaProgram();
  const [open, setOpen] = useState(false);

  if (!user || !program.data?.is_enabled) return null;

  return (
    <>
      {/* Desktop only. On phones the launcher lives in the More sheet so it can
          never sit on top of page buttons or the bottom bar. */}
      <Button
        type="button"
        size="sm"
        {...{ [CAPTURE_HIDE_ATTR]: "" }}
        onClick={() => setOpen(true)}
        aria-label="Send beta feedback"
        className="fixed bottom-4 right-20 z-40 hidden gap-1.5 rounded-full shadow-lg ring-2 ring-background md:inline-flex"
      >
        <FlaskConical className="h-4 w-4" />
        Beta feedback
      </Button>
      <BetaFeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function BetaFeedbackDialog({
  open,
  onOpenChange,
  defaultKind = "bug",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultKind?: BetaFeedbackKind;
}) {
  const qc = useQueryClient();
  const { user } = useSession();
  const program = useBetaProgram();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [kind, setKind] = useState<BetaFeedbackKind>(defaultKind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [severity, setSeverity] = useState<BetaFeedbackSeverity>("minor");
  const [area, setArea] = useState<string>(FEATURE_AREAS[0]);
  const [shot, setShot] = useState<string | null>(null);
  const [markedShot, setMarkedShot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const pageLabel = useMemo(() => pageLabelFor(pathname), [pathname]);

  const capture = useCallback(async () => {
    setCapturing(true);
    try {
      // Let the browser paint the hidden dialog before we snapshot the screen.
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
      const png = await capturePageScreenshot();
      setShot(png);
      setMarkedShot(png);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Couldn't capture the screen: ${e.message}`
          : "Couldn't capture the screen",
      );
    } finally {
      setCapturing(false);
    }
  }, []);

  const clearShot = useCallback(() => {
    setShot(null);
    setMarkedShot(null);
  }, []);

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = betaFeedbackSchema.safeParse({
        kind,
        title,
        body,
        rating: kind === "rating" ? rating : null,
        severity: kind === "bug" ? severity : null,
        feature_area: area,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      if (kind === "rating" && !rating) throw new Error("Pick a star rating for this page");
      let screenshotPath: string | null = null;
      const image = markedShot ?? shot;
      if (image && user?.id) screenshotPath = await uploadBetaScreenshot(user.id, image);
      const { error } = await supabase.from("beta_feedback").insert({
        kind: parsed.data.kind,
        title: parsed.data.title,
        body: parsed.data.body || null,
        rating: parsed.data.rating ?? null,
        severity: parsed.data.severity ?? null,
        feature_area: parsed.data.feature_area ?? null,
        route_path: pathname,
        page_label: pageLabel,
        screenshot_path: screenshotPath,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : null,
        viewport:
          typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight}` : null,
        build_label: program.data?.build_label ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sent — thanks, that goes straight to the triage board.");
      qc.invalidateQueries({ queryKey: ["beta"] });
      setTitle("");
      setBody("");
      setRating(null);
      clearShot();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Beta feedback</DialogTitle>
          <DialogDescription>
            You're on <span className="font-medium text-foreground">{pageLabel}</span>. We attach
            the page, your screen size, and the build so you don't have to.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={kind} onValueChange={(v) => setKind(v as BetaFeedbackKind)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="bug" className="gap-1.5">
              <Bug className="h-4 w-4" /> Bug
            </TabsTrigger>
            <TabsTrigger value="idea" className="gap-1.5">
              <Lightbulb className="h-4 w-4" /> Idea
            </TabsTrigger>
            <TabsTrigger value="rating" className="gap-1.5">
              <Star className="h-4 w-4" /> Rate page
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="beta-title">
                {kind === "bug"
                  ? "What went wrong?"
                  : kind === "idea"
                    ? "What would make this better?"
                    : "Headline for this page"}
              </Label>
              <Input
                id="beta-title"
                value={title}
                maxLength={140}
                placeholder={
                  kind === "bug"
                    ? "Tee times show TBD after syncing"
                    : kind === "idea"
                      ? "Let me filter the tracker by division"
                      : "Clear, but the cards are cramped on mobile"
                }
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <TabsContent value="bug" className="m-0 space-y-4">
              <div className="space-y-1.5">
                <Label>How bad is it?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {BETA_SEVERITIES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSeverity(s.value)}
                      className={cn(
                        "rounded-lg border p-2 text-left text-sm transition-colors",
                        severity === s.value ? "border-primary bg-primary/10" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="font-medium">{s.label}</span>
                      <span className="block text-xs text-muted-foreground">{s.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="rating" className="m-0 space-y-1.5">
              <Label>How does this page feel right now?</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    onClick={() => setRating(n)}
                    className="rounded p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={cn(
                        "h-7 w-7",
                        rating && n <= rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground",
                      )}
                    />
                  </button>
                ))}
              </div>
            </TabsContent>

            <div className="space-y-1.5">
              <Label htmlFor="beta-area">Feature area</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger id="beta-area">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEATURE_AREAS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="beta-body">
                {kind === "bug" ? "Steps you took, and what you expected" : "Details"}
              </Label>
              <Textarea
                id="beta-body"
                rows={4}
                maxLength={4000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  kind === "bug"
                    ? "1. Opened the tracker\n2. Hit Refresh\n3. Round 1 still says Course TBD — I expected Westwood"
                    : "Anything that helps us picture it."
                }
              />
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Screenshot</Label>
                  <p className="text-xs text-muted-foreground">
                    Grab this screen, then circle or draw on what's wrong.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={capturing}
                    onClick={capture}
                  >
                    {shot ? <RefreshCw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                    {capturing ? "Capturing…" : shot ? "Retake" : "Capture screen"}
                  </Button>
                  {shot ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={clearShot}
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  ) : null}
                </div>
              </div>
              {shot ? <ScreenshotAnnotator imageUrl={shot} onChange={setMarkedShot} /> : null}
            </div>

            <Button
              className="w-full gap-2"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              <Send className="h-4 w-4" />
              {submit.isPending ? "Sending…" : "Send feedback"}
            </Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
