import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Download, Copy, ImagePlus, RotateCcw, Save } from "lucide-react";
import {
  ASPECT_OPTIONS,
  LAYOUT_OPTIONS,
  type OverlayBrandKit,
  contactLine,
  defaultBrandKit,
  loadBrandKit,
  newSponsor,
  preloadImage,
  readFileAsDataUrl,
  renderOverlay,
  saveBrandKit,
  sponsorLine,
} from "@/lib/overlay-lab";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export function OverlayLab() {
  const [kit, setKit] = useState<OverlayBrandKit>(defaultBrandKit);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaImg, setMediaImg] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Brand kit is stored per device, so load it after hydration.
  useEffect(() => setKit(loadBrandKit()), []);

  const patch = useCallback(
    (changes: Partial<OverlayBrandKit>) => setKit((k) => ({ ...k, ...changes })),
    [],
  );

  useEffect(() => {
    if (!kit.logoDataUrl) return;
    void preloadImage(kit.logoDataUrl).then(() => draw());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit.logoDataUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) renderOverlay(canvas, { kit, media: mediaImg });
  }, [kit, mediaImg]);

  useEffect(() => {
    draw();
  }, [draw]);

  const aspect = useMemo(
    () => ASPECT_OPTIONS.find((a) => a.value === kit.aspect) ?? ASPECT_OPTIONS[1],
    [kit.aspect],
  );

  async function onPickMedia(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("That file is over 12 MB — try a smaller export.");
      return;
    }
    try {
      const url = await readFileAsDataUrl(file);
      const img = await preloadImage(url);
      setMediaUrl(url);
      setMediaImg(img);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't read that image.");
    }
  }

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("That logo is over 12 MB — try a smaller file.");
      return;
    }
    try {
      const url = await readFileAsDataUrl(file);
      await preloadImage(url);
      patch({ logoDataUrl: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't read that logo.");
    }
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `dgd-overlay-${kit.aspect}${mediaImg ? "" : "-transparent"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success(
      mediaImg ? "Overlay exported — attach it to your next post." : "Transparent frame exported.",
    );
  }

  async function copyCredits() {
    const text = [sponsorLine(kit), contactLine(kit)].filter(Boolean).join("\n");
    if (!text) {
      toast.error("Add sponsors or contact details first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Credit lines copied — paste them into your caption.");
    } catch {
      toast.error("Your browser blocked the clipboard. Copy the text manually.");
    }
  }

  function persist() {
    saveBrandKit(kit);
    toast.success("Brand kit saved on this device.");
  }

  function reset() {
    setKit(defaultBrandKit());
    saveBrandKit(defaultBrandKit());
    setMediaUrl(null);
    setMediaImg(null);
    toast.success("Overlay Lab reset.");
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Artwork</CardTitle>
            <CardDescription>
              Drop in a photo or a still from your video, or leave it empty to export a transparent
              frame you can drop over footage in your editor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <label className="cursor-pointer">
                  <ImagePlus className="mr-1.5 h-4 w-4" />
                  {mediaUrl ? "Replace image" : "Add image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void onPickMedia(e.target.files?.[0])}
                  />
                </label>
              </Button>
              {mediaUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMediaUrl(null);
                    setMediaImg(null);
                  }}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Remove image
                </Button>
              )}
              <Badge variant="secondary">
                {aspect.label} · {aspect.width}×{aspect.height}
              </Badge>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Canvas size</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ASPECT_OPTIONS.map((a) => (
                    <Button
                      key={a.value}
                      size="sm"
                      variant={kit.aspect === a.value ? "default" : "outline"}
                      onClick={() => patch({ aspect: a.value })}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Overlay style</Label>
                <div className="flex flex-wrap gap-1.5">
                  {LAYOUT_OPTIONS.map((l) => (
                    <Button
                      key={l.value}
                      size="sm"
                      variant={kit.layout === l.value ? "default" : "outline"}
                      onClick={() => patch({ layout: l.value })}
                      title={l.hint}
                    >
                      {l.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {LAYOUT_OPTIONS.find((l) => l.value === kit.layout)?.hint}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your details</CardTitle>
            <CardDescription>
              These appear on every overlay you export, so viewers always know who made it and how
              to reach you.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ol-name">Name</Label>
              <Input
                id="ol-name"
                value={kit.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
                placeholder="Michael Furst"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ol-handle">Handle</Label>
              <Input
                id="ol-handle"
                value={kit.handle}
                onChange={(e) => patch({ handle: e.target.value })}
                placeholder="@yourhandle"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ol-tagline">Tagline</Label>
              <Input
                id="ol-tagline"
                value={kit.tagline}
                onChange={(e) => patch({ tagline: e.target.value })}
                placeholder="Course reviews & league coverage"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ol-site">Website</Label>
              <Input
                id="ol-site"
                value={kit.website}
                onChange={(e) => patch({ website: e.target.value })}
                placeholder="dgdashboard.app/you"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ol-email">Booking email</Label>
              <Input
                id="ol-email"
                value={kit.contactEmail}
                onChange={(e) => patch({ contactEmail: e.target.value })}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ol-phone">Phone (optional)</Label>
              <Input
                id="ol-phone"
                value={kit.contactPhone}
                onChange={(e) => patch({ contactPhone: e.target.value })}
                placeholder="(555) 010-1234"
              />
            </div>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <Label htmlFor="ol-contact-row">Show contact row</Label>
                <p className="text-xs text-muted-foreground">
                  Hide it for reels where you only want sponsors.
                </p>
              </div>
              <Switch
                id="ol-contact-row"
                checked={kit.showContactRow}
                onCheckedChange={(v) => patch({ showContactRow: v })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base">Sponsors</CardTitle>
              <CardDescription>
                Listed in order, separated automatically on the overlay.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => patch({ sponsors: [...kit.sponsors, newSponsor()] })}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add sponsor
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ol-intro">Lead-in text</Label>
              <Input
                id="ol-intro"
                value={kit.sponsorIntro}
                onChange={(e) => patch({ sponsorIntro: e.target.value })}
                placeholder="Supported by"
              />
            </div>
            {kit.sponsors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sponsors yet. Add the shops, clubs, or brands you want credited on every post.
              </p>
            ) : (
              kit.sponsors.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Input
                    value={s.name}
                    placeholder={`Sponsor ${i + 1}`}
                    onChange={(e) =>
                      patch({
                        sponsors: kit.sponsors.map((x) =>
                          x.id === s.id ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove sponsor ${i + 1}`}
                    onClick={() =>
                      patch({ sponsors: kit.sponsors.filter((x) => x.id !== s.id) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Look</CardTitle>
            <CardDescription>Accent color, text color, logo, and scrim strength.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ol-accent">Accent color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="ol-accent"
                  type="color"
                  value={kit.accentColor}
                  onChange={(e) => patch({ accentColor: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
                />
                <Input
                  value={kit.accentColor}
                  onChange={(e) => patch({ accentColor: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ol-text">Text color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="ol-text"
                  type="color"
                  value={kit.textColor}
                  onChange={(e) => patch({ textColor: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
                />
                <Input
                  value={kit.textColor}
                  onChange={(e) => patch({ textColor: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Scrim behind text — {kit.scrim}%</Label>
              <Slider
                value={[kit.scrim]}
                min={0}
                max={100}
                step={5}
                onValueChange={([v]) => patch({ scrim: v ?? 55 })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Logo or wordmark</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <label className="cursor-pointer">
                    <ImagePlus className="mr-1.5 h-4 w-4" />
                    {kit.logoDataUrl ? "Replace logo" : "Add logo"}
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/webp,image/jpeg"
                      className="hidden"
                      onChange={(e) => void onPickLogo(e.target.files?.[0])}
                    />
                  </label>
                </Button>
                {kit.logoDataUrl && (
                  <Button size="sm" variant="ghost" onClick={() => patch({ logoDataUrl: null })}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> Remove logo
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  Transparent PNG works best.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>Exports at full {aspect.label.toLowerCase()} resolution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="overflow-hidden rounded-lg border border-border"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%, transparent 75%, hsl(var(--muted)) 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 8px 8px",
              }}
            >
              <canvas ref={canvasRef} className="block h-auto w-full" />
            </div>
            <div className="grid gap-2">
              <Button onClick={download}>
                <Download className="mr-1.5 h-4 w-4" /> Export PNG
              </Button>
              <Button variant="outline" onClick={() => void copyCredits()}>
                <Copy className="mr-1.5 h-4 w-4" /> Copy credit lines
              </Button>
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={persist}>
                  <Save className="mr-1.5 h-4 w-4" /> Save kit
                </Button>
                <Button className="flex-1" variant="ghost" onClick={reset}>
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Reset
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Nothing leaves your device until you attach the exported file to a post.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Caption block</CardTitle>
            <CardDescription>Paste this under your post so credits stay searchable.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              readOnly
              rows={4}
              value={[sponsorLine(kit), contactLine(kit)].filter(Boolean).join("\n")}
              placeholder="Add sponsors and contact details to build your credit block."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
