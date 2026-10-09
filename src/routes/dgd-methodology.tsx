import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dgd-methodology")({
  head: () => ({
    meta: [
      { title: "How DGD works | DG Dashboard" },
      { name: "description", content: "How DG Dashboard estimates your current disc golf ability, form, and confidence." },
      { property: "og:title", content: "How DGD works | DG Dashboard" },
      { property: "og:description", content: "How DG Dashboard estimates your current disc golf ability, form, and confidence." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://dgdashboard.app/og-dgd-methodology.jpg" },
      { name: "twitter:image", content: "https://dgdashboard.app/og-dgd-methodology.jpg" },
    ],
  }),
  component: Methodology,
});

const POINTS: { title: string; body: string }[] = [
  { title: "It estimates your current ability", body: "DGD looks at your rounds and estimates how well you're playing right now — not your best day, not your career average." },
  { title: "Repeated evidence moves it", body: "One great or rough round nudges the estimate. A pattern across several rounds moves it more. A single surprise won't redefine an established player." },
  { title: "Older rounds matter less", body: "As time passes, older performances gradually carry less weight, so the estimate keeps up with how you play today." },
  { title: "Layout difficulty matters", body: "Shooting 60 on a tough championship layout means more than 60 on a short local course. DGD learns how hard each layout plays." },
  { title: "Uncertain rounds count less", body: "When DGD knows little about a layout or the round details are unclear, that round has less influence." },
  { title: "Form is separate from your DGD Rating", body: "Form tracks your recent rounds against your DGD Rating, so you can see a hot or cold stretch without it rewriting your rating." },
  { title: "Confidence measures certainty", body: "Confidence shows how sure DGD is about your current ability. It is not your skill level — a newer player can be very good with low confidence." },
  { title: "Before vs after the round", body: "Your Expected Score uses only what was known before you teed off. After a competition, DGD can also look at how hard the course actually played that day — that's context, never a forecast." },
];

function Methodology() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <h1 className="text-2xl font-bold">How DGD works</h1>
      <p className="mt-2 text-muted-foreground">
        DGD is DG Dashboard's performance estimate. It sits alongside your Official PDGA Rating and your UDisc record — it never replaces or changes them.
      </p>
      <ol className="mt-6 space-y-4">
        {POINTS.map((p, i) => (
          <li key={p.title} className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">{i + 1}. {p.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">
        The DGD display scale is still being calibrated, so numbers shown in previews may change. <Link to="/stats" className="text-primary hover:underline">Back to Statboard</Link>
      </p>
    </main>
  );
}
