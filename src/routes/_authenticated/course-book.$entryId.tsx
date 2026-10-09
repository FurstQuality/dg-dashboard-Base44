import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/shell/page-shell";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import {
  BookMarked,
  Camera,
  ClipboardList,
  Video,
  Loader2,
  MapPin,
  Pin,
  PinOff,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import {
  getCourseBookEntry,
  updateCourseBookEntry,
  addCourseBookMedia,
  deleteCourseBookMedia,
} from "@/lib/course-book.functions";

export const Route = createFileRoute("/_authenticated/course-book/$entryId")({
  head: () => ({
    meta: [
      { title: "Course entry · Course Book · DG Dashboard" },
      { name: "description", content: "Photos, saved scorecards, and notes for this course." },
      { property: "og:title", content: "Course entry · Course Book · DG Dashboard" },
      { property: "og:description", content: "Your scrapbook page for a disc golf course." },
    ],
  }),
  component: EntryPage,
});

const SOURCE_LABEL: Record<string, string> = {
  chainlink: "DG Dashboard",
  udisc: "UDisc",
  pdga: "PDGA",
  manual: "Manual",
};

function EntryPage() {
  const { entryId } = Route.useParams();
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();

  const getEntry = useServerFn(getCourseBookEntry);
  const updateFn = useServerFn(updateCourseBookEntry);
  const addMediaFn = useServerFn(addCourseBookMedia);
  const delMediaFn = useServerFn(deleteCourseBookMedia);

  const { data, isLoading } = useQuery({
    queryKey: ["course-book", "entry", entryId],
    queryFn: () => getEntry({ data: { entryId } }),
  });

  const [notes, setNotes] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const initialisedRef = useRef(false);

  if (data?.entry && !initialisedRef.current) {
    initialisedRef.current = true;
    setNotes(data.entry.notes ?? "");
    setDisplayName(data.entry.display_name);
    setLocation(data.entry.location ?? "");
  }

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          entryId,
          notes,
          display_name: displayName || undefined,
          location: location || null,
        },
      }),
    onSuccess: () => {
      toast.success("Course book entry saved.");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["course-book"] });
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error ? e.message : "We couldn't save that entry — give it another shot.",
      ),
  });

  const pinMut = useMutation({
    mutationFn: (pinned: boolean) => updateFn({ data: { entryId, pinned } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["course-book"] }),
  });

  async function uploadFile(file: File, kind: "photo" | "scorecard" | "video") {
    if (!userId) return;
    const clean = file.name.replace(/[^a-z0-9_.-]/gi, "_");
    const path = `${userId}/${entryId}/${Date.now()}-${clean}`;
    const { error } = await supabase.storage.from("course-book").upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    await addMediaFn({
      data: { entryId, kind, storage_path: path, caption: null, taken_on: null },
    });
  }

  const uploadMut = useMutation({
    mutationFn: async ({
      files,
      kind,
    }: {
      files: FileList;
      kind: "photo" | "scorecard" | "video";
    }) => {
      for (const f of Array.from(files)) await uploadFile(f, kind);
    },
    onSuccess: () => {
      toast.success("Added to your book");
      qc.invalidateQueries({ queryKey: ["course-book", "entry", entryId] });
      qc.invalidateQueries({ queryKey: ["course-book", "played"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => delMediaFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["course-book", "entry", entryId] });
      qc.invalidateQueries({ queryKey: ["course-book", "played"] });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const photos = data.media.filter((m) => m.kind === "photo");
  const scorecards = data.media.filter((m) => m.kind === "scorecard");
  const videos = data.media.filter((m) => m.kind === "video");

  return (
    <PageShell>
      <div className="flex items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => pinMut.mutate(!data.entry.pinned)}
            disabled={pinMut.isPending}
          >
            {data.entry.pinned ? (
              <PinOff className="h-4 w-4 mr-1" />
            ) : (
              <Pin className="h-4 w-4 mr-1" />
            )}
            {data.entry.pinned ? "Unpin" : "Pin"}
          </Button>
          {data.entry.course_id && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/courses/$courseId" params={{ courseId: data.entry.course_id }}>
                Open course
              </Link>
            </Button>
          )}
        </div>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <BookMarked className="h-4 w-4" /> Course Book entry
        </div>
        <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
          <Input
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setDirty(true);
            }}
            placeholder="Course name"
            className="text-lg font-semibold"
          />
          <div className="relative">
            <MapPin className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setDirty(true);
              }}
              placeholder="City, State"
              className="pl-8"
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
        <div className="space-y-5">
          {/* Photos */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <Camera className="h-4 w-4" /> Photos
                  <Badge variant="secondary">{photos.length}</Badge>
                </div>
                <UploadButton
                  onFiles={(files) => uploadMut.mutate({ files, kind: "photo" })}
                  label="Add photo"
                />
              </div>
              {photos.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Snap the tee sign, a hero throw, or the crew after the round.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {photos.map((m) => (
                    <MediaTile key={m.id} url={m.url} onDelete={() => deleteMut.mutate(m.id)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Videos */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <Video className="h-4 w-4" /> Videos
                  <Badge variant="secondary">{videos.length}</Badge>
                </div>
                <UploadButton
                  onFiles={(files) => uploadMut.mutate({ files, kind: "video" })}
                  label="Add video"
                  accept="video/*"
                />
              </div>
              {videos.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Save an ace run, a putting rep, or a walkthrough of a blind hole.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {videos.map((m) => (
                    <VideoTile key={m.id} url={m.url} onDelete={() => deleteMut.mutate(m.id)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scorecards */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <ClipboardList className="h-4 w-4" /> Saved scorecards
                  <Badge variant="secondary">{scorecards.length}</Badge>
                </div>
                <UploadButton
                  onFiles={(files) => uploadMut.mutate({ files, kind: "scorecard" })}
                  label="Add scorecard"
                />
              </div>
              {scorecards.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Upload a UDisc screenshot, a printed card, or a PDGA sheet.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {scorecards.map((m) => (
                    <MediaTile key={m.id} url={m.url} onDelete={() => deleteMut.mutate(m.id)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Notes</div>
                <Button
                  size="sm"
                  onClick={() => saveMut.mutate()}
                  disabled={!dirty || saveMut.isPending}
                >
                  <Save className="h-4 w-4 mr-1" /> Save
                </Button>
              </div>
              <Textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setDirty(true);
                }}
                rows={6}
                placeholder="OB reminders, favorite pin positions, disc picks, food after the round…"
              />
            </CardContent>
          </Card>
        </div>

        {/* Round history */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="font-medium">Rounds on this course</div>
            {data.rounds.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No rounds logged at this course yet — score one to start building your book.
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {data.rounds.map((r) => (
                  <div
                    key={`${r.source}-${r.id}`}
                    className="flex items-start justify-between gap-2 rounded-md border border-border/60 p-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{r.played_on}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.event ?? r.layout ?? "Casual round"}
                      </div>
                      <div className="mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {SOURCE_LABEL[r.source] ?? r.source}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      {r.to_par != null && (
                        <div className="font-semibold">
                          {r.to_par > 0 ? `+${r.to_par}` : r.to_par === 0 ? "E" : r.to_par}
                        </div>
                      )}
                      {r.rating != null && <div className="text-muted-foreground">{r.rating}</div>}
                      {r.score != null && r.to_par == null && (
                        <div className="text-muted-foreground">{r.score}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function UploadButton({
  onFiles,
  label,
  accept = "image/*",
}: {
  onFiles: (files: FileList) => void;
  label: string;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="outline" onClick={() => ref.current?.click()}>
        <Upload className="h-4 w-4 mr-1" /> {label}
      </Button>
    </>
  );
}

function MediaTile({ url, onDelete }: { url: string; onDelete: () => void }) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border border-border/60 bg-muted">
      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      <button
        onClick={onDelete}
        className="absolute top-1 right-1 rounded-full bg-background/90 p-1 opacity-0 group-hover:opacity-100 transition"
        title="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function VideoTile({ url, onDelete }: { url: string; onDelete: () => void }) {
  return (
    <div className="group relative overflow-hidden rounded-md border border-border/60 bg-muted">
      <video src={url} controls preload="metadata" className="h-full w-full" />
      <button
        onClick={onDelete}
        className="absolute top-1 right-1 rounded-full bg-background/90 p-1 opacity-0 transition group-hover:opacity-100"
        title="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
