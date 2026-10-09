import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, ShieldCheck } from "lucide-react";
import {
  CATEGORY_LABEL,
  STABILITY_LABEL,
  fetchPlastics,
  flightLine,
  flightNarrative,
  netStability,
  plasticLine,
  specLine,
  type MoldRow,
  type PlasticRow,
} from "@/lib/disc-catalog";

/**
 * Everything the library knows about one mold: published flight numbers, what that
 * flight actually means on the course, official PDGA specs and the brand's plastics.
 */
export function DiscDetailSheet({
  mold,
  onClose,
  onAdd,
}: {
  mold: MoldRow | null;
  onClose: () => void;
  onAdd?: (mold: MoldRow) => void;
}) {
  const [plastics, setPlastics] = useState<PlasticRow[]>([]);

  useEffect(() => {
    if (!mold) return;
    let cancelled = false;
    fetchPlastics(mold.manufacturer_id)
      .then((rows) => !cancelled && setPlastics(rows))
      .catch(() => !cancelled && setPlastics([]));
    return () => {
      cancelled = true;
    };
  }, [mold]);

  if (!mold) return null;

  const flight = flightLine(mold);
  const narrative = flightNarrative(mold);
  const specs = specLine(mold);
  const net = netStability(mold);

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mold.brand} {mold.name}
            {mold.pdga_approved ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500" aria-label="PDGA approved" />
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{CATEGORY_LABEL[mold.category] ?? "Specialty"}</Badge>
            {mold.stability ? (
              <Badge variant="outline">{STABILITY_LABEL[mold.stability] ?? mold.stability}</Badge>
            ) : null}
            {flight ? (
              <Badge variant="outline" className="font-mono">
                {flight}
              </Badge>
            ) : (
              <Badge variant="outline">Specs only — no published flight numbers</Badge>
            )}
            {net !== null ? (
              <span className="text-xs text-muted-foreground">Net stability {net > 0 ? `+${net}` : net}</span>
            ) : null}
          </div>

          {mold.description ? <p className="text-muted-foreground">{mold.description}</p> : null}
          {narrative ? <p className="text-muted-foreground">{narrative}</p> : null}

          {flight ? (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Speed", value: mold.speed },
                { label: "Glide", value: mold.glide },
                { label: "Turn", value: mold.turn },
                { label: "Fade", value: mold.fade },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-border p-2 text-center">
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                  <div className="text-lg font-bold">{s.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {specs ? (
            <div>
              <div className="mb-1 font-semibold">Official specs</div>
              <p className="text-xs text-muted-foreground">{specs}</p>
              {mold.pdga_approved_on ? (
                <p className="text-xs text-muted-foreground">
                  PDGA approved {new Date(mold.pdga_approved_on).toLocaleDateString()}
                </p>
              ) : null}
            </div>
          ) : null}

          {plastics.length ? (
            <div>
              <div className="mb-1 font-semibold">{mold.brand} plastics</div>
              <ul className="grid gap-1 sm:grid-cols-2">
                {plastics.map((p) => (
                  <li key={p.id} className="rounded-md border border-border px-2 py-1">
                    <div className="text-xs font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{plasticLine(p)}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {onAdd ? (
              <Button
                onClick={() => {
                  onAdd(mold);
                  onClose();
                }}
              >
                Add to my bag
              </Button>
            ) : null}
            {mold.link_url ? (
              <Button asChild variant="outline">
                <a href={mold.link_url} target="_blank" rel="noreferrer">
                  Manufacturer page <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
