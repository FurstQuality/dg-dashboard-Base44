import { useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { type SignDesign, SIGN_FONTS, SIGN_MAP_STYLES } from "@/lib/tee-sign-design";
import { SIGN_PANEL_COLOURS } from "@/lib/tee-sign-pro";
import { uploadSignImage } from "./sign-editor";

const THEMES = [
  { name: "Forest", panel: "#163528", accent: "#b5d334" },
  { name: "Lakeside", panel: "#12324a", accent: "#4fc3f7" },
  { name: "Night glow", panel: "#111827", accent: "#22d3ee" },
  { name: "Trail", panel: "#3b2a1a", accent: "#f2a33a" },
  { name: "Crimson", panel: "#4a1a24", accent: "#f5c542" },
  { name: "Parchment", panel: "#f3efe4", accent: "#1f6b3a" },
];

export function SignStyleSection({
  d,
  setD,
  shared,
  isShared,
  layoutId,
  onUrls,
  pick,
  uploading,
}: {
  d: SignDesign;
  setD: React.Dispatch<React.SetStateAction<SignDesign>>;
  shared: SignDesign | null;
  isShared: boolean;
  layoutId: string;
  onUrls: (u: Record<string, string>) => void;
  pick: (onFile: (f: File) => Promise<void>) => void;
  uploading: boolean;
}) {
  const [name, setName] = useState("");
  const sponsors = (isShared ? d.sponsors : shared?.sponsors) ?? [];
  const chosen = d.holeSponsorIds ?? [];

  if (!isShared) {
    return (
      <section className="space-y-2">
        <h3 className="font-semibold">Hole sponsor</h3>
        {sponsors.length ? (
          sponsors.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <Checkbox
                checked={chosen.includes(s.id)}
                onCheckedChange={(v) =>
                  setD((p) => ({ ...p, holeSponsorIds: v ? [...chosen, s.id] : chosen.filter((x) => x !== s.id) }))
                }
              />
              {s.name}
            </label>
          ))
        ) : (
          <p className="text-muted-foreground">Add sponsors under “Edit all signs”, then pick them for this hole.</p>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="space-y-3">
        <h3 className="font-semibold">Sign style</h3>
        <div className="flex gap-2">
          {(["pro", "photo"] as const).map((s) => (
            <Button key={s} size="sm" variant={(d.style ?? "pro") === s ? "default" : "secondary"} onClick={() => setD({ ...d, style: s })}>
              {s === "pro" ? "Hole map sign" : "Photo sign"}
            </Button>
          ))}
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Colour theme</span>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button key={t.name} type="button" onClick={() => setD({ ...d, panelColour: t.panel, accent: t.accent })}
                className={"flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm " + (d.panelColour === t.panel && d.accent === t.accent ? "border-primary" : "border-border")}>
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: t.panel }} />
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: t.accent }} />
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-muted-foreground">Lettering</span>
          <select value={d.font ?? "bebas"} onChange={(e) => setD({ ...d, font: e.target.value as SignDesign["font"] })} className="w-full rounded-md border border-input bg-background px-2 py-1.5">
            {SIGN_FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.display }}>{f.label}</option>)}
          </select>
        </label>
        <div className="space-y-1">
          <span className="text-muted-foreground">Hole map look</span>
          <div className="flex flex-wrap gap-2">
            {SIGN_MAP_STYLES.map((m) => (
              <Button key={m.id} size="sm" title={m.hint} variant={(d.mapStyle ?? "illustrated") === m.id ? "default" : "secondary"} onClick={() => setD({ ...d, mapStyle: m.id })}>
                {m.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Course logo</span>
          <Button size="sm" variant="secondary" disabled={uploading} onClick={() => pick(async (f) => {
            const { path, url } = await uploadSignImage(layoutId, f);
            onUrls({ [path]: url });
            setD((p) => ({ ...p, logoPath: path }));
          })}>
            <ImagePlus className="mr-1 h-4 w-4" /> {d.logoPath ? "Replace logo" : "Add logo"}
          </Button>
          {d.logoPath ? <Button size="sm" variant="ghost" onClick={() => setD({ ...d, logoPath: null })}>Use course name</Button> : null}
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Print colour</span>
          <div className="flex flex-wrap items-center gap-2">
            {SIGN_PANEL_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use colour ${c}`}
                onClick={() => setD({ ...d, panelColour: c })}
                className={"h-8 w-8 rounded-full border-2 " + ((d.panelColour ?? SIGN_PANEL_COLOURS[0]) === c ? "border-primary" : "border-border")}
                style={{ backgroundColor: c }}
              />
            ))}
            <input type="color" aria-label="Custom colour" value={d.panelColour ?? SIGN_PANEL_COLOURS[0]} onChange={(e) => setD({ ...d, panelColour: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Highlight colour</span>
          <input type="color" value={d.accent ?? "#b5d334"} onChange={(e) => setD({ ...d, accent: e.target.value })} />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Distance</span>
          <select value={d.units ?? "both"} onChange={(e) => setD({ ...d, units: e.target.value as SignDesign["units"] })} className="rounded-md border border-input bg-background px-1 py-1">
            <option value="both">Feet and metres</option>
            <option value="ft">Feet</option>
            <option value="m">Metres</option>
          </select>
        </label>
        <label className="flex items-center justify-between">
          <span>Rule lines from the hole map (OB, mando, drop zone)</span>
          <Switch checked={d.showRules !== false} onCheckedChange={(v) => setD({ ...d, showRules: v })} />
        </label>
        <label className="flex items-center justify-between">
          <span>QR code to the live course map</span>
          <Switch checked={d.showQr !== false} onCheckedChange={(v) => setD({ ...d, showQr: v })} />
        </label>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Sponsors</h3>
        {(d.sponsors ?? []).map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <span className="flex-1 truncate">{s.name}{s.logoPath ? "" : " · no logo yet"}</span>
            <Button size="sm" variant="ghost" disabled={uploading} onClick={() => pick(async (f) => {
              const { path, url } = await uploadSignImage(layoutId, f);
              onUrls({ [path]: url });
              setD((p) => ({ ...p, sponsors: (p.sponsors ?? []).map((x) => (x.id === s.id ? { ...x, logoPath: path } : x)) }));
            })}>
              <ImagePlus className="mr-1 h-4 w-4" /> Logo
            </Button>
            <Button size="icon" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => setD((p) => ({ ...p, sponsors: (p.sponsors ?? []).filter((x) => x.id !== s.id) }))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            setD((p) => ({ ...p, sponsors: [...(p.sponsors ?? []), { id: Math.random().toString(36).slice(2, 10), name: n.slice(0, 60) }] }));
            setName("");
          }}
        >
          <Input placeholder="Sponsor name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" type="submit" variant="secondary"><Plus className="mr-1 h-4 w-4" /> Add</Button>
        </form>
        <label className="flex items-center justify-between">
          <span>Print every sponsor along the bottom</span>
          <Switch checked={!!d.sponsorStrip} onCheckedChange={(v) => setD({ ...d, sponsorStrip: v })} />
        </label>
        <p className="text-muted-foreground">Pick each hole’s own sponsor from that hole’s Edit sign.</p>
      </section>
    </>
  );
}
