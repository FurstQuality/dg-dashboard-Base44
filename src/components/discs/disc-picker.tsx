import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ExternalLink, Info, Loader2, Search, ShieldCheck } from "lucide-react";
import { DiscDetailSheet } from "@/components/discs/disc-detail-sheet";
import {
  CATEGORY_LABEL,
  DISC_CATEGORIES,
  FEATURED_BRANDS,
  STABILITY_LABEL,
  flightLine,
  searchMolds,
  specLine,
  type DiscCategoryKey,
  type MoldRow,
} from "@/lib/disc-catalog";


type Brand = { id: string; name: string };

const SPEED_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: "Any speed" },
  { label: "Putt & approach (1-4)", min: 1, max: 4 },
  { label: "Midrange (4-6)", min: 4, max: 6 },
  { label: "Fairway (6-9)", min: 6, max: 9 },
  { label: "Distance (9-15)", min: 9, max: 15 },
];

/**
 * Browses the full disc library with live server-side filtering.
 * Used both to add discs to a bag and as a standalone reference view.
 */
export function DiscPicker({
  onSelect,
  selectedId,
  compact,
}: {
  onSelect?: (mold: MoldRow) => void;
  selectedId?: string | null;
  compact?: boolean;
}) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [query, setQuery] = useState("");
  const [brandId, setBrandId] = useState("");
  const [category, setCategory] = useState<DiscCategoryKey | "">("");
  const [stability, setStability] = useState("");
  const [band, setBand] = useState(0);
  const [flightOnly, setFlightOnly] = useState(false);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [rows, setRows] = useState<MoldRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<MoldRow | null>(null);


  const pageSize = compact ? 25 : 40;

  useEffect(() => {
    (supabase as any)
      .from("disc_manufacturers")
      .select("id,name")
      .order("name")
      .then(({ data }: { data: Brand[] | null }) => setBrands(data ?? []));
  }, []);

  useEffect(() => {
    setPage(0);
  }, [query, brandId, category, stability, band, flightOnly, approvedOnly]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchMolds({
        query,
        manufacturerId: brandId || undefined,
        category: category || undefined,
        stability: stability || undefined,
        speedMin: SPEED_BANDS[band].min,
        speedMax: SPEED_BANDS[band].max,
        flightOnly,
        approvedOnly,
        limit: pageSize,
        offset: page * pageSize,
      })
        .then((res) => {
          if (cancelled) return;
          setRows(res.rows);
          setTotal(res.total);
        })
        .catch(() => !cancelled && setRows([]))
        .finally(() => !cancelled && setLoading(false));
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, brandId, category, stability, band, flightOnly, approvedOnly, page, pageSize]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const selectClass = "rounded-md border border-border bg-background px-2 py-2 text-sm min-w-0";

  const summary = useMemo(
    () => `${total.toLocaleString()} disc${total === 1 ? "" : "s"} match`,
    [total],
  );

  const featuredBrands = useMemo(
    () =>
      FEATURED_BRANDS.map((name) => brands.find((b) => b.name === name)).filter(
        (b): b is Brand => Boolean(b),
      ),
    [brands],
  );


  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 2,700+ molds by name"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setBrandId("")}
          className={`rounded-full border px-2.5 py-1 text-[11px] ${
            brandId === ""
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          All brands
        </button>
        {featuredBrands.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBrandId(b.id)}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              brandId === b.id
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>



      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className={selectClass}
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as DiscCategoryKey | "")}
          className={selectClass}
        >
          <option value="">All types</option>
          {DISC_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <select
          value={stability}
          onChange={(e) => setStability(e.target.value)}
          className={selectClass}
        >
          <option value="">Any stability</option>
          {Object.entries(STABILITY_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={band}
          onChange={(e) => setBand(Number(e.target.value))}
          className={selectClass}
        >
          {SPEED_BANDS.map((b, i) => (
            <option key={b.label} value={i}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={flightOnly}
            onChange={(e) => setFlightOnly(e.target.checked)}
          />
          Flight numbers only
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={approvedOnly}
            onChange={(e) => setApprovedOnly(e.target.checked)}
          />
          PDGA approved only
        </label>
        <span className="ml-auto">{loading ? "Searching…" : summary}</span>
      </div>

      <div
        className={`space-y-2 overflow-y-auto pr-1 ${compact ? "max-h-[46vh]" : "max-h-[62vh]"}`}
      >
        {loading && !rows.length ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the disc library…
          </div>
        ) : null}
        {!loading && !rows.length ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No molds match those filters. Try clearing the brand or stability filter.
          </div>
        ) : null}
        {rows.map((m) => {
          const flight = flightLine(m);
          const specs = specLine(m);
          const isSelected = selectedId === m.id;
          return (
            <div
              key={m.id}
              className={`flex w-full items-start gap-3 rounded-lg border p-2.5 transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <button
                type="button"
                onClick={() => (onSelect ? onSelect(m) : setDetail(m))}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                {m.image_url ? (
                  <img
                    src={m.image_url}
                    alt={`${m.brand} ${m.name}`}
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border text-[10px] text-muted-foreground">
                    {m.name.slice(0, 3)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{m.name}</span>
                    {m.pdga_approved ? (
                      <ShieldCheck
                        className="h-3.5 w-3.5 shrink-0 text-emerald-500"
                        aria-label="PDGA approved"
                      />
                    ) : null}
                    {isSelected ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.brand} · {CATEGORY_LABEL[m.category] ?? "Specialty"}
                    {m.stability ? ` · ${STABILITY_LABEL[m.stability] ?? m.stability}` : ""}
                  </div>
                  {m.description ? (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {m.description}
                    </div>
                  ) : specs ? (
                    <div className="truncate text-[11px] text-muted-foreground">{specs}</div>
                  ) : null}
                </div>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                {flight ? (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {flight}
                  </Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Specs only</span>
                )}
                <button
                  type="button"
                  onClick={() => setDetail(m)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                >
                  <Info className="h-3 w-3" /> Details
                </button>
                {m.link_url ? (
                  <a
                    href={m.link_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                  >
                    Shop <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}

      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      <DiscDetailSheet
        mold={detail}
        onClose={() => setDetail(null)}
        onAdd={onSelect ? (m) => onSelect(m) : undefined}
      />
    </div>
  );
}

