import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  KeyRound,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Printer,
  QrCode,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  createJoinCode,
  ensureRoundJoinCode,
  listGuestCards,
  listJoinCodes,
  setJoinCodeActive,
} from "@/lib/guest-scoring.functions";
import { isValidPin, type JoinTargetKind } from "@/lib/guest-scoring";

export type JoinCodeScope = {
  target_kind: JoinTargetKind;
  tournament_id?: string;
  tournament_round_id?: string;
  league_id?: string;
  league_event_id?: string;
  round_id?: string;
  course_id?: string;
  layout_id?: string;
};

type Props = {
  scope: JoinCodeScope;
  eventName: string;
  /** Shown above the codes list; keep it one sentence. */
  description?: string;
};

function scoreUrl(code: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/score?c=${code}`;
}

/**
 * Director tool: generate browser scoring codes so players can keep score
 * without an account, print a QR poster, and watch the guest cards come in.
 */
export function JoinCodePanel({ scope, eventName, description }: Props) {
  const qc = useQueryClient();
  const listKey = ["join-codes", scope.tournament_id ?? scope.league_id ?? scope.round_id ?? ""];
  const [label, setLabel] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [allowGuestCards, setAllowGuestCards] = React.useState(true);
  const [allowCaddy, setAllowCaddy] = React.useState(true);
  const [openQr, setOpenQr] = React.useState<string | null>(null);
  const [openCards, setOpenCards] = React.useState<string | null>(null);

  const codes = useQuery({
    queryKey: listKey,
    queryFn: () =>
      listJoinCodes({
        data: {
          ...(scope.tournament_id ? { tournament_id: scope.tournament_id } : {}),
          ...(scope.league_id ? { league_id: scope.league_id } : {}),
          ...(scope.round_id ? { round_id: scope.round_id } : {}),
        },
      }),
  });

  // Casual rounds always carry a code — mint one the first time nobody has.
  const ensuring = React.useRef(false);
  React.useEffect(() => {
    if (scope.target_kind !== "round" || !scope.round_id) return;
    if (!codes.data || codes.data.length > 0 || ensuring.current) return;
    ensuring.current = true;
    void ensureRoundJoinCode({ data: { round_id: scope.round_id } })
      .then(() => qc.invalidateQueries({ queryKey: listKey }))
      .catch(() => undefined)
      .finally(() => {
        ensuring.current = false;
      });
  }, [codes.data, scope.target_kind, scope.round_id, qc, listKey]);



  const create = useMutation({
    mutationFn: () =>
      createJoinCode({
        data: {
          ...scope,
          label: label.trim() || null,
          pin: pin.trim() ? pin.trim() : null,
          allow_guest_cards: allowGuestCards,
          allow_caddy: allowCaddy,
          ai_allowance: 5,
          max_uses: null,
          expires_at: null,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Code ${res.code} is live.`);
      setLabel("");
      setPin("");
      void qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We couldn't create that code."),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => setJoinCodeActive({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: listKey }),
    onError: () => toast.error("We couldn't update that code."),
  });

  const inviteMessage = (code: string, requiresPin: boolean): { subject: string; body: string } => {
    const lines = [
      `Open ${scoreUrl(code)} and enter code ${code}.`,
      "Score from your phone browser — no app or account needed.",
    ];
    if (requiresPin) lines.push("Ask the host for the 4-digit PIN.");
    return { subject: `Keep score for ${eventName}`, body: lines.join("\n") };
  };

  const share = async (code: string, requiresPin: boolean) => {
    const url = scoreUrl(code);
    const { subject, body } = inviteMessage(code, requiresPin);
    try {
      if (navigator.share) {
        await navigator.share({ title: subject, text: body, url });
        return;
      }
      await navigator.clipboard.writeText(body);
      toast.success("Scoring link copied.");
    } catch {
      /* dismissed */
    }
  };

  const textIt = (code: string, requiresPin: boolean) => {
    const { subject, body } = inviteMessage(code, requiresPin);
    window.location.href = `sms:?&body=${encodeURIComponent(`${subject}\n${body}`)}`;
  };

  const emailIt = (code: string, requiresPin: boolean) => {
    const { subject, body } = inviteMessage(code, requiresPin);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };



  const pinInvalid = pin.trim().length > 0 && !isValidPin(pin.trim());

  const isRound = scope.target_kind === "round";

  return (
    <div className="space-y-4">
      {!isRound && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4 text-primary" />
              Browser scoring codes
            </CardTitle>
            <CardDescription>
              {description ??
                "Players scan a QR code or type the code at /score and keep score in a browser — no download, no account."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="code-label">Label (optional)</Label>
                <Input
                  id="code-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Round 1 · Blue tees"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code-pin">4-digit PIN (optional)</Label>
                <Input
                  id="code-pin"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Leave blank for open access"
                  aria-invalid={pinInvalid}
                />
                {pinInvalid && <p className="text-xs text-destructive">Use exactly four digits.</p>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <span className="text-sm">
                  Let players start their own card
                  <span className="block text-xs text-muted-foreground">
                    Off means they can only join a card you created.
                  </span>
                </span>
                <Switch checked={allowGuestCards} onCheckedChange={setAllowGuestCards} />
              </label>
              <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <span className="text-sm">
                  Include the caddy guide
                  <span className="block text-xs text-muted-foreground">
                    Hole details plus five free caddy questions per player.
                  </span>
                </span>
                <Switch checked={allowCaddy} onCheckedChange={setAllowCaddy} />
              </label>
            </div>

            <Button disabled={create.isPending || pinInvalid} onClick={() => create.mutate()}>
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Generate code
            </Button>
          </CardContent>
        </Card>
      )}

      {codes.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !codes.data?.length ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {isRound
              ? "Setting up this round's scoring code…"
              : "No codes yet. Generate one and post it at the first tee."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {codes.data.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-2xl font-semibold tracking-widest">{c.code}</span>
                  {!c.is_active && <Badge variant="secondary">Paused</Badge>}
                  {c.requires_pin && (
                    <Badge variant="outline" className="gap-1">
                      <KeyRound className="h-3 w-3" />
                      PIN
                    </Badge>
                  )}
                  <Badge variant="outline" className="gap-1">
                    <Users className="h-3 w-3" />
                    {c.use_count} joined
                  </Badge>
                  {c.label && <span className="text-sm text-muted-foreground">{c.label}</span>}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void share(c.code, c.requires_pin)}
                  >
                    <Share2 className="mr-1.5 h-3.5 w-3.5" />
                    Share link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!c.is_active}
                    title={
                      c.is_active
                        ? "Open a text message with the code already written"
                        : "Reopen this code before sending it"
                    }
                    onClick={() => textIt(c.code, c.requires_pin)}
                  >
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                    Text it
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!c.is_active}
                    title={
                      c.is_active
                        ? "Open an email with the code already written"
                        : "Reopen this code before sending it"
                    }
                    onClick={() => emailIt(c.code, c.requires_pin)}
                  >
                    <Mail className="mr-1.5 h-3.5 w-3.5" />
                    Email it
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(c.code);
                      toast.success("Code copied.");
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy code
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenQr(openQr === c.code ? null : c.code)}
                  >
                    <QrCode className="mr-1.5 h-3.5 w-3.5" />
                    {openQr === c.code ? "Hide poster" : "QR poster"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenCards(openCards === c.id ? null : c.id)}
                  >
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    {openCards === c.id ? "Hide cards" : "Guest cards"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: c.id, is_active: !c.is_active })}
                  >
                    {c.is_active ? (
                      <>
                        <Pause className="mr-1.5 h-3.5 w-3.5" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                        Reopen
                      </>
                    )}
                  </Button>
                </div>

                {openQr === c.code && <QrPoster code={c.code} eventName={eventName} label={c.label} />}
                {openCards === c.id && <GuestCards codeId={c.id} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function QrPoster({
  code,
  eventName,
  label,
}: {
  code: string;
  eventName: string;
  label: string | null;
}) {
  const [src, setSrc] = React.useState<string | null>(null);
  const url = scoreUrl(code);

  React.useEffect(() => {
    let cancelled = false;
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 640, margin: 1 }))
      .then((d) => {
        if (!cancelled) setSrc(d);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);

  const print = () => {
    if (!src) return;
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) return;
    // Event names and labels are user-entered: escape before writing HTML.
    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
    const safeSrc = /^(data:image\/|https:\/\/)/.test(src) ? esc(src) : "";
    w.document.write(
      `<title>${esc(eventName)} scoring code</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px}h1{font-size:28px;margin:0 0 4px}p{color:#444;margin:4px 0}img{width:420px;margin:24px auto;display:block}.code{font-size:56px;letter-spacing:10px;font-weight:700;font-family:ui-monospace,monospace}</style>` +
        `<h1>${esc(eventName)}</h1><p>${esc(label ?? "Keep score in your browser")}</p><img src="${safeSrc}" alt="Scoring QR code" />` +
        `<p>Or go to ${esc(url.replace(/\?.*$/, ""))} and enter</p><p class="code">${esc(String(code))}</p>` +
        `<p>No app or account needed.</p>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="rounded-lg border bg-muted/40 p-4 text-center">
      {src ? (
        <img src={src} alt={`QR code for scoring ${eventName}`} className="mx-auto h-44 w-44" />
      ) : (
        <div className="flex h-44 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <p className="mt-2 break-all text-xs text-muted-foreground">{url}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={print} disabled={!src}>
        <Printer className="mr-1.5 h-3.5 w-3.5" />
        Print poster
      </Button>
    </div>
  );
}

function GuestCards({ codeId }: { codeId: string }) {
  const cards = useQuery({
    queryKey: ["guest-cards", codeId],
    queryFn: () => listGuestCards({ data: { code_id: codeId } }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  if (cards.isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!cards.data?.length) {
    return (
      <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        No guest cards yet. They appear here as players join.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {cards.data.map((r) => (
        <div key={r.round_id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={r.verified ? "default" : "secondary"} className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              {r.verified ? "Verified" : `${r.scorekeeper_count} scorekeeper${r.scorekeeper_count === 1 ? "" : "s"}`}
            </Badge>
            <span className="text-xs capitalize text-muted-foreground">
              {r.status.replace("_", " ")}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {r.players.map((p, i) => (
              <div key={`${r.round_id}-${i}`} className="flex justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <span className="font-semibold tabular-nums">{p.total || "–"}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Keeping score: {r.scorekeepers.map((s) => s.name).join(", ") || "nobody yet"}
          </p>
        </div>
      ))}
    </div>
  );
}
