import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  saveDraft,
  scheduleDraft,
  publishDraftNow,
  listSeries,
  listDrafts,
} from "@/lib/creator-studio.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  Send,
  Clock,
  X,
  Image as ImageIcon,
  Video,
  Trophy,
  Newspaper,
  MapPin,
  Zap,
  Lightbulb,
  BookOpen,
} from "lucide-react";

const KINDS = [
  { value: "photo", label: "Photo", icon: ImageIcon },
  { value: "video", label: "Video", icon: Video },
  { value: "reel", label: "Reel / short", icon: Video },
  { value: "ace", label: "Ace celebration", icon: Zap },
  { value: "recap", label: "Round recap", icon: Trophy },
  { value: "news", label: "News share", icon: Newspaper },
  { value: "course_spotlight", label: "Course spotlight", icon: MapPin },
  { value: "tip", label: "Coaching tip", icon: Lightbulb },
  { value: "story", label: "Story / long-form", icon: BookOpen },
] as const;

const SearchSchema = z.object({ draft: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/studio/composer")({
  validateSearch: (raw) => SearchSchema.parse(raw),
  component: ComposerPage,
  head: () => ({
    meta: [
      { title: "Composer · Creator Studio · DG Dashboard" },
      { name: "description", content: "Write, format, and schedule a new post for your audience." },
      { property: "og:title", content: "Composer · Creator Studio · DG Dashboard" },
      {
        property: "og:description",
        content: "Write, format, and schedule a new post for your audience.",
      },
    ],
  }),
});

