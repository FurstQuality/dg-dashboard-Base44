import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Backpack, Check, Lock, Minus, Plus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlayerBag, type PublicBagDisc } from "@/lib/player-bag.functions";

const CATEGORY_ORDER = [
  "distance_driver",
  "fairway_driver",
  "midrange",
  "approach",
  "putter",
  "specialty",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  distance_driver: "Distance drivers",
  fairway_driver: "Fairway drivers",
  midrange: "Midranges",
  approach: "Approach",
  putter: "Putters",
  specialty: "Specialty",
  other: "Other discs",
};

function discName(d: PublicBagDisc) {
  return [d.manufacturer, d.mold_name ?? d.nickname ?? "Disc"].filter(Boolean).join(" ");
}

function moldKey(d: PublicBagDisc) {
  return (d.mold_name ?? d.nickname ?? d.id).trim().toLowerCase();
}

function flight(d: PublicBagDisc) {
  const nums = [d.speed, d.glide, d.turn, d.fade];
  if (nums.every((n) => n == null)) return null;
  return nums.map((n) => (n == null ? "–" : n)).join(" / ");
}

function groupByCategory(discs: PublicBagDisc[]) {
  const groups = new Map<string, PublicBagDisc[]>();
  for (const d of discs) {
    const key = d.category && CATEGORY_LABEL[d.category] ? d.category : "other";
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }
  const order = [...CATEGORY_ORDER, "other"];
  return order.filter((k) => groups.has(k)).map((k) => ({ key: k, discs: groups.get(k)! }));
}

function DiscRow({ disc, tag }: { disc: PublicBagDisc; tag?: React.ReactNode }) {
  const f = flight(disc);
  const details = [
    disc.plastic_name,
    disc.weight_g ? `${disc.weight_g}g` : null,
    disc.condition === "new" ? null : disc.condition.replace("_", " "),
    disc.purpose,
  ].filter(Boolean);
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{discName(disc)}</span>
          {disc.is_favorite && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Go-to
            </Badge>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {[f ? `${f}` : null, ...details].filter(Boolean).join(" · ") || "No flight numbers yet"}
        </div>
      </div>
      {tag}
    </div>
  );
}

export function PlayerBagCard({ username }: { username: string }) {
  const fetchBag = useServerFn(getPlayerBag);
  const [compare, setCompare] = useState(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ["player-bag", username],
    queryFn: () => fetchBag({ data: { username } }),
    staleTime: 60_000,
  });

  const compareRows = useMemo(() => {
    if (!data) return null;
    const mine = new Map(data.myDiscs.map((d) => [moldKey(d), d]));
    const theirs = new Map(data.discs.map((d) => [moldKey(d), d]));
    const shared = data.discs.filter((d) => mine.has(moldKey(d)));
    const onlyTheirs = data.discs.filter((d) => !mine.has(moldKey(d)));
    const onlyMine = data.myDiscs.filter((d) => !theirs.has(moldKey(d)));
    return { shared, onlyTheirs, onlyMine };
  }, [data]);

  if (isPending) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          We couldn&apos;t load this bag right now. Try again in a moment.
        </CardContent>
      </Card>
    );
  }

  const firstName = data.displayName.split(" ")[0] || data.displayName;
  const title = data.isSelf ? "My Bag" : `${firstName}'s bag`;

  if (data.hidden) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 pt-5 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          {firstName} keeps their bag private.
        </CardContent>
      </Card>
    );
  }

  const groups = groupByCategory(data.discs);

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Backpack className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{title}</h3>
            <Badge variant="outline">{data.discs.length} discs</Badge>
          </div>
          <div className="flex items-center gap-2">
            {!data.isSelf && data.myDiscs.length > 0 && data.discs.length > 0 && (
              <Button
                size="sm"
                variant={compare ? "default" : "outline"}
                onClick={() => setCompare((v) => !v)}
              >
                {compare ? "Show full bag" : "Compare with my bag"}
              </Button>
            )}
            {data.isSelf && (
              <Link to="/me/bag" className="text-sm text-primary hover:underline">
                Manage my bag
              </Link>
            )}
          </div>
        </div>

        {data.discs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {data.isSelf ? (
              <>
                Your bag is empty.{" "}
                <Link to="/me/bag" className="text-primary hover:underline">
                  Add your discs
                </Link>{" "}
                so others can compare bags with you.
              </>
            ) : (
              `${firstName} hasn't added discs to their bag yet.`
            )}
          </p>
        ) : compare && compareRows ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border p-2">
                <div className="text-lg font-semibold">{compareRows.shared.length}</div>
                <div className="text-muted-foreground">Both bags</div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-lg font-semibold">{compareRows.onlyTheirs.length}</div>
                <div className="text-muted-foreground">Only {firstName}</div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-lg font-semibold">{compareRows.onlyMine.length}</div>
                <div className="text-muted-foreground">Only you</div>
              </div>
            </div>

            <CompareGroup
              label="In both bags"
              icon={<Check className="h-3.5 w-3.5 text-primary" />}
              discs={compareRows.shared}
              empty="No overlap yet — you two throw completely different molds."
            />
            <CompareGroup
              label={`${firstName} carries these, you don't`}
              icon={<Plus className="h-3.5 w-3.5 text-primary" />}
              discs={compareRows.onlyTheirs}
              empty="You already carry everything in this bag."
            />
            <CompareGroup
              label="In your bag only"
              icon={<Minus className="h-3.5 w-3.5 text-muted-foreground" />}
              discs={compareRows.onlyMine}
              empty="Nothing extra in your bag."
            />
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABEL[g.key]} ({g.discs.length})
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {g.discs.map((d) => (
                    <DiscRow key={d.id} disc={d} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompareGroup({
  label,
  icon,
  discs,
  empty,
}: {
  label: string;
  icon: React.ReactNode;
  discs: PublicBagDisc[];
  empty: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label} ({discs.length})
      </div>
      {discs.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {discs.map((d) => (
            <DiscRow key={d.id} disc={d} />
          ))}
        </div>
      )}
    </div>
  );
}
