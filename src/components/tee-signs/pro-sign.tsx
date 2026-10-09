import { forwardRef, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { satelliteStillUrl } from "@/lib/course-imagery";
import type { DbFeature } from "@/lib/course-features";
import { type SignDesign, signFont } from "@/lib/tee-sign-design";
import { type SignFeature, type XY, SIGN_PANEL_COLOURS, dist, isLightColour, pathD, projectHole, signRuleLines } from "@/lib/tee-sign-pro";
import type { CourseRoutePair } from "@/lib/course-builder/course-route";

/* Printed artwork palette: these colours are part of the sign file, not the app theme. */
const INK = {
  light: "#ffffff", dark: "#14201a", lime: "#b5d334", ob: "#ffffff", water: "#3f7fb0", waterEdge: "#9cc8e6",
  grass: "#5d8c3a", grassDark: "#4a7a2e", fairway: "#9cc56a", canopy: "#2f6a25", canopyDark: "#1f4d1a", canopyLight: "#5e9a3c",
  gold: "#f2c419", muted: "#e9ece6", line: "#e8622c",
};
const TEE_COLOURS = ["#d32f2f", "#1e5fc2", "#f5f5f5", "#e0a400", "#2e7d32", "#6a3fb5"];

export const SIGN_W = 600;
export const SIGN_H = 800;

type LL = [number, number];
export type SignPad = { id?:string;name: string; color?: string | null; at: LL };

export type ProSignHole = {
  number: number;
  label?: string | null;
  par: number | null;
  distanceFt: number | null;
  tee: LL | null;
  basket: LL | null;
  flightPath?: LL[] | null;
  routeCurve?: LL[] | null;
  pairDistances?:Record<string,CourseRoutePair>;
  /** Every tee pad of this hole (the sign's own tee first). */
  tees?: SignPad[];
  /** Every basket position of this hole. */
  baskets?: SignPad[];
  /** Name of the basket position confirmed as in play; null = not confirmed (never guessed). */
  currentPin?: string | null;
  elevationFt?: number | null;
};

type Props = {
  courseName: string;
  hole: ProSignHole;
  features: DbFeature[];
  /** Ground detail around the hole (OpenStreetMap); course-map items draw on top. */
  terrain?: SignFeature[];
  design: SignDesign;
  urls: Record<string, string>;
  qrUrl: string;
  /** Draw free text/logo boxes inside the SVG (export + print). The editor draws them as draggable boxes instead. */
  includeElements?: boolean;
};

function mix(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (v: number) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
const hexOr = (c: string | null | undefined, fb: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : namedColour(c) ?? fb);
function namedColour(c?: string | null): string | null {
  const k = (c ?? "").toLowerCase();
  const m: Record<string, string> = { red: "#d32f2f", blue: "#1e5fc2", white: "#f5f5f5", gold: "#e0a400", yellow: "#e0c200", green: "#2e7d32", black: "#222222", purple: "#6a3fb5", orange: "#ef7d1a" };
  return m[k] ?? null;
}
const shortName = (n: string) => n.replace(/\s*(tee|pad|basket|pin|position)\s*/gi, " ").trim().toUpperCase() || n.toUpperCase();
const ftOf = (a: LL, b: LL) => Math.round(dist(a, b) / 0.3048);

/** Deterministic jitter so tree canopies look natural but print the same every time. */
const jit = (i: number, k: number) => (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;

export const ProSign = forwardRef<SVGSVGElement, Props>(function ProSign(
  { courseName, hole, features, terrain, design, urls, qrUrl, includeElements = false },
  ref,
) {
  const panel = design.panelColour ?? SIGN_PANEL_COLOURS[0];
  const light = isLightColour(panel);
  const ink = light ? INK.dark : INK.light;
  const card = light ? mix(panel, -0.08) : mix(panel, 0.1);
  const accent = design.accent ?? INK.lime;
  const units = design.units ?? "both";
  const sponsors = design.sponsors ?? [];
  const holeSponsors = (design.holeSponsorIds ?? []).map((id) => sponsors.find((s) => s.id === id)).filter(Boolean) as typeof sponsors;
  const strip = !!design.sponsorStrip && sponsors.length > 0;
  const stripH = strip ? 78 : 0;
  const panelW = 176; // ~29% info, the hole map gets the rest
  const mapX = panelW + 6, mapW = SIGN_W - mapX - 10, mapY = 10, mapH = SIGN_H - 20 - stripH;
  const showQr = design.showQr !== false;
  const F = signFont(design.font);
  const DISPLAY = F.display, BODY = F.body;
  const mapStyle = design.mapStyle ?? "illustrated";
  const sat = mapStyle === "satellite", flat = mapStyle === "flat";

  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!showQr) return;
    QRCode.toDataURL(qrUrl, { margin: 1, width: 240, color: { dark: "#000000", light: "#ffffff" } }).then(setQr).catch(() => setQr(null));
  }, [qrUrl, showQr]);

  // Tee pads and basket positions: the sign's own tee/basket always exist; others join when mapped.
  const tees = useMemo<(SignPad & { colour: string })[]>(() => {
    const list = (hole.tees ?? []).filter((t) => t.at);
    const out = hole.tee && !list.some((t) => dist(t.at, hole.tee!) < 3) ? [{ id:"main-tee",name: "Tee", at: hole.tee }, ...list] : list;
    if (hole.tee) out.sort((a, b) => dist(a.at, hole.tee!) - dist(b.at, hole.tee!)); // own tee first
    return out.slice(0, 4).map((t, i) => ({ ...t, colour: hexOr(t.color, TEE_COLOURS[i % TEE_COLOURS.length]) }));
  }, [hole.tees, hole.tee]);
  const baskets = useMemo<SignPad[]>(() => {
    const list = (hole.baskets ?? []).filter((b) => b.at);
    const out = hole.basket && !list.some((b) => dist(b.at, hole.basket!) < 3) ? [{ id:"main-basket",name: list.length ? "Main" : "Basket", at: hole.basket }, ...list] : list;
    return out.slice(0, 4);
  }, [hole.baskets, hole.basket]);
  const multiBasket = baskets.length > 1;
  const current = hole.currentPin ? baskets.find((b) => b.name.toLowerCase() === hole.currentPin!.toLowerCase()) ?? null : multiBasket ? null : baskets[0] ?? null;

  const shapes = useMemo(
    () =>
      hole.tee && hole.basket
        ? projectHole(
            { tee: hole.tee, basket: hole.basket, flightPath: hole.flightPath, routeCurve:hole.routeCurve, features: [...(terrain ?? []), ...features], extraPoints: [...tees, ...baskets].map((p) => p.at) },
            mapW, mapH,
          )
        : null,
    [hole.tee, hole.basket, hole.flightPath, hole.routeCurve, features, terrain, mapW, mapH, tees, baskets],
  );

  // Aerial photo under the map, rotated with the hole (tee at the bottom, basket at the top).
  const satImg = useMemo(() => {
    if (!sat || !shapes || !hole.tee || !hole.basket) return null;
    const lat = (hole.tee[0] + hole.basket[0]) / 2, lng = (hole.tee[1] + hole.basket[1]) / 2;
    const sideM = (Math.hypot(mapW, mapH) / shapes.scale) * 1.08;
    const dLat = sideM / 2 / 111132, dLng = sideM / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
    const nw = shapes.project([lat + dLat, lng - dLng]), ne = shapes.project([lat + dLat, lng + dLng]), sw = shapes.project([lat - dLat, lng - dLng]);
    const m = `translate(${mapX} ${mapY}) matrix(${ne[0] - nw[0]} ${ne[1] - nw[1]} ${sw[0] - nw[0]} ${sw[1] - nw[1]} ${nw[0]} ${nw[1]})`;
    return { href: satelliteStillUrl(lat, lng, { widthM: sideM, heightM: sideM, px: 1000 }), m };
  }, [sat, shapes, hole.tee, hole.basket, mapW, mapH, mapX, mapY]);

  const fmt = (ft: number | null) => (ft == null ? "—" : units === "m" ? `${Math.round(ft * 0.3048)}m` : `${ft}′`);
  const clip = `map-${hole.number}`;
  const ppm = shapes ? shapes.scale : 1; // sign pixels per metre
  const rules = useMemo(() => signRuleLines(features), [features]);
  const matrix = tees.length && baskets.length;
  const holeLabel = String(hole.label || hole.number);

  // 50 ft distance arcs from the sign's own tee, out past the farthest basket.
  const arcs = useMemo(() => {
    if (!shapes || !hole.tee) return [] as { d: string; label: XY | null; ft: number }[];
    const maxFt = Math.max(...baskets.map((b) => ftOf(hole.tee!, b.at)), hole.distanceFt ?? 0);
    const step = maxFt >= 600 ? 100 : 50;
    const out: { d: string; label: XY | null; ft: number }[] = [];
    const [tx, ty] = shapes.tee;
    for (let ft = step; ft < maxFt - step * 0.4; ft += step) {
      const r = ft * 0.3048 * shapes.scale;
      const a0 = (-90 - 32) * (Math.PI / 180), a1 = (-90 + 32) * (Math.PI / 180);
      const p0: XY = [tx + r * Math.cos(a0), ty + r * Math.sin(a0)];
      const p1: XY = [tx + r * Math.cos(a1), ty + r * Math.sin(a1)];
      // Label the end farther from the flight line and pins; skip it if both ends are crowded.
      const busy = [...shapes.line, ...baskets.map((b) => shapes.project(b.at))];
      const clear = (q: XY) => Math.min(...busy.map((b) => Math.hypot(b[0] - q[0], b[1] - q[1])));
      const pick = clear(p1) >= clear(p0) ? p1 : p0;
      const inside = pick[0] > 8 && pick[0] < mapW - 40 && pick[1] > 8 && pick[1] < mapH - 8;
      out.push({ d: `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`, label: inside && clear(pick) > 22 ? pick : null, ft });
    }
    return out;
  }, [shapes, hole.tee, baskets, hole.distanceFt, mapW, mapH]);

  // One "OB" label per area, skipped on slivers and where labels would pile up.
  const obLabelAt = useMemo(() => {
    const placed: XY[] = [];
    return (shapes?.obAreas ?? []).map((p) => {
      const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
      if (Math.max(...xs) - Math.min(...xs) < 26 || Math.max(...ys) - Math.min(...ys) < 18) return null;
      const c = centroid(p);
      if (c[0] < 0 || c[1] < 0 || c[0] > mapW || c[1] > mapH || placed.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) < 60)) return null;
      placed.push(c);
      return c;
    });
  }, [shapes, mapW, mapH]);

  const legend: { key: string; label: string; icon: React.ReactNode }[] = [];
  // Only symbols a player might not read on their own: rules, extra tees and other pins.
  if (shapes) {
    if (tees.length > 1) tees.slice(0, 3).forEach((t) => legend.push({ key: "t" + t.name, label: `${titleCase(t.name)} tee`, icon: <rect x={0} y={-6} width={12} height={10} fill={t.colour} stroke="#fff" strokeWidth={1} /> }));
    if (multiBasket) legend.push({ key: "ba", label: "Other pin", icon: <circle cx={6} cy={-1} r={5} fill={INK.muted} stroke="#555" strokeWidth={1} /> });
    if (shapes.obLines.length || shapes.obAreas.length) legend.push({ key: "ob", label: "Out of bounds", icon: <line x1={0} y1={-1} x2={14} y2={-1} stroke="#fff" strokeWidth={2} strokeDasharray="5 2" /> });
    if (shapes.islands.length) legend.push({ key: "is", label: "Island", icon: <rect x={0} y={-6} width={12} height={10} fill={INK.fairway} stroke="#fff" strokeDasharray="2 1" /> });
    if (shapes.hazards.length) legend.push({ key: "hz", label: "Hazard", icon: <rect x={0} y={-6} width={12} height={10} fill="#f2c419" opacity={0.7} /> });
    if (shapes.mandos.length) legend.push({ key: "md", label: "Mandatory", icon: <circle cx={6} cy={-1} r={5} fill="#fff" stroke={INK.dark} strokeWidth={1.5} /> });
    if (shapes.dropzones.length) legend.push({ key: "dz", label: "Drop zone", icon: <rect x={0} y={-6} width={12} height={10} fill={INK.line} /> });
  }

  // Panel vertical rhythm
  const nameLines = courseName.toUpperCase().split(" ").reduce<string[]>((acc, w) => {
    const last = acc[acc.length - 1];
    if (last && (last + " " + w).length <= 14) acc[acc.length - 1] = last + " " + w;
    else acc.push(w);
    return acc;
  }, []).slice(0, 3);
  const rowH = 40;
  const mY = 292; // matrix top
  const mRows = matrix ? Math.min(3, baskets.length) : 0;
  const mH = matrix ? 26 + mRows * rowH + 8 : 0;
  const elevY = mY + mH + 18;
  const pinY = elevY + (hole.elevationFt != null ? 16 : 0);
  const showPin = multiBasket || !!hole.currentPin;
  const legY = pinY + (showPin ? 52 : 4);
  const qrY = SIGN_H - stripH - 86;
  const legendFits = legend.filter((_, i) => legY + 24 + Math.ceil((i + 1) / 2) * 17 < qrY - 8);

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${SIGN_W} ${SIGN_H}`} className="block h-auto w-full" role="img" aria-label={`Hole ${holeLabel} tee sign`}>
      <rect width={SIGN_W} height={SIGN_H} fill={panel} />
      {design.photoPath && urls[design.photoPath] ? (
        <image href={urls[design.photoPath]} width={SIGN_W} height={SIGN_H} preserveAspectRatio="xMidYMid slice" opacity={0.18} />
      ) : null}

      {/* ---------- Info panel ---------- */}
      <g fill={ink} fontFamily={DISPLAY}>
        <rect x={10} y={10} width={panelW - 10} height={92} rx={8} fill={card} />
        {design.logoPath && urls[design.logoPath] ? (
          <image href={urls[design.logoPath]} x={16} y={14} width={panelW - 22} height={design.subtitle ? 66 : 84} preserveAspectRatio="xMidYMid meet" />
        ) : (
          <text x={panelW / 2 + 5} y={nameLines.length > 2 ? 34 : nameLines.length > 1 ? 44 : 60} fontSize={nameLines.length > 2 ? 18 : 22} textAnchor="middle" letterSpacing={1.5}>
            {nameLines.map((ln, i) => <tspan key={i} x={panelW / 2 + 5} dy={i ? (nameLines.length > 2 ? 19 : 23) : 0}>{ln}</tspan>)}
          </text>
        )}
        {design.subtitle ? <text x={panelW / 2 + 5} y={94} fontSize={11} textAnchor="middle" opacity={0.9} fontFamily={BODY} letterSpacing={1}>{design.subtitle.toUpperCase().slice(0, 30)}</text> : null}

        <text x={20} y={130} fontSize={18} letterSpacing={4} fill={accent}>HOLE</text>
        <text x={14} y={232} fontSize={holeLabel.length >= 3 ? 76 : holeLabel.length === 2 ? 104 : 124} fontWeight={700}>{holeLabel}</text>
        {hole.par != null ? (
          <text x={20} y={276} fontSize={40}>PAR <tspan fill={accent}>{hole.par}</tspan></text>
        ) : (
          <text x={20} y={270} fontSize={16} fill={accent}>PAR NOT CONFIRMED</text>
        )}

        {matrix ? (
          <g transform={`translate(10 ${mY})`}>
            <rect width={panelW - 10} height={mH} rx={8} fill="#ffffff" />
            {tees.slice(0, 3).map((t, i, arr) => {
              const cw = (panelW - 10 - 36) / arr.length;
              return (
                <g key={t.name + i} transform={`translate(${36 + i * cw} 6)`}>
                  <rect width={cw - 4} height={18} rx={3} fill={t.colour} stroke={isLightColour(t.colour) ? "#999" : "none"} />
                  <text x={(cw - 4) / 2} y={14} textAnchor="middle" fontSize={13} fill={isLightColour(t.colour) ? INK.dark : "#fff"}>{shortName(t.name).slice(0, 10)}</text>
                </g>
              );
            })}
            {baskets.slice(0, 3).map((b, r) => (
              <g key={b.name + r} transform={`translate(0 ${26 + r * rowH})`}>
                {r ? <line x1={8} x2={panelW - 18} y1={0} y2={0} stroke="#d5d8d2" /> : null}
                {multiBasket ? <>
                <circle cx={18} cy={rowH / 2} r={12} fill={current?.name === b.name ? INK.gold : INK.dark} />
                <text x={18} y={rowH / 2 + 6} textAnchor="middle" fontSize={16} fill={current?.name === b.name ? INK.dark : "#fff"}>{shortName(b.name).slice(0, 2)}</text>
                </> : null}
                {tees.slice(0, 3).map((t, i, arr) => {
                  const cw = (panelW - 10 - 36) / arr.length;
                  const score=hole.pairDistances?.[`${t.id}/${b.id}`];
                  return (
                    <g key={i}>
                      <text x={36 + i * cw + (cw - 4) / 2} y={rowH / 2 + (hole.pairDistances ? 3 : 10)} textAnchor="middle" fontSize={arr.length > 2 ? 22 : 28} fill={isLightColour(t.colour) ? INK.dark : t.colour}>
                        {fmt(hole.pairDistances===undefined ? ftOf(t.at,b.at) : score?.distance ?? null)}
                      </text>
                      {hole.pairDistances && <text x={36+i*cw+(cw-4)/2} y={rowH-3} textAnchor="middle" fontSize={10} fill={INK.dark}>
                        Par {score?.par ?? "—"}{score?.distanceOverride!=null ? " · measured" : ""}
                      </text>}
                    </g>
                  );
                })}
              </g>
            ))}
          </g>
        ) : (
          <text x={20} y={mY + 30} fontSize={30}>{fmt(hole.distanceFt)}</text>
        )}

        {hole.elevationFt != null ? (
          <g transform={`translate(20 ${elevY})`}>
            <path d={hole.elevationFt === 0 ? "M0 -5 L14 -5" : hole.elevationFt > 0 ? "M0 0 L7 -10 L14 0 Z" : "M0 -10 L7 0 L14 -10 Z"} fill={accent} stroke={accent} strokeWidth={2} />
            <text x={20} y={1} fontSize={17} fontFamily={DISPLAY} letterSpacing={0.5}>
              {hole.elevationFt === 0 ? "FLAT TO THE BASKET" : `ELEV. ${hole.elevationFt > 0 ? "+" : "−"}${Math.abs(hole.elevationFt)} FT ${hole.elevationFt > 0 ? "UPHILL" : "DOWNHILL"}`}
            </text>
          </g>
        ) : null}

        {showPin ? (
          <g transform={`translate(10 ${pinY})`}>
            <rect width={panelW - 10} height={40} rx={20} fill={current ? INK.gold : card} />
            <text x={(panelW - 10) / 2} y={13} textAnchor="middle" fontSize={10} letterSpacing={1} fill={current ? INK.dark : ink}>CURRENT PIN</text>
            <text x={(panelW - 10) / 2} y={30} textAnchor="middle" fontSize={current ? Math.min(18,(panelW-26)/(shortName(current.name).length*.62)) : 15} fill={current ? INK.dark : ink}>
              {current ? shortName(current.name) : "NOT CONFIRMED"}
            </text>
          </g>
        ) : null}

        {legendFits.length ? (
          <g transform={`translate(10 ${legY})`}>
            <rect width={panelW - 10} height={24 + Math.ceil(legendFits.length / 2) * 17} rx={8} fill={card} />
            <text x={10} y={17} fontSize={15} letterSpacing={2}>LEGEND</text>
            {legendFits.map((l, i) => (
              <g key={l.key} transform={`translate(${10 + (i % 2) * 80} ${36 + Math.floor(i / 2) * 17})`}>
                {l.icon}
                <text x={17} y={3} fontSize={10.5} fontFamily={BODY} fontWeight={600}>{l.label.slice(0, 13)}</text>
              </g>
            ))}
          </g>
        ) : null}

        {showQr && qr ? (
          <g transform={`translate(10 ${qrY})`}>
            <rect width={panelW - 10} height={76} rx={8} fill={card} />
            <rect x={8} y={8} width={60} height={60} fill="#ffffff" />
            <image href={qr} x={10} y={10} width={56} height={56} />
            <text x={74} y={30} fontSize={16}>COURSE INFO</text>
            <text x={74} y={47} fontSize={10.5} fontFamily={BODY} fontWeight={600}>Live map, pins</text>
            <text x={74} y={60} fontSize={10.5} fontFamily={BODY} fontWeight={600}>and conditions</text>
          </g>
        ) : null}
      </g>

      {/* ---------- Hole map ---------- */}
      <defs>
        <clipPath id={clip}><rect x={mapX} y={mapY} width={mapW} height={mapH} rx={10} /></clipPath>
        <pattern id={`${clip}-grass`} width={18} height={18} patternUnits="userSpaceOnUse">
          <rect width={18} height={18} fill={INK.grass} />
          <circle cx={4} cy={5} r={1.2} fill={INK.grassDark} opacity={0.6} />
          <circle cx={13} cy={12} r={1} fill={INK.grassDark} opacity={0.5} />
        </pattern>
        <pattern id={`${clip}-woods`} width={16} height={16} patternUnits="userSpaceOnUse">
          <rect width={16} height={16} fill={INK.canopyDark} />
          <circle cx={4} cy={4} r={4.5} fill={INK.canopy} />
          <circle cx={12} cy={11} r={4} fill={INK.canopy} />
          <circle cx={3} cy={3} r={1.6} fill={INK.canopyLight} opacity={0.8} />
          <circle cx={11} cy={10} r={1.4} fill={INK.canopyLight} opacity={0.8} />
        </pattern>
        <pattern id={`${clip}-tall`} width={12} height={12} patternUnits="userSpaceOnUse">
          <rect width={12} height={12} fill="#7f8f3a" />
          <path d="M2 11 L3 4 M5 11 L6 2 M8 11 L8 5 M10 11 L11 3" stroke="#c8c46a" strokeWidth={1} strokeLinecap="round" />
        </pattern>
        <pattern id={`${clip}-hazard`} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width={10} height={10} fill="#f2c419" opacity={0.25} />
          <line x1={0} y1={0} x2={0} y2={10} stroke="#f2c419" strokeWidth={3} opacity={0.8} />
        </pattern>
        <pattern id={`${clip}-ripple`} width={22} height={10} patternUnits="userSpaceOnUse">
          <path d="M2 6 Q7 2 12 6" fill="none" stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
        </pattern>
        <pattern id={`${clip}-hatch`} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={8} height={8} fill="#ffffff" opacity={0.12} />
          <line x1={0} y1={0} x2={0} y2={8} stroke={INK.ob} strokeWidth={1.2} opacity={0.7} />
        </pattern>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x={mapX} y={mapY} width={mapW} height={mapH} fill={flat || sat ? INK.grass : `url(#${clip}-grass)`} />
        {sat && satImg ? <image href={satImg.href} width={1} height={1} preserveAspectRatio="none" transform={satImg.m} /> : null}
        {sat ? <rect x={mapX} y={mapY} width={mapW} height={mapH} fill="#000000" opacity={0.12} /> : null}
        {shapes ? (
          <g transform={`translate(${mapX} ${mapY})`}>
            {shapes.parking.map((p, i) => (
              <g key={"pk" + i}>
                <path d={pathD(p, true)} fill="#8a8f93" opacity={0.85} />
                <text x={centroid(p)[0]} y={centroid(p)[1] + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#ffffff" fontFamily={BODY}>P</text>
              </g>
            ))}
            {shapes.pitches.map((p, i) => <path key={"pi" + i} d={pathD(p, true)} fill="#7fb04f" stroke="#ffffff" strokeOpacity={0.6} strokeWidth={1.5} />)}
            {shapes.bare.map((p, i) => <path key={"ba" + i} d={pathD(p, true)} fill="#d9c79a" stroke="#bfae80" strokeWidth={1.5} />)}
            {!sat && shapes.grass.map((p, i) => <path key={"tg" + i} d={pathD(p, true)} fill={`url(#${clip}-tall)`} stroke="#6e7c30" strokeWidth={4} strokeLinejoin="round" />)}
            {!sat && shapes.woods.map((p, i) => (
              <g key={"wd" + i}>
                <path d={pathD(p, true)} fill={INK.canopyDark} stroke={INK.canopyDark} strokeWidth={12} strokeLinejoin="round" />
                <path d={pathD(p, true)} fill={flat ? INK.canopy : `url(#${clip}-woods)`} stroke={INK.canopy} strokeWidth={6} strokeLinejoin="round" />
              </g>
            ))}
            {shapes.water.map((p, i) => (
              <g key={"w" + i}>
                <path d={pathD(p, true)} fill={INK.water} stroke={INK.waterEdge} strokeWidth={3} strokeLinejoin="round" />
                <path d={pathD(p, true)} fill={`url(#${clip}-ripple)`} />
              </g>
            ))}
            {shapes.islands.map((p, i) => (
              <g key={"is" + i}>
                <path d={pathD(p, true)} fill={INK.fairway} stroke="#ffffff" strokeWidth={3} strokeDasharray="9 5" strokeLinejoin="round" />
                <text x={centroid(p)[0]} y={centroid(p)[1] + 4} textAnchor="middle" fontSize={11} fill={INK.dark} fontFamily={DISPLAY} letterSpacing={1}>ISLAND</text>
              </g>
            ))}
            {shapes.hazards.map((p, i) => <path key={"hz" + i} d={pathD(p, true)} fill={`url(#${clip}-hazard)`} stroke="#f2c419" strokeWidth={2} strokeDasharray="6 3" />)}
            {shapes.streams.map((p, i) => <path key={"st" + i} d={pathD(p)} fill="none" stroke={INK.water} strokeWidth={Math.max(4, ppm * 3)} strokeLinecap="round" strokeLinejoin="round" />)}
            {shapes.roads.map((p, i) => (
              <g key={"rd" + i}>
                <path d={pathD(p)} fill="none" stroke="#5a5f62" strokeWidth={Math.max(8, ppm * 6) + 3} strokeLinecap="round" strokeLinejoin="round" />
                <path d={pathD(p)} fill="none" stroke="#a4a8ab" strokeWidth={Math.max(8, ppm * 6)} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            ))}
            {shapes.buildings.map((p, i) => <path key={"bd" + i} d={pathD(p, true)} fill="#cfc6b4" stroke="#ffffff" strokeOpacity={0.8} strokeWidth={1.2} />)}
            {shapes.obAreas.map((p, i) => (
              <g key={"a" + i}>
                <path d={pathD(p, true)} fill={`url(#${clip}-hatch)`} stroke={INK.ob} strokeWidth={2} strokeDasharray="8 4" />
                {obLabelAt[i] ? <text x={obLabelAt[i]![0]} y={obLabelAt[i]![1] + 5} textAnchor="middle" fontSize={15} fill={INK.ob} fontFamily={DISPLAY} stroke="#00000055" strokeWidth={0.6}>OB</text> : null}
              </g>
            ))}
            {shapes.paths.map((p, i) => (
              <g key={"p" + i}>
                <path d={pathD(p)} fill="none" stroke="#8c8574" strokeWidth={Math.max(5, ppm * 2.4) + 2} strokeLinecap="round" strokeLinejoin="round" />
                <path d={pathD(p)} fill="none" stroke="#c9c2b0" strokeWidth={Math.max(5, ppm * 2.4)} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            ))}
            <path d={pathD(shapes.fairway, true)} fill={INK.fairway} opacity={sat ? 0.28 : 0.75} stroke={mix(INK.fairway, 0.2)} strokeWidth={2} strokeLinejoin="round" />
            {baskets.map((b, i) => {
              const p = shapes.project(b.at);
              return <circle key={"gr" + i} cx={p[0]} cy={p[1]} r={Math.max(20, shapes.circleR)} fill={mix(INK.fairway, 0.15)} opacity={0.9} />;
            })}
            {shapes.boundary.map((p, i) => <path key={"cb" + i} d={pathD(p, true)} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="10 6" />)}
            {!sat && shapes.treeLines.map((ln, li) => {
              const r = Math.max(6, ppm * 3.5);
              const pts: XY[] = [];
              for (let k = 1; k < ln.length; k++) {
                const [a, b] = [ln[k - 1], ln[k]];
                const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (r * 1.3)));
                for (let j = 0; j < n; j++) pts.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
              }
              pts.push(ln[ln.length - 1]);
              return (
                <g key={"tl" + li}>
                  <path d={pathD(ln)} fill="none" stroke={INK.canopyDark} strokeWidth={r * 1.8} strokeLinecap="round" strokeLinejoin="round" />
                  {pts.map((t, i) => (
                    <g key={i}>
                      <circle cx={t[0]} cy={t[1]} r={r * (0.85 + Math.abs(jit(i, li)) * 0.3)} fill={INK.canopy} stroke={INK.canopyDark} strokeWidth={1} />
                      <circle cx={t[0] - r * 0.25} cy={t[1] - r * 0.25} r={r * 0.3} fill={INK.canopyLight} opacity={0.8} />
                    </g>
                  ))}
                </g>
              );
            })}
            {!sat && (() => {
              // Trees draw in three passes (shadows, crowns, sunlit tops) so overlapping crowns read as real canopy.
              const list = shapes.trees.map((t, i) => {
                const fixed = shapes.treeR[i];
                const r = fixed ? Math.max(2.5, fixed) : Math.max(7, ppm * 4) * (0.85 + Math.abs(jit(i, 1)) * 0.4);
                return { t, r, i, bush: r / Math.max(ppm, 0.0001) < 2.6 };
              });
              const crown = (x: number, y: number, r: number, i: number) => {
                if (r < 6) return `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
                const lobes = 9;
                let d = "";
                for (let k = 0; k <= lobes; k++) {
                  const a = (k / lobes) * Math.PI * 2, rr = r * (0.9 + Math.abs(jit(i, k + 3)) * 0.14);
                  const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
                  if (k === 0) d += `M${px.toFixed(1)},${py.toFixed(1)}`;
                  else d += `Q${(x + Math.cos(a - Math.PI / lobes) * rr * 1.12).toFixed(1)},${(y + Math.sin(a - Math.PI / lobes) * rr * 1.12).toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`;
                }
                return d + "Z";
              };
              return (
                <g>
                  <defs>
                    <radialGradient id={`${clip}-crown`} cx="38%" cy="34%" r="70%">
                      <stop offset="0%" stopColor={INK.canopyLight} />
                      <stop offset="55%" stopColor={INK.canopy} />
                      <stop offset="100%" stopColor={INK.canopyDark} />
                    </radialGradient>
                    <radialGradient id={`${clip}-bush`} cx="40%" cy="35%" r="70%">
                      <stop offset="0%" stopColor="#6f9a3e" />
                      <stop offset="100%" stopColor="#35561f" />
                    </radialGradient>
                  </defs>
                  {list.map(({ t, r, i }) => <ellipse key={"ts" + i} cx={t[0] + r * 0.35} cy={t[1] + r * 0.4} rx={r * 1.02} ry={r * 0.95} fill="#0b1f08" opacity={0.28} />)}
                  {list.map(({ t, r, i, bush }) => (
                    <path key={"tc" + i} d={crown(t[0], t[1], r, i)} fill={flat ? (bush ? "#4f7a2c" : INK.canopy) : `url(#${clip}-${bush ? "bush" : "crown"})`} stroke={INK.canopyDark} strokeWidth={0.6} strokeOpacity={0.7} />
                  ))}
                  {!flat && list.filter((x) => x.r >= 5).map(({ t, r, i }) => (
                    <g key={"th" + i} opacity={0.55}>
                      <circle cx={t[0] - r * 0.3} cy={t[1] - r * 0.3} r={r * 0.26} fill={INK.canopyLight} />
                      <circle cx={t[0] + r * 0.12} cy={t[1] - r * 0.42} r={r * 0.17} fill={INK.canopyLight} />
                      <circle cx={t[0] - r * 0.45} cy={t[1] + r * 0.05} r={r * 0.15} fill={INK.canopyLight} />
                    </g>
                  ))}
                </g>
              );
            })()}
            {shapes.fences.map((p, i) => <path key={"f" + i} d={pathD(p)} fill="none" stroke="#e4dfd2" strokeWidth={2} strokeDasharray="6 3" />)}
            {shapes.benches.map((p, i) => <rect key={"bn" + i} x={p[0] - 7} y={p[1] - 3} width={14} height={6} rx={1} fill="#8b5a2b" stroke="#ffffff" strokeWidth={1} />)}
            {shapes.shelters.map((p, i) => (
              <g key={"sh" + i} transform={`translate(${p[0]} ${p[1]})`}>
                <rect x={-10} y={-10} width={20} height={20} fill="#b9a68a" stroke="#ffffff" strokeWidth={1.5} />
                <path d="M-10 -10 L10 10 M10 -10 L-10 10" stroke="#8a7658" strokeWidth={1} />
              </g>
            ))}
            {shapes.restrooms.map((p, i) => (
              <g key={"rr" + i} transform={`translate(${p[0]} ${p[1]})`}>
                <rect x={-11} y={-9} width={22} height={18} rx={2} fill="#ffffff" />
                <text y={4} textAnchor="middle" fontSize={9} fontWeight={700} fill={INK.dark} fontFamily={BODY}>WC</text>
              </g>
            ))}
            {shapes.entrances.map((p, i) => (
              <g key={"en" + i} transform={`translate(${p[0]} ${p[1]})`}>
                <circle r={9} fill="#ffffff" stroke={INK.dark} strokeWidth={1.5} />
                <path d="M-4 0 H4 M1 -3 L4 0 L1 3" stroke={INK.dark} strokeWidth={1.8} fill="none" strokeLinecap="round" />
              </g>
            ))}
            {shapes.notes.slice(0, 4).map((n, i) => (
              <g key={"nt" + i} transform={`translate(${n.at[0]} ${n.at[1]})`}>
                <circle r={4} fill="#ffffff" stroke={INK.dark} strokeWidth={1.2} />
                <rect x={7} y={-9} width={Math.min(150, n.text.length * 5.6 + 10)} height={17} rx={3} fill="#ffffff" opacity={0.92} />
                <text x={12} y={3} fontSize={10} fill={INK.dark} fontFamily={BODY}>{n.text.length > 26 ? n.text.slice(0, 25) + "…" : n.text}</text>
              </g>
            ))}
            {shapes.bins.map((p, i) => <circle key={"bi" + i} cx={p[0]} cy={p[1]} r={3.5} fill="#5d6166" stroke="#ffffff" strokeWidth={1} />)}
            {shapes.signs.map((p, i) => <rect key={"sg" + i} x={p[0] - 3} y={p[1] - 4} width={6} height={8} fill="#ffffff" stroke={INK.dark} strokeWidth={1} />)}
            {shapes.obLines.map((p, i) => (
              <g key={"o" + i}>
                {shapes.obSides[i] === "left" || shapes.obSides[i] === "right" ? (
                  <path d={pathD([...p, ...p.slice().reverse().map((q) => [q[0] + (shapes.obSides[i] === "left" ? -16 : 16), q[1]] as XY)], true)} fill={`url(#${clip}-hatch)`} />
                ) : null}
                <path d={pathD(p)} fill="none" stroke={INK.ob} strokeWidth={2.5} strokeDasharray="9 5" />
                {p.length ? <text x={p[Math.floor(p.length / 2)][0] + 8} y={p[Math.floor(p.length / 2)][1]} fontSize={15} fill={INK.ob} fontFamily={DISPLAY} stroke="#00000055" strokeWidth={0.6}>OB</text> : null}
              </g>
            ))}

            {/* Distance guides */}
            {arcs.map((a) => (
              <g key={"arc" + a.ft}>
                <path d={a.d} fill="none" stroke="#ffffff" strokeOpacity={0.75} strokeWidth={1.3} strokeDasharray="4 4" />
                {a.label ? <text x={a.label[0] + 4} y={a.label[1] + 4} fontSize={12} fill="#ffffff" fontFamily={DISPLAY} stroke="#00000066" strokeWidth={0.5}>
                  {units === "m" ? `${Math.round(a.ft * 0.3048)}m` : `${a.ft}ft`}
                </text> : null}
              </g>
            ))}

            {/* Flight paths: the sign's own tee follows the drawn line; other tees run straight to the current/main basket. */}
            {tees.slice(1).map((t, i) => {
              const target = shapes.project((current ?? baskets[0]).at);
              const s = shapes.project(t.at);
              return <path key={"fl" + i} d={pathD([s, target])} fill="none" stroke={t.colour} strokeOpacity={0.75} strokeWidth={3} strokeDasharray="9 6" strokeLinecap="round" />;
            })}
            <path d={pathD(shapes.line)} fill="none" stroke="#ffffff" strokeWidth={6} strokeLinecap="round" opacity={0.5} />
            <path d={pathD(shapes.line)} fill="none" stroke={tees[0]?.colour ?? INK.line} strokeWidth={4} strokeDasharray="10 7" strokeLinecap="round" />

            {shapes.mandos.map((p, i) => (
              <g key={"m" + i} transform={`translate(${p[0]} ${p[1]})`}>
                <circle r={11} fill="#ffffff" stroke={INK.dark} strokeWidth={2} />
                <path d="M0 6 L0 -6 M-4 -2 L0 -6 L4 -2" stroke={INK.dark} strokeWidth={2} fill="none" />
              </g>
            ))}
            {shapes.dropzones.map((p, i) => (
              <g key={"d" + i} transform={`translate(${p[0]} ${p[1]})`}>
                <rect x={-12} y={-10} width={24} height={20} fill={INK.line} stroke="#ffffff" strokeWidth={1.5} />
                <text y={4} textAnchor="middle" fontSize={9} fill="#ffffff" fontFamily={BODY} fontWeight={700}>DZ</text>
              </g>
            ))}

            {/* Tee pads with labels; the sign's own tee is the strongest */}
            {tees.map((t, i) => {
              const p = shapes.project(t.at);
              const own = i === 0;
              const w = own ? 18 : 14, h = own ? 30 : 24;
              return (
                <g key={"tp" + i}>
                  <g transform={`translate(${p[0]} ${p[1]}) rotate(${shapes.teeAngle})`}>
                    <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill={t.colour} stroke="#ffffff" strokeWidth={own ? 2.5 : 1.5} />
                  </g>
                  {tees.length > 1 || t.name !== "Tee" ? (
                    <g transform={`translate(${p[0]} ${p[1] + h / 2 + 6})`}>
                      <rect x={-28} y={0} width={56} height={18} rx={3} fill="#ffffff" />
                      <text x={0} y={14} textAnchor="middle" fontSize={14} fill={isLightColour(t.colour) ? INK.dark : t.colour} fontFamily={DISPLAY}>{shortName(t.name).slice(0, 9)} TEE</text>
                    </g>
                  ) : null}
                </g>
              );
            })}

            {/* Basket positions: current pin gold with halo, others muted */}
            {baskets.map((b, i) => {
              const p = shapes.project(b.at);
              const on = current ? current.name === b.name : !multiBasket;
              return (
                <g key={"bp" + i} transform={`translate(${p[0]} ${p[1]})`} opacity={on || !current ? 1 : 0.8}>
                  {on ? <circle r={20} fill={INK.gold} opacity={0.3} /> : null}
                  <BasketIcon colour={on ? INK.gold : INK.muted} />
                  {multiBasket ? (
                    <g transform="translate(14 -22)">
                      <circle r={11} fill={on ? INK.gold : "#ffffff"} stroke={INK.dark} strokeWidth={1.5} />
                      <text y={5} textAnchor="middle" fontSize={14} fill={INK.dark} fontFamily={DISPLAY}>{shortName(b.name).slice(0, 2)}</text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        ) : (
          <text x={mapX + mapW / 2} y={mapY + mapH / 2} textAnchor="middle" fontSize={16} fill="#ffffff" fontFamily={BODY}>
            Place the tee and basket to draw this hole
          </text>
        )}

        {/* North arrow */}
        {shapes ? (
          <g transform={`translate(${mapX + mapW - 34} ${mapY + 34})`}>
            <circle r={22} fill="#ffffff" opacity={0.92} />
            <g transform={`rotate(${shapes.northDeg})`}>
              <path d="M0 -16 L7 6 L0 2 L-7 6 Z" fill={INK.dark} />
            </g>
            <text y={18} textAnchor="middle" fontSize={10} fontWeight={700} fill={INK.dark} fontFamily={BODY}>N</text>
          </g>
        ) : null}

        {holeSponsors.length ? (
          <g transform={`translate(${mapX + 10} ${mapY + 10})`}>
            {holeSponsors.slice(0, 2).map((s, i) => (
              <g key={s.id} transform={`translate(0 ${i * 50})`}>
                <rect width={120} height={44} rx={6} fill="#ffffff" opacity={0.95} />
                {s.logoPath && urls[s.logoPath] ? (
                  <image href={urls[s.logoPath]} x={6} y={4} width={108} height={36} preserveAspectRatio="xMidYMid meet" />
                ) : (
                  <text x={60} y={27} textAnchor="middle" fontSize={13} fill={INK.dark} fontFamily={BODY} fontWeight={700}>{s.name.slice(0, 18)}</text>
                )}
              </g>
            ))}
          </g>
        ) : null}
      </g>

      {design.showRules !== false && rules.length ? (
        <g transform={`translate(${mapX + 10} ${mapY + mapH - 14 - rules.length * 17})`}>
          <rect x={-6} y={-16} width={mapW - 8} height={rules.length * 17 + 12} rx={4} fill="#000000" opacity={0.6} />
          {rules.map((r, i) => (
            <text key={i} y={i * 17} fontSize={12} fill="#ffffff" fontFamily={BODY}>{r.length > 56 ? r.slice(0, 55) + "…" : r}</text>
          ))}
        </g>
      ) : null}

      {strip ? (
        <g transform={`translate(0 ${SIGN_H - stripH})`}>
          <rect width={SIGN_W} height={stripH} fill="#ffffff" />
          {sponsors.slice(0, 6).map((s, i, arr) => {
            const cw = (SIGN_W - 24) / arr.length;
            return (
              <g key={s.id} transform={`translate(${12 + i * cw} 10)`}>
                {s.logoPath && urls[s.logoPath] ? (
                  <image href={urls[s.logoPath]} x={6} width={cw - 12} height={stripH - 20} preserveAspectRatio="xMidYMid meet" />
                ) : (
                  <text x={cw / 2} y={(stripH - 20) / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={INK.dark} fontFamily={BODY}>{s.name.slice(0, 20)}</text>
                )}
              </g>
            );
          })}
        </g>
      ) : null}

      {includeElements
        ? (design.elements ?? []).map((el) => {
            const x = (el.x / 100) * SIGN_W, y = (el.y / 100) * SIGN_H, w = (el.w / 100) * SIGN_W, h = (el.h / 100) * SIGN_H;
            if (el.kind === "image") return el.path && urls[el.path] ? <image key={el.id} href={urls[el.path]} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" /> : null;
            const fs = ((el.fontSize ?? 6) / 100) * SIGN_W;
            const tx = el.align === "left" ? x + 6 : el.align === "right" ? x + w - 6 : x + w / 2;
            const lines = (el.text ?? "").split("\n");
            return (
              <g key={el.id}>
                {el.background ? <rect x={x} y={y} width={w} height={h} fill={el.background} /> : null}
                <text x={tx} y={y + h / 2 - ((lines.length - 1) * fs * 1.15) / 2 + fs * 0.35} fontSize={fs} fill={el.color ?? "#fff"} fontWeight={el.bold ? 700 : 400} textAnchor={el.align === "left" ? "start" : el.align === "right" ? "end" : "middle"} fontFamily={BODY}>
                  {lines.map((ln, i) => <tspan key={i} x={tx} dy={i ? fs * 1.15 : 0}>{ln}</tspan>)}
                </text>
              </g>
            );
          })
        : null}
    </svg>
  );
});

function BasketIcon({ colour }: { colour: string }) {
  return (
    <g stroke="#1b1b1b" strokeWidth={1.2}>
      <ellipse cx={0} cy={-10} rx={9} ry={3} fill={colour} />
      <path d="M-8 -9 L-4 3 M8 -9 L4 3 M-3 -8 L-2 3 M3 -8 L2 3" fill="none" />
      <path d="M-8 2 L8 2 L6 7 L-6 7 Z" fill={colour} />
      <line x1={0} y1={-12} x2={0} y2={12} />
    </g>
  );
}

const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

/** Serialise a rendered sign to a standalone SVG with images embedded, so it opens in Illustrator, Inkscape or a print shop. */
export async function signToSvgBlob(svg: SVGSVGElement): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", "18in");
  clone.setAttribute("height", "24in");
  const imgs = Array.from(clone.querySelectorAll("image"));
  await Promise.all(
    imgs.map(async (im) => {
      const href = im.getAttribute("href");
      if (!href || href.startsWith("data:")) return;
      try {
        const blob = await (await fetch(href)).blob();
        const data = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
        im.setAttribute("href", data);
      } catch { im.remove(); }
    }),
  );
  return new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
}

function centroid(p: [number, number][]): [number, number] {
  const n = p.length || 1;
  return [p.reduce((a, q) => a + q[0], 0) / n, p.reduce((a, q) => a + q[1], 0) / n];
}
