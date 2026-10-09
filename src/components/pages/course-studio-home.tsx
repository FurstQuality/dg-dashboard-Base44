import { CourseSponsorsSection } from "@/components/courses/course-sponsors-section";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Flag, Layers, Map as MapIcon, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type StepKey = "map" | "par" | "layout" | "signs";
type Step = { key: StepKey; label: string; done: boolean; detail: string };

/** Course Studio home: where the course stands, and the one thing to do next. */
export default function CourseStudioHome({ courseId }: { courseId: string }) {
  const q = useQuery({
    queryKey: ["course-studio-home", courseId],
    queryFn: async () => {
      const [course, cov, layouts] = await Promise.all([
        supabase.from("courses").select("id, name, city, state").eq("id", courseId).maybeSingle(),
        supabase.rpc("course_map_coverage_rows", { _course_ids: [courseId] }),
        supabase.from("course_layouts").select("id, name, is_default, status").eq("course_id", courseId),
      ]);
      const ls = (layouts.data ?? []) as { id: string; name: string; is_default: boolean; status: string }[];
      const main = ls.find((l) => l.is_default) ?? ls[0] ?? null;
      let holes: { par: number | null; par_confirmed: boolean }[] = [];
      let published = false;
      if (main) {
        const [h, v] = await Promise.all([
          supabase.from("holes").select("par, par_confirmed").eq("layout_id", main.id),
          supabase.from("layout_versions").select("layout_id", { count: "exact", head: true }).eq("layout_id", main.id),
        ]);
        holes = (h.data ?? []) as typeof holes;
        published = (v.count ?? 0) > 0;
      }
      const c = ((cov.data ?? []) as { expected_holes: number | null; mapped_holes: number; map_state: string }[])[0];
      return { course: course.data, layouts: ls, main, holes, published, cov: c ?? null };
    },
  });

  if (q.isLoading) return <Skeleton className="h-72 w-full rounded-2xl" />;
  const d = q.data;
  if (!d?.course) return <p className="text-sm text-muted-foreground">We couldn't find this course.</p>;

  const total = d.cov?.expected_holes || d.holes.length || 0;
  const mapped = Math.min(d.cov?.mapped_holes ?? 0, total || Infinity);
  const parOk = d.holes.filter((h) => h.par != null && h.par_confirmed).length;
  const mapDone = total > 0 && mapped >= total;
  const parDone = d.holes.length > 0 && parOk === d.holes.length;
  const steps: Step[] = [
    { key: "map", label: "Map tees and baskets", done: mapDone, detail: total ? `${mapped} of ${total} holes placed` : "No holes on the map yet" },
    { key: "par", label: "Confirm par", done: parDone, detail: d.holes.length ? `${parOk} of ${d.holes.length} confirmed` : "Add holes first" },
    { key: "layout", label: "Publish the layout", done: d.published, detail: d.main ? (d.published ? `${d.main.name} is live` : `${d.main.name} is a draft`) : "No layout yet" },
    { key: "signs", label: "Print tee signs", done: false, detail: mapDone && parDone ? "Ready to print" : "Needs map and par first" },
  ];
  const next = steps.find((s) => !s.done) ?? steps[3];
  const doneCount = steps.filter((s) => s.done).length;

  const action = (s: Step, primary: boolean) => {
    const v = primary ? "default" : "outline";
    if (s.key === "signs")
      return (
        <Button asChild variant={v}><Link to="/courses/$courseId/tee-signs" params={{ courseId }}><Printer className="mr-1 h-4 w-4" />Open tee signs</Link></Button>
      );
    if (s.key === "layout" && d.layouts.length > 1)
      return (
        <Button asChild variant={v}><Link to="/courses/$courseId/layouts" params={{ courseId }}><Layers className="mr-1 h-4 w-4" />Open layouts</Link></Button>
      );
    return (
      <Button asChild variant={v}>
        <Link to="/courses/$courseId/edit" params={{ courseId }} search={d.main ? { layout: d.main.id } : {}}>
          {s.key === "map" ? <MapIcon className="mr-1 h-4 w-4" /> : <Flag className="mr-1 h-4 w-4" />}
          {s.key === "map" ? "Open map editor" : s.key === "par" ? "Confirm pars" : "Review and publish"}
        </Link>
      </Button>
    );
  };

  return (
    <div className="mx-auto max-w-[1320px] space-y-6 px-5 py-6 md:px-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{d.course.name}</h1>
          <p className="text-sm text-muted-foreground">Course Studio · {doneCount} of 4 steps done. Finish them in order to get the course ready to play and print.</p>
        </div>
        <Button asChild variant="outline"><Link to="/courses/$courseId" params={{ courseId }}>View course page</Link></Button>
      </header>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Course progress">
        {steps.map((s, i) => (
          <li key={s.key} className={`rounded-xl border p-3 ${s === next ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${s.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {s.label}
            </div>
            <div className="mt-1 pl-8 text-[13px] text-muted-foreground">{s.detail}</div>
          </li>
        ))}
      </ol>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/40 bg-card p-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">Next step</div>
          <div className="mt-1 text-lg font-semibold">{next.label}</div>
          <div className="text-sm text-muted-foreground">{next.detail}</div>
        </div>
        <div className="flex items-center gap-2">{action(next, true)}<ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" /></div>
      </section>

      <section className="flex flex-wrap gap-2">
        {steps.filter((s) => s !== next).map((s) => <span key={s.key}>{action(s, false)}</span>)}
      </section>

      <CourseSponsorsSection courseId={courseId} />
    </div>
  );
}