function ComposerPage() {
  const search = useSearch({ from: Route.id });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchSeries = useServerFn(listSeries);
  const fetchDrafts = useServerFn(listDrafts);
  const save = useServerFn(saveDraft);
  const sched = useServerFn(scheduleDraft);
  const publish = useServerFn(publishDraftNow);

  const [id, setId] = useState<string | undefined>(search.draft);
  const [kind, setKind] = useState<string>("photo");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [media, setMedia] = useState<Array<{ url: string; kind: string }>>([]);
  const NO_SERIES = "none";
  const [seriesId, setSeriesId] = useState<string>(NO_SERIES);
  const [scheduleTime, setScheduleTime] = useState<string>("");

  const seriesQ = useQuery({ queryKey: ["series"], queryFn: () => fetchSeries() });
  const draftsQ = useQuery({
    queryKey: ["drafts", "edit"],
    queryFn: () => fetchDrafts({ data: { status: "all" } }),
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) return;
    const d = draftsQ.data?.rows.find((r) => r.id === id);
    if (!d) return;
    setKind(d.kind);
    setTitle(d.title ?? "");
    setBody(d.body ?? "");
    setTags(d.tags ?? []);
    setMedia((d.media as any) ?? []);
    setSeriesId(d.series_id ?? "");
    if (d.scheduled_at) setScheduleTime(new Date(d.scheduled_at).toISOString().slice(0, 16));
  }, [id, draftsQ.data]);

  function addTag() {
    const t = tagInput.trim().replace(/^#/, "");
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }
  function addMedia() {
    const u = mediaUrl.trim();
    if (!u) return;
    try {
      new URL(u);
    } catch {
      toast.error("Enter a valid URL");
      return;
    }
    const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(u) || /youtube|youtu\.be|vimeo/i.test(u);
    setMedia([...media, { url: u, kind: isVideo ? "video" : "image" }]);
    setMediaUrl("");
  }

  function buildDraft() {
    return {
      id,
      kind: kind as any,
      title: title || undefined,
      body: body || undefined,
      tags,
      media,
      series_id: seriesId === NO_SERIES ? null : seriesId,
      scheduled_at: scheduleTime ? new Date(scheduleTime).toISOString() : null,
    };
  }

  const saveMut = useMutation({
    mutationFn: () => save({ data: buildDraft() }),
    onSuccess: (res) => {
      setId(res.id);
      toast.success("Draft saved");
      qc.invalidateQueries({ queryKey: ["drafts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const scheduleMut = useMutation({
    mutationFn: async () => {
      if (!scheduleTime) throw new Error("Pick a schedule time first");
      const res = await save({ data: buildDraft() });
      const draftId = res.id;
      await sched({ data: { id: draftId, scheduled_at: new Date(scheduleTime).toISOString() } });
      setId(draftId);
    },
    onSuccess: () => {
      toast.success("Scheduled");
      qc.invalidateQueries({ queryKey: ["drafts"] });
      navigate({ to: "/studio/calendar" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Schedule failed"),
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      const res = await save({ data: buildDraft() });
      return publish({ data: { id: res.id } });
    },
    onSuccess: (res) => {
      toast.success("Published to feed");
      qc.invalidateQueries({ queryKey: ["drafts"] });
      qc.invalidateQueries({ queryKey: ["creator-analytics", 30] });
      navigate({ to: "/p/$postId", params: { postId: res.post_id as string } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Publish failed"),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Compose</CardTitle>
            <CardDescription>
              Write it once. Save it, schedule it, or ship it right now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Post type</Label>
              <div className="mt-1 grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={
                      "border rounded-lg py-2 px-1 text-xs flex flex-col items-center gap-1 transition " +
                      (kind === k.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:bg-muted")
                    }
                  >
                    <k.icon className="h-4 w-4" />
                    {k.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Title / headline (optional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="A hook that gets the click"
              />
            </div>

            <div>
              <Label>Body</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={4000}
                placeholder="Tell the story. Share the tip. Break down the tournament."
                rows={8}
              />
              <div className="text-xs text-muted-foreground mt-1">{body.length}/4000</div>
            </div>

            <div>
              <Label>Media (paste image or video URL)</Label>
              <div className="flex gap-2">
                <Input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://…"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMedia())}
                />
                <Button type="button" variant="secondary" onClick={addMedia}>
                  Add
                </Button>
              </div>
              {media.length > 0 && (
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                  {media.map((m, i) => (
                    <div key={i} className="relative border rounded overflow-hidden">
                      {m.kind === "video" ? (
                        <div className="aspect-video bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          <Video className="h-6 w-6" />
                        </div>
                      ) : (
                        <img src={m.url} className="aspect-video object-cover w-full" />
                      )}
                      <button
                        type="button"
                        className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5"
                        onClick={() => setMedia(media.filter((_, j) => j !== i))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag and hit enter"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="secondary" onClick={addTag}>
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      #{t}
                      <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Publish</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Series (optional)</Label>
              <Select value={seriesId} onValueChange={setSeriesId}>
                <SelectTrigger>
                  <SelectValue placeholder="No series" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SERIES}>No series</SelectItem>
                  {(seriesQ.data?.rows ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Schedule for later</Label>
              <Input
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 pt-2">
              <Button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                variant="secondary"
              >
                <Save className="h-4 w-4 mr-1" /> Save draft
              </Button>
              <Button
                onClick={() => scheduleMut.mutate()}
                disabled={!scheduleTime || scheduleMut.isPending}
                variant="outline"
              >
                <Clock className="h-4 w-4 mr-1" /> Schedule
              </Button>
              <Button onClick={() => publishMut.mutate()} disabled={publishMut.isPending}>
                <Send className="h-4 w-4 mr-1" /> Publish now
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Content checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-xs space-y-1.5 text-muted-foreground">
              <li className={title ? "text-foreground" : ""}>✓ Strong hook / title</li>
              <li className={body.length > 80 ? "text-foreground" : ""}>
                ✓ At least a paragraph of context
              </li>
              <li className={media.length > 0 ? "text-foreground" : ""}>✓ One piece of media</li>
              <li className={tags.length >= 2 ? "text-foreground" : ""}>✓ 2+ tags for discovery</li>
              <li className={seriesId !== NO_SERIES ? "text-foreground" : ""}>✓ Grouped into a series</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
