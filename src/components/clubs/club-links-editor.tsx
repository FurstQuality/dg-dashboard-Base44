import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Facebook,
  Globe,
  Instagram,
  Link2,
  MessagesSquare,
  Music2,
  Youtube,
  Twitter,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateClubLinks } from "@/lib/clubs.functions";

export type ClubLinkKey =
  | "website_url"
  | "facebook_url"
  | "instagram_url"
  | "youtube_url"
  | "tiktok_url"
  | "x_url"
  | "discgolfscene_url"
  | "discord_url";

export type ClubLinks = Record<ClubLinkKey, string | null>;

type LinkField = {
  key: ClubLinkKey;
  label: string;
  placeholder: string;
  icon: typeof Globe;
};

export const CLUB_LINK_FIELDS: LinkField[] = [
  {
    key: "website_url",
    label: "Website",
    placeholder: "https://nwihighflyers.com",
    icon: Globe,
  },
  {
    key: "facebook_url",
    label: "Facebook",
    placeholder: "https://www.facebook.com/groups/867959597737903",
    icon: Facebook,
  },
  {
    key: "instagram_url",
    label: "Instagram",
    placeholder: "https://www.instagram.com/yourclub",
    icon: Instagram,
  },
  {
    key: "youtube_url",
    label: "YouTube",
    placeholder: "https://www.youtube.com/@yourclub",
    icon: Youtube,
  },
  {
    key: "tiktok_url",
    label: "TikTok",
    placeholder: "https://www.tiktok.com/@yourclub",
    icon: Music2,
  },
  { key: "x_url", label: "X", placeholder: "https://x.com/yourclub", icon: Twitter },
  {
    key: "discgolfscene_url",
    label: "Disc Golf Scene",
    placeholder: "https://www.discgolfscene.com/clubs/YourClub",
    icon: Trophy,
  },
  {
    key: "discord_url",
    label: "Discord invite",
    placeholder: "https://discord.gg/yourinvite",
    icon: MessagesSquare,
  },
];

function normalize(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

/** Public chip row for whichever links a club has filled in. */
export function ClubLinkChips({ links }: { links: ClubLinks }) {
  const shown = CLUB_LINK_FIELDS.filter((f) => !!links[f.key]);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((f) => {
        const Icon = f.icon;
        return (
          <a
            key={f.key}
            href={links[f.key] as string}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 hover:text-foreground"
          >
            <Icon className="h-3 w-3" /> {f.label}
          </a>
        );
      })}
    </>
  );
}

/** Officer-only editor for every club link. */
export function ClubLinksEditor({
  clubId,
  links,
  onSaved,
}: {
  clubId: string;
  links: ClubLinks;
  onSaved: () => void;
}) {
  const save = useServerFn(updateClubLinks);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<ClubLinkKey, string>>(() => toDraft(links));

  useEffect(() => {
    if (open) setDraft(toDraft(links));
  }, [open, links]);

  async function onSave() {
    const patch: Partial<Record<ClubLinkKey, string | null>> = {};
    for (const f of CLUB_LINK_FIELDS) {
      const v = normalize(draft[f.key] ?? "");
      if (v) {
        try {
          new URL(v);
        } catch {
          toast.error(`That ${f.label} link doesn't look like a valid URL.`);
          return;
        }
      }
      patch[f.key] = v || null;
    }
    setSaving(true);
    try {
      await save({ data: { clubId, ...patch } });
      toast.success("Club links updated");
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the club links");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 className="mr-1.5 h-4 w-4" /> Edit links
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Club links</DialogTitle>
          <DialogDescription>
            Add the pages your club already uses. Anything you fill in shows as a button on the club
            page; leave a field blank to remove it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {CLUB_LINK_FIELDS.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`club-link-${f.key}`} className="flex items-center gap-1.5 text-sm">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {f.label}
                </Label>
                <Input
                  id={`club-link-${f.key}`}
                  inputMode="url"
                  placeholder={f.placeholder}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save links"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toDraft(links: ClubLinks): Record<ClubLinkKey, string> {
  const out = {} as Record<ClubLinkKey, string>;
  for (const f of CLUB_LINK_FIELDS) out[f.key] = links[f.key] ?? "";
  return out;
}
