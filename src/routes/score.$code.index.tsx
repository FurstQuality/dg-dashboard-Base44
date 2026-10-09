import { createFileRoute, useNavigate, useLoaderData } from "@tanstack/react-router";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Users, User, Plus, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { joinWithCode } from "@/lib/guest-scoring.functions";
import { loadGuestToken, saveGuestToken } from "@/lib/guest-scoring";

export const Route = createFileRoute("/score/$code/")({
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const info = useLoaderData({ from: "/score/$code" });
  const navigate = useNavigate();

  const [name, setName] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [division, setDivision] = React.useState<string>("");
  const [pdga, setPdga] = React.useState("");
  const [mode, setMode] = React.useState<"card" | "self">("card");
  const [cardRoundId, setCardRoundId] = React.useState<string>("new");
  const [others, setOthers] = React.useState<string[]>([""]);

  // Already scoring on this device? Jump straight back into the card.
  React.useEffect(() => {
    if (loadGuestToken(code)) {
      void navigate({ to: "/score/$code/card", params: { code } });
    }
  }, [code, navigate]);

  const join = useMutation({
    mutationFn: () =>
      joinWithCode({
        data: {
          code,
          pin: pin || undefined,
          display_name: name.trim(),
          division_name: division || undefined,
          pdga_number: pdga.trim() || undefined,
          scores_whole_card: mode === "card",
          card_round_id: cardRoundId !== "new" ? cardRoundId : undefined,
          card_players: mode === "card" ? others.map((o) => o.trim()).filter(Boolean) : [],
        },
      }),
    onSuccess: (session) => {
      saveGuestToken(code, session.token);
      toast.success("You're on the card. Good luck out there.");
      void navigate({ to: "/score/$code/card", params: { code } });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We couldn't join that card."),
  });

  if (info.status !== "open") {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scoring isn't open for this code</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {info.status === "expired"
              ? "This code has expired. Ask the director for the current one."
              : info.status === "full"
                ? "This code hit its player limit. The director can raise it or issue a new code."
                : "The director has closed guest scoring for this event."}
          </CardContent>
        </Card>
      </main>
    );
  }

  const canJoin = name.trim().length >= 2 && (!info.requires_pin || pin.length === 4);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Join the scorecard</h1>
        <p className="text-sm text-muted-foreground">
          {info.hole_count} holes
          {info.par_total ? ` · par ${info.par_total}` : ""}
          {info.course_name ? ` · ${info.course_name}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Who's playing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First and last name"
              autoComplete="name"
            />
            <p className="text-xs text-muted-foreground">
              Use the name you registered with so the director can match your card.
            </p>
          </div>

          {info.divisions.length > 0 && (
            <div className="space-y-2">
              <Label>Division</Label>
              <Select value={division} onValueChange={setDivision}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick your division" />
                </SelectTrigger>
                <SelectContent>
                  {info.divisions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pdga">PDGA number (optional)</Label>
            <Input
              id="pdga"
              value={pdga}
              onChange={(e) => setPdga(e.target.value)}
              placeholder="e.g. 123456"
              inputMode="numeric"
            />
          </div>

          {info.requires_pin && (
            <div className="space-y-2">
              <Label htmlFor="pin">Event PIN</Label>
              <Input
                id="pin"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="4 digits"
                inputMode="numeric"
                className="max-w-[8rem] tracking-[0.3em]"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What are you keeping score for?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("card")}
              className={`flex items-start gap-2 rounded-lg border p-3 text-left text-sm ${
                mode === "card" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="block font-medium">The whole card</span>
                <span className="text-xs text-muted-foreground">
                  Enter scores for everyone in your group.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("self")}
              className={`flex items-start gap-2 rounded-lg border p-3 text-left text-sm ${
                mode === "self" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <User className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="block font-medium">Just me</span>
                <span className="text-xs text-muted-foreground">
                  Track your own scores only.
                </span>
              </span>
            </button>
          </div>

          <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            A card earns a DGD rating once two scorekeepers on it agree. Ask a groupmate to join with
            the same code and keep score too.
          </p>

          {info.cards.length > 0 && (
            <div className="space-y-2">
              <Label>Card</Label>
              <Select value={cardRoundId} onValueChange={setCardRoundId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {info.allow_guest_cards && <SelectItem value="new">Start a new card</SelectItem>}
                  {info.cards.map((c, i) => (
                    <SelectItem key={c.round_id} value={c.round_id}>
                      Card {i + 1} — {c.players.map((p) => p.name).join(", ") || "no players yet"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Joining your groupmates' card is what makes the scores verified.
              </p>
            </div>
          )}

          {mode === "card" && cardRoundId === "new" && (
            <div className="space-y-2">
              <Label>Others on your card</Label>
              {others.map((value, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={value}
                    onChange={(e) =>
                      setOthers((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                    placeholder={`Player ${i + 2}`}
                  />
                  {others.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setOthers((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove player"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {others.length < 5 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOthers((prev) => [...prev, ""])}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add player
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        disabled={!canJoin || join.isPending}
        onClick={() => join.mutate()}
      >
        {join.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ArrowRight className="mr-2 h-4 w-4" />
        )}
        Start scoring
      </Button>
    </main>
  );
}
