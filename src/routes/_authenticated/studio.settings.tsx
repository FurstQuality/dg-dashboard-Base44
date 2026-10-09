import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getMyCreatorProfile,
  applyForCreator,
  updateCreatorProfile,
} from "@/lib/creator-studio.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Save, Send, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Creator profile · DG Dashboard" },
      {
        name: "description",
        content: "Manage your creator profile, links, and publishing defaults.",
      },
      { property: "og:title", content: "Creator profile · DG Dashboard" },
      {
        property: "og:description",
        content: "Manage your creator profile, links, and publishing defaults.",
      },
    ],
  }),
});

const PILLAR_SUGGESTIONS = [
  "Course reviews",
  "Coaching tips",
  "Round vlogs",
  "Ace reels",
  "Tournament coverage",
  "Disc reviews",
  "Local scene",
  "Interviews",
  "News",
];

function SettingsPage() {
  const qc = useQueryClient();
  const fetch = useServerFn(getMyCreatorProfile);
  const apply = useServerFn(applyForCreator);
  const update = useServerFn(updateCreatorProfile);
  const q = useQuery({ queryKey: ["creator-profile"], queryFn: () => fetch() });

  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [pitch, setPitch] = useState("");
  const [reach, setReach] = useState<string>("");
  const [pillars, setPillars] = useState<string[]>([]);
  const [pillarInput, setPillarInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>([]);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    const p = q.data?.profile;
    if (!p) return;
    setHeadline(p.headline ?? "");
    setBio(p.bio ?? "");
    setPitch(p.pitch ?? "");
    setReach(p.monthly_reach?.toString() ?? "");
    setPillars(p.content_pillars ?? []);
    setTags(p.niche_tags ?? []);
    setLinks((p.external_links as any) ?? []);
  }, [q.data]);

  const profile = q.data?.profile;
  const status = profile?.status;
  const tier = profile?.tier ?? "none";
  const isApplied = profile && profile.tier !== "none";

  function toPayload() {
    return {
      headline: headline || undefined,
      bio: bio || undefined,
      pitch: pitch || undefined,
      monthly_reach: reach ? parseInt(reach, 10) : undefined,
      niche_tags: tags,
      content_pillars: pillars,
      external_links: links,
    };
  }

  const applyMut = useMutation({
    mutationFn: () => apply({ data: toPayload() }),
    onSuccess: () => {
      toast.success("Application submitted — we'll review shortly");
      qc.invalidateQueries({ queryKey: ["creator-profile"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const saveMut = useMutation({
    mutationFn: () => update({ data: toPayload() }),
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["creator-profile"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function addPillar(v: string) {
    const t = v.trim();
    if (!t || pillars.includes(t)) return;
    setPillars([...pillars, t]);
    setPillarInput("");
  }
  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
  }
  function addLink() {
    if (!linkUrl.trim()) return;
    try {
      new URL(linkUrl);
    } catch {
      toast.error("Invalid URL");
      return;
    }
    setLinks([...links, { label: linkLabel.trim() || linkUrl, url: linkUrl.trim() }]);
    setLinkLabel("");
    setLinkUrl("");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Creator profile</CardTitle>
            <CardDescription>
              Tell us who you are, what you cover, and why disc golfers should follow you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Headline</Label>
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={120}
                placeholder="Coaching-first disc golf content from the Midwest"
              />
            </div>
            <div>
              <Label>Bio</Label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What you cover, your background, and what viewers get out of following you."
              />
            </div>
            <div>
              <Label>Application pitch (for our reviewers)</Label>
              <Textarea
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What you'll bring to DGD, cadence, and any results so far."
              />
            </div>

            <div>
              <Label>Content pillars</Label>
              <div className="flex gap-2">
                <Input
                  value={pillarInput}
                  onChange={(e) => setPillarInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), addPillar(pillarInput))
                  }
                  maxLength={60}
                />
                <Button type="button" variant="secondary" onClick={() => addPillar(pillarInput)}>
                  Add
                </Button>
              </div>
              {pillars.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {pillars.map((p) => (
                    <Badge key={p} variant="secondary" className="gap-1">
                      {p}
                      <button
                        type="button"
                        onClick={() => setPillars(pillars.filter((x) => x !== p))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {PILLAR_SUGGESTIONS.filter((s) => !pillars.includes(s)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addPillar(s)}
                    className="text-xs text-muted-foreground border rounded-full px-2 py-0.5 hover:bg-muted"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Niche tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  maxLength={40}
                  placeholder="e.g. midwest, coaching, MPO"
                />
                <Button type="button" variant="secondary" onClick={addTag}>
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((t) => (
                    <Badge key={t} variant="outline" className="gap-1">
                      #{t}
                      <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Monthly reach across all platforms (optional)</Label>
              <Input
                type="number"
                min={0}
                value={reach}
                onChange={(e) => setReach(e.target.value)}
                placeholder="e.g. 15000"
              />
            </div>

            <div>
              <Label>External links</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input
                  placeholder="Label"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                />
                <Input
                  placeholder="https://…"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
                <Button type="button" variant="secondary" onClick={addLink}>
                  Add link
                </Button>
              </div>
              {links.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {links.map((l, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between text-sm border rounded p-2"
                    >
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline truncate"
                      >
                        {l.label}
                      </a>
                      <button
                        type="button"
                        onClick={() => setLinks(links.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              {isApplied ? (
                <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  <Save className="h-4 w-4 mr-1" /> Save changes
                </Button>
              ) : (
                <Button
                  onClick={() => applyMut.mutate()}
                  disabled={applyMut.isPending || !bio || !pitch}
                >
                  <Send className="h-4 w-4 mr-1" /> Submit application
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" /> Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tier</span>
            <span className="font-medium">{tier}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium">{status ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Verified</span>
            <span className="font-medium">{profile?.is_verified ? "Yes" : "No"}</span>
          </div>
          <div className="pt-3 text-xs text-muted-foreground">
            Once approved, your posts show a Verified Creator badge and you unlock the Ambassador
            request flow.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
