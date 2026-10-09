import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Tag } from "lucide-react";
import { ContentCard } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/current-user";
import { bagDiscsQueryOptions, type BagDisc } from "@/lib/entities/bag";
import { addListingPhoto, createListing, uploadMarketplacePhoto } from "@/lib/marketplace";

const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "worn", label: "Worn in" },
  { value: "beat_in", label: "Beat in" },
];

const DISC_TYPES = [
  { value: "distance_driver", label: "Distance driver" },
  { value: "fairway_driver", label: "Fairway driver" },
  { value: "midrange", label: "Midrange" },
  { value: "putter", label: "Putter" },
  { value: "approach", label: "Approach" },
];

export function SellDiscPanel({ initialBagDiscId = null }: { initialBagDiscId?: string | null }) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const navigate = useNavigate();
  const bag = useQuery(bagDiscsQueryOptions(userId));

  const [source, setSource] = useState<"bag" | "manual">("bag");
  const [bagDiscId, setBagDiscId] = useState(initialBagDiscId ?? "");

  const [moldName, setMoldName] = useState("");
  const [brand, setBrand] = useState("");
  const [plasticName, setPlasticName] = useState("");
  const [discType, setDiscType] = useState("");
  const [color, setColor] = useState("");
  const [weight, setWeight] = useState("");
  const [condition, setCondition] = useState("worn");
  const [price, setPrice] = useState("");
  const [tradeOnly, setTradeOnly] = useState(false);
  const [inkName, setInkName] = useState("");
  const [inkPdga, setInkPdga] = useState("");
  const [inkNotes, setInkNotes] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const bagDiscs = bag.data ?? [];
  const selectedBagDisc = useMemo<BagDisc | null>(
    () => bagDiscs.find((d) => d.id === bagDiscId) ?? null,
    [bagDiscs, bagDiscId],
  );

  const resolvedMold = source === "bag" ? (selectedBagDisc?.mold?.name ?? "") : moldName;
  const canSubmit = Boolean(userId) && resolvedMold.trim().length > 0 && !saving;

  async function submit() {
    if (!userId || !resolvedMold.trim()) return;
    setSaving(true);
    try {
      const mold = source === "bag" ? (selectedBagDisc?.mold ?? null) : null;
      const listingId = await createListing(userId, {
        moldId: mold?.id ?? null,
        userDiscId: source === "bag" ? bagDiscId || null : null,
        brand: (source === "bag" ? mold?.manufacturer?.name : brand) || null,
        moldName: resolvedMold.trim(),
        plasticName: plasticName.trim() || null,
        discType: (source === "bag" ? mold?.category : discType) || null,
        speed: mold?.speed ?? null,
        glide: mold?.glide ?? null,
        turn: mold?.turn ?? null,
        fade: mold?.fade ?? null,
        color: (source === "bag" ? selectedBagDisc?.color : color) || null,
        weightGrams: weight ? Number(weight) : null,
        condition,
        inkName: inkName.trim() || null,
        inkPdgaNumber: inkPdga ? Number(inkPdga) : null,
        inkNotes: inkNotes.trim() || null,
        description: description.trim() || null,
        priceCents: price ? Math.round(Number(price) * 100) : null,
        tradeOnly,
        city: city.trim() || null,
        state: state.trim() || null,
      });

      for (const [index, file] of photos.entries()) {
        try {
          const url = await uploadMarketplacePhoto(userId, file);
          await addListingPhoto(listingId, userId, url, index);
        } catch {
          toast.error(`We couldn't attach ${file.name}. Your listing is still posted.`);
        }
      }

      toast.success("Your disc is live in the local marketplace.");
      void navigate({ to: "/marketplace/$listingId", params: { listingId } });
    } catch {
      toast.error("We couldn't post that listing. Check the details and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ContentCard title="The disc" subtitle="What are you letting go of?">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={source === "bag" ? "default" : "outline"}
              size="sm"
              onClick={() => setSource("bag")}
            >
              From my bag
            </Button>
            <Button
              variant={source === "manual" ? "default" : "outline"}
              size="sm"
              onClick={() => setSource("manual")}
            >
              Enter by hand
            </Button>
          </div>

          {source === "bag" ? (
            <div className="space-y-1.5">
              <Label>Bag disc</Label>
              <Select value={bagDiscId} onValueChange={setBagDiscId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={bagDiscs.length ? "Pick a disc" : "Your bag is empty"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {bagDiscs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {[d.mold?.manufacturer?.name, d.mold?.name, d.nickname]
                        .filter(Boolean)
                        .join(" · ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sell-mold">Mold</Label>
                <Input
                  id="sell-mold"
                  value={moldName}
                  placeholder="Destroyer"
                  onChange={(e) => setMoldName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sell-brand">Brand</Label>
                <Input
                  id="sell-brand"
                  value={brand}
                  placeholder="Innova"
                  onChange={(e) => setBrand(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Disc type</Label>
                <Select value={discType} onValueChange={setDiscType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISC_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sell-color">Color</Label>
                <Input
                  id="sell-color"
                  value={color}
                  placeholder="Orange"
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="sell-plastic">Plastic</Label>
              <Input
                id="sell-plastic"
                value={plasticName}
                placeholder="Star"
                onChange={(e) => setPlasticName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sell-weight">Weight (g)</Label>
              <Input
                id="sell-weight"
                inputMode="numeric"
                value={weight}
                placeholder="173"
                onChange={(e) => setWeight(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sell-ink-name">Ink name on the disc</Label>
              <Input
                id="sell-ink-name"
                value={inkName}
                placeholder="Whose name is written on it?"
                onChange={(e) => setInkName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sell-ink-pdga">Ink PDGA number</Label>
              <Input
                id="sell-ink-pdga"
                inputMode="numeric"
                value={inkPdga}
                onChange={(e) => setInkPdga(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Ink details help us keep found discs out of the resale pile. If the disc still carries
            someone else's name, list it in Lost &amp; Found instead.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="sell-ink-notes">Ink and dye notes</Label>
            <Input
              id="sell-ink-notes"
              value={inkNotes}
              placeholder="Stamp scuff, custom dye, marker on the rim"
              onChange={(e) => setInkNotes(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sell-desc">Description</Label>
            <Textarea
              id="sell-desc"
              rows={4}
              value={description}
              placeholder="How it flies, why you're moving it, what you'd trade for."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </ContentCard>

        <div className="space-y-4">
          <ContentCard title="Price and pickup" subtitle="Local hand-offs only.">
            <div className="flex items-center gap-2">
              <Switch id="sell-trade" checked={tradeOnly} onCheckedChange={setTradeOnly} />
              <Label htmlFor="sell-trade">Trade only</Label>
            </div>
            {!tradeOnly ? (
              <div className="space-y-1.5">
                <Label htmlFor="sell-price">Asking price ($)</Label>
                <Input
                  id="sell-price"
                  inputMode="decimal"
                  value={price}
                  placeholder="18"
                  onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                <p className="text-sm text-muted-foreground">Leave it blank to invite offers.</p>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sell-city">City</Label>
                <Input id="sell-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sell-state">State</Label>
                <Input
                  id="sell-state"
                  value={state}
                  placeholder="IN or Indiana"
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
            </div>
          </ContentCard>

          <ContentCard title="Photos" subtitle="Show both sides and any ink.">
            <Label
              htmlFor="sell-photos"
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm"
            >
              <ImagePlus className="h-4 w-4" />
              {photos.length ? `${photos.length} photo(s) ready` : "Add photos"}
            </Label>
            <input
              id="sell-photos"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 6))}
            />
          </ContentCard>

          <Button className="w-full" disabled={!canSubmit} onClick={() => void submit()}>
            {saving ? "Posting…" : "Post listing"}
          </Button>
        </div>
      </div>
    </div>
  );
}
