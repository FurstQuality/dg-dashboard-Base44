import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScraperErrorHint } from "@/components/ingest/scraper-error-hint";
import { scrapeClubUrl, saveIngestedClub } from "@/lib/data-connectors.functions";

type Scraped = Awaited<ReturnType<typeof scrapeClubUrl>>;

/**
 * Paste a club page URL (Facebook, Instagram, UDisc, PDGA, club website) and
 * create the club record from what we can read off the page.
 */
export function ClubScrapePanel() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Scraped | null>(null);
  const [edited, setEdited] = useState<{ name?: string; description?: string | null }>({});
  const qc = useQueryClient();

  const scrape = useMutation({
    mutationFn: (u: string) => scrapeClubUrl({ data: { url: u } }),
    onSuccess: (data) => {
      setPreview(data);
      setEdited({ name: data.name, description: data.description });
      toast.success("Read the page — check the details below");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Nothing to save yet");
      return saveIngestedClub({
        data: {
          name: edited.name || preview.name,
          description: edited.description ?? preview.description ?? null,
          cover_image_url: preview.cover_image_url ?? null,
          latitude: preview.latitude ?? null,
          longitude: preview.longitude ?? null,
          facebook_url: preview.source === "facebook" ? preview.url : null,
          instagram_url: preview.source === "instagram" ? preview.url : null,
          website_url:
            preview.source === "facebook" || preview.source === "instagram" ? null : preview.url,
          external_source: preview.source,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(r.existed ? "Club already existed — linked it up" : "Club created");
      setPreview(null);
      setUrl("");
      setEdited({});
      qc.invalidateQueries({ queryKey: ["clubs"] });
      qc.invalidateQueries({ queryKey: ["club-mgr-clubs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Paste a Facebook, Instagram, UDisc, PDGA, or club website link and we will fill in the club
        details for you.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="https://www.facebook.com/YourLocalDGC"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button onClick={() => scrape.mutate(url)} disabled={!url || scrape.isPending}>
          {scrape.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Read page"}
        </Button>
      </div>

      {scrape.error && <ScraperErrorHint error={scrape.error} url={url} />}

      {preview && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{preview.source}</Badge>
            {preview.latitude != null && <Badge>Location found</Badge>}
          </div>
          {preview.cover_image_url && (
            <img
              src={preview.cover_image_url}
              alt={`${edited.name ?? preview.name} cover image`}
              className="max-h-48 rounded object-contain"
            />
          )}
          <div>
            <Label>Club name</Label>
            <Input
              value={edited.name ?? ""}
              onChange={(e) => setEdited((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={edited.description ?? ""}
              onChange={(e) => setEdited((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save club"}
          </Button>
        </div>
      )}
    </div>
  );
}
