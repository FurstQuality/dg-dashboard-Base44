import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Map as MapIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageHeader } from "@/components/shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const PAGE = 50;

export const Route = createFileRoute("/_authenticated/courses/needs-mapping")({
  head: () => ({
    meta: [
      { title: "Courses that need mapping · DG Dashboard" },
      { name: "description", content: "Every course across the country still missing tees or baskets on the map — pick one and help finish it." },
      { property: "og:title", content: "Courses that need mapping · DG Dashboard" },
      { property: "og:description", content: "Help finish mapping disc golf courses near you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NeedsMappingPage,
});

function NeedsMappingPage() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(0);
  const q = useDebouncedValue(search.trim(), 300);
  const st = useDebouncedValue(state.trim().toUpperCase(), 300);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["courses-needing-mapping", q, st, page],
    placeholderData: keepPreviousData,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("courses_needing_mapping", {
        _state: st || undefined,
        _search: q || undefined,
        _limit: PAGE,
        _offset: page * PAGE,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const total = Number(data?.[0]?.total_count ?? 0);

  return (
    <PageShell section="courses">
      <PageHeader
        title="Courses that need mapping"
        description="Courses still missing tees or baskets on the map. Nearly-finished ones come first."
      />
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search course or city" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <Input className="w-24" placeholder="State" maxLength={2} value={state}
          onChange={(e) => { setState(e.target.value); setPage(0); }} aria-label="State" />
      </div>
      {isError ? (
        <p className="text-sm text-muted-foreground">We couldn't load the list just now — try again in a moment.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Finding courses…</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">Every course matching that search is fully mapped. Nice work.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} courses to go</p>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {data.map((c) => {
              const pct = c.hole_count ? Math.round((c.mapped_holes / c.hole_count) * 100) : 0;
              return (
                <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3">
                  <div className="min-w-0">
                    <Link to="/courses/$courseId" params={{ courseId: c.id }} className="block truncate font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-sm text-muted-foreground">
                      {[c.city, c.state].filter(Boolean).join(", ") || "Location unknown"}
                      {" · "}
                      {c.hole_count ? `${c.mapped_holes} of ${c.hole_count} holes mapped` : "Hole count unknown"}
                    </div>
                    {c.hole_count ? (
                      <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}
                  </div>
                  <Button asChild size="sm" variant={c.mapped_holes ? "default" : "outline"}>
                    <Link to="/courses/$courseId/edit" params={{ courseId: c.id }}>
                      <MapIcon className="h-4 w-4" /> {c.mapped_holes ? "Finish mapping" : "Help map"}
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE))}</span>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </>
      )}
    </PageShell>
  );
}
