import {recordEdit, undoEdit, redoEdit, rebaseEditHistory} from "@/lib/course-builder/edit-history";
import { layoutDraftKey, editorLayoutKey, draftBelongsToLayout, assertSafeDraftRestore, checkpointDraft } from "@/lib/course-builder/draft-recovery";
import { assertExplicitPinRemoval } from "@/lib/course-builder/save-safety";
import { PairScoreTable } from "@/components/course-builder/pair-score-table";
import { setPairScoring, pairSummary, primaryDistanceOverride } from "@/lib/course-builder/pair-scoring";
import {ReferenceOverlayControl, ReferenceOverlayLayer, useReferenceOverlay} from "@/components/course-builder/reference-overlay";
import {sameOverlaySpot} from "@/lib/course-builder/overlay-geometry";
import { endpointName, endpointRoleLabel, type EndpointIdentity } from "@/lib/course-builder/endpoint-identity";
import { assertCompleteHoleSave, removedSavedPins } from "@/lib/course-builder/save-safety";
import { RULE_FEATURE_TYPES, layoutPlaysFeature } from "@/lib/course-builder/layout-rules";
import { LayoutRulePicker } from "@/components/course-builder/layout-rule-picker";
import { CourseReviewBanner } from "@/components/course-builder/course-review-banner";
import { CourseBasemapLayers } from "@/components/map/course-basemap-layers";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import LayoutStudioPage from "@/components/course-builder/layout-studio/layout-studio-page";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Printer, Palette } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MapContainer,
  Marker,
  Polyline,
  Polygon,
  CircleMarker,
  Circle,
  Popup,
  useMap,
  useMapEvents,
  Pane,
} from "react-leaflet";
import { RotateHandle } from "@/components/course-builder/rotate-handle";
import { WalkCourse, type WalkStep } from "@/components/course-builder/walk-course";
import type { CourseTeeSetsHandle, TeeSet } from "@/components/course-builder/tee-sets";
import { StudioObjectTools } from "@/components/course-builder/studio-object-tools";
import { StudioFeatureProperties } from "@/components/course-builder/studio-feature-properties";
import { StudioFairwayEditor, type EndpointPreview } from "@/components/course-builder/studio-fairway-editor";
import {routeDistance} from "@/lib/course-builder/pairing-fairways";
import {createFairwayGeometry} from "@/lib/course-builder/fairway-curves";
import { studioFairways, applyStudioFairways, assignStudioBaskets, persistentStudioPins, readPrimaryPath, readTeePaths, writeTeePaths, readBasketPath, writeBasketPath, type StoredRoute, type TeePaths } from "@/lib/course-builder/studio-fairways";
import { stopMapItemPropagation } from "@/lib/map/map-item-events";
import L from "leaflet";
import "leaflet-rotate";
import {
  teeIcon,
  bearingDeg,
  basketIcon,
  featureIcon,
  vertexHandleIcon,
  FEATURE_CONFIG,
  type CourseFeatureType,
} from "@/components/leaflet-icon-fix";
import { FeatureGlyph } from "@/components/map/emblems";
import {
  summarizeLayout,
  designGaps,
  designHighlights,
  pointInPolygon,
  snapToNearbyVertex,
  holeLengthWarning,
  feetBetween,
} from "@/lib/course-aggregates";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Trash2,
  MapPin,
  Save,
  Check,
  X,
  Target,
  Flag,
  ArrowLeft,
  Camera,
  ChevronLeft,
  Footprints,
  ChevronRight,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Globe2,
  Pin,
  ChevronDown,
  ListChecks,
  Ruler,
  Layers,
  Minus,
  Plus,
  MousePointer2,
} from "lucide-react";
import type { LatLng, Map as LMap } from "leaflet";
import { toPng } from "html-to-image";
import {
  findNearestObSource,
  extractSubPath,
  type LatLng as GeoLatLng,
} from "@/lib/ob-reference-geo";
import { renderObHighlight, obSideLabel } from "@/components/course-features-map";
import { CourseFlythroughUploader, HoleFlythroughUploader } from "@/components/course-flythrough";
import { DuplicateCourseWarning } from "@/components/course/duplicate-course-warning";
import { CoursePublicImportDialog } from "@/components/course/course-public-import-dialog";
import type { PublicCourseCandidate } from "@/lib/course-public-lookup.functions";
import { normalizeStateCode } from "@/lib/us-states";
import { pickActiveLayoutId } from "@/lib/layout-activity";
import { GuidedSetupCard, type SetupStep } from "@/components/course-builder/builder-mode-bar";
import { CoEditorWarning } from "@/components/course-builder/co-editor-warning";
import { MapChecker } from "@/components/course-builder/map-checker";
import { MapLegend } from "@/components/course-builder/map-legend";
import { StudioEndpointMarker } from "@/components/course-builder/studio-endpoint-marker";
import { CopyToLayouts } from "@/components/course-builder/copy-to-layouts";
import { pathLengthFt, polygonAcres } from "@/lib/course-builder/geometry";
import type { BuilderMode } from "@/lib/course-builder/layers";

type PadDraft = {
  tempId: string;
  name: string;
  color: string;
  lat: number | null;
  lng: number | null;
  distance_override: number | null;
  /** Tees only: same = shares the main fairway, joins = own throw that meets it, own = separate shot. */
  route_mode?: "same" | "joins" | "own";
  bends?: [number, number][];
  pair_paths?: TeePaths;
  main_path?: StoredRoute;
  trunk_path?: StoredRoute;
  basket_ids?: string[];
  main_basket_ids?: string[];
  /** Tees only: this pad is played as a drop zone. */
  is_drop_zone?: boolean;
  /** Tees only: hand-set pad facing (0–359°); null = face down its own fairway. */
  bearing?: number | null;
};

/** Positions as loaded, so a save knows which tees/baskets were moved here. */
const loadedPlacement = new Map<
  string,
  { tee: string; basket: string; tee_source: string | null; basket_source: string | null }
>();

/** Tees/baskets moved in the editor were placed on the aerial map; untouched ones keep their source. */
function placementProvenance(h: {
  id: string | null;
  tee: [number, number] | null;
  basket: [number, number] | null;
  tee_gps?: { p: [number, number]; acc: number } | null;
  basket_gps?: { p: [number, number]; acc: number } | null;
}) {
  const prev = h.id ? loadedPlacement.get(h.id) : undefined;
  const one = (t: "tee" | "basket") => {
    const pt = h[t];
    if (!pt) return { source: null, acc: null };
    const gps = h[`${t}_gps`];
    if (gps && gps.p[0] === pt[0] && gps.p[1] === pt[1]) return { source: "gps", acc: gps.acc };
    const key = `${pt[0]},${pt[1]}`;
    if (prev && prev[t] === key) return { source: prev[`${t}_source`] ?? "unknown", acc: undefined };
    return { source: "aerial_map", acc: null };
  };
  const tee = one("tee");
  const basket = one("basket");
  return {
    tee_source: tee.source,
    basket_source: basket.source,
    ...(tee.acc !== undefined ? { tee_accuracy_m: tee.acc } : {}),
    ...(basket.acc !== undefined ? { basket_accuracy_m: basket.acc } : {}),
  };
}

type HoleDraft = {
  id: string | null;
  number: number;
  par: number;
  /** false = automatic par 3 nobody has confirmed yet. */
  par_confirmed?: boolean;
  /** Set by Walk & Map: the averaged GPS spot and its accuracy (m). */
  tee_gps?: { p: [number, number]; acc: number } | null;
  basket_gps?: { p: [number, number]; acc: number } | null;
  /** Basket position in use now; null = main position. */
  current_pin?: string | null;
  tee: [number, number] | null;
  basket: [number, number] | null;
  tee_name: string;
  basket_name: string;
  tee_color: string;
  /** Main tee pad direction in degrees; null = aim along the hole. */
  tee_bearing?: number | null;
  basket_color: string;
  distance_override: number | null;
  caddy_notes: string;
  nickname: string;
  elevation_ft: number | null;
  shot_shape: string;
  hazards: string[];
  designer_notes: string;
  extra_tees: PadDraft[];
  extra_baskets: PadDraft[];
  flight_path: [number, number][];
  map_snapshot_path: string | null;
  map_snapshot_url: string | null;
  map_center_lat: number | null;
  map_center_lng: number | null;
  map_zoom: number | null;
  flythrough_path: string | null;
  flythrough_url: string | null;
};

// Display label for a hole. Uses the user-entered nickname (e.g. "X", "Y",
// "Island Green") when present; otherwise falls back to the sequential number.
function holeLabel(h: { number: number; nickname?: string | null }) {
  const nick = (h.nickname ?? "").trim();
  return nick || String(h.number);
}
function holeLabelByNumber(holes: { number: number; nickname?: string | null }[], n: number) {
  const h = holes.find((x) => x.number === n);
  return h ? holeLabel(h) : String(n);
}

type ObSide = "left" | "right" | "past" | "behind" | "none";
type FeatureDraft = {
  tempId: string;
  // DB id when the feature was loaded from the database. Null for locally
  // created features until the next save. Used to keep OB references stable
  // across saves so the reference can point at a persistent source id.
  id: string | null;
  type: CourseFeatureType;
  points: [number, number][];
  // null = course-wide (applies to every hole).
  // Array of hole numbers = applies to those specific holes.
  hole_numbers: number[] | null;
  ob_side: ObSide;
  label: string;
  // For type === "ob_reference": the tempId of the source ob_line/ob_area
  // feature this reference points at. Resolved to ref_feature_id on save.
  ref_tempId: string | null;
  /** Tree canopy width in metres (single trees only); null = typical size. */
  canopy_m?: number | null;
  /** Mando arrow direction in degrees (0 = north); null = from pass side. */
  bearing?: number | null;
};

const HAZARD_OPTIONS = [
  "Water",
  "OB",
  "Trees",
  "Rocks",
  "Mando",
  "Elevation",
  "Wind",
  "Road",
  "Fence",
];

const SHOT_SHAPES = [
  { v: "", l: "—" },
  { v: "straight", l: "Straight" },
  { v: "hyzer", l: "Hyzer" },
  { v: "anhyzer", l: "Anhyzer" },
  { v: "dogleg_left", l: "Dogleg L" },
  { v: "dogleg_right", l: "Dogleg R" },
  { v: "tunnel", l: "Tunnel" },
  { v: "open", l: "Open" },
];

/**
 * Reads the shape of a hole from the flight line the designer drew: how far the
 * line bends off the straight tee-to-basket chord, and which way. Used when no
 * shape was picked by hand, so a drawn hole counts as shaped.
 */
function shapeFromFlightPath(
  tee: [number, number] | null,
  basket: [number, number] | null,
  path: [number, number][],
): string | null {
  if (!tee || !basket) return null;
  const toLocal = (p: [number, number]): [number, number] => [
    (p[1] - tee[1]) * Math.cos((tee[0] * Math.PI) / 180) * 111320,
    (p[0] - tee[0]) * 110540,
  ];
  const chord = toLocal(basket);
  const len = Math.hypot(chord[0], chord[1]);
  if (len < 1) return null;
  if (path.length === 0) return "straight";
  const ux = chord[0] / len;
  const uy = chord[1] / len;
  let peak = 0;
  for (const p of path) {
    const v = toLocal(p);
    const side = ux * v[1] - uy * v[0];
    if (Math.abs(side) > Math.abs(peak)) peak = side;
  }
  if (Math.abs(peak) / len < 0.06) return "straight";
  return peak > 0 ? "dogleg_left" : "dogleg_right";
}

function effectiveShotShape(h: {
  shot_shape: string;
  tee: [number, number] | null;
  basket: [number, number] | null;
  flight_path: [number, number][];
}): string | null {
  return h.shot_shape || shapeFromFlightPath(h.tee, h.basket, h.flight_path);
}

type ObRefDraft = {
  sourceTempId: string;
  startPoint: [number, number];
};
type Tool =
  | { kind: "select" }
  | { kind: "tee-basket"; placing: "tee" | "basket"; identity?:EndpointIdentity }
  | { kind: "feature"; type: CourseFeatureType }
  | { kind: "ob-ref"; draft: ObRefDraft | null };

// Note: `tee_sign` intentionally excluded — the dedicated Tee tool handles
// tee placement. Keeping it here would create two ways to drop a tee and
// desync the hole's tee coordinates.
const POINT_FEATURES: CourseFeatureType[] = [
  "entrance",
  "mando",
  "dropzone",
  "parking",
  "restroom",
  "trash",
  "bench",
  "gazebo",
  "tree",
  "note",
];
const LINE_FEATURES: CourseFeatureType[] = ["ob_line", "fence", "path", "tree_line"];
const POLY_FEATURES: CourseFeatureType[] = ["ob_area", "water", "island_green", "woods", "tall_grass", "hazard"];

// Real-world sized tee pad rectangle (default 3.6m long × 1.5m wide),
// rotated to face the basket. Rendered as a lat/lng Polygon so it auto-
// scales with map zoom.
function teePadPolygon(
  center: [number, number],
  bearingDeg: number,
  lengthM = 3.6,
  widthM = 1.5,
): [number, number][] {
  const latRad = (center[0] * Math.PI) / 180;
  const mPerLat = 111132;
  const mPerLng = 111320 * Math.cos(latRad);
  const br = (bearingDeg * Math.PI) / 180;
  // Local frame: +x = along bearing (toward basket), +y = perpendicular (left).
  const ux = { e: Math.sin(br), n: Math.cos(br) };
  const uy = { e: -Math.cos(br), n: Math.sin(br) };
  const hl = lengthM / 2;
  const hw = widthM / 2;
  const corners: Array<[number, number]> = [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
  ];
  return corners.map(([dx, dy]) => {
    const eM = dx * ux.e + dy * uy.e;
    const nM = dx * ux.n + dy * uy.n;
    return [center[0] + nM / mPerLat, center[1] + eM / mPerLng];
  });
}

function bearingBetween(a: [number, number], b: [number, number]): number {
  const latRad = (a[0] * Math.PI) / 180;
  const mPerLat = 111132;
  const mPerLng = 111320 * Math.cos(latRad);
  const dxM = (b[1] - a[1]) * mPerLng;
  const dyM = (b[0] - a[0]) * mPerLat;
  return (Math.atan2(dxM, dyM) * 180) / Math.PI;
}

function ClickCapture({ onClick }: { onClick: (ll: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

/**
 * Right-click (desktop) or long-press (touch — Leaflet emits contextmenu) opens
 * the map menu. A right-drag rotates the map, so a press that moved is ignored.
 */
function ContextMenuCapture({
  onOpen,
}: {
  onOpen: (ll: LatLng, x: number, y: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const c = map.getContainer();
    const down = (e: MouseEvent) => {
      if (e.button === 2) (c as any).__ctxStart = [e.clientX, e.clientY];
    };
    c.addEventListener("mousedown", down);
    return () => c.removeEventListener("mousedown", down);
  }, [map]);
  useMapEvents({
    contextmenu: (e) => {
      const oe = e.originalEvent as MouseEvent;
      const start = (map.getContainer() as any).__ctxStart as [number, number] | undefined;
      (map.getContainer() as any).__ctxStart = undefined;
      if (start && Math.hypot(oe.clientX - start[0], oe.clientY - start[1]) > 6) return;
      onOpen(e.latlng, e.containerPoint.x, e.containerPoint.y);
    },
    movestart: () => onOpen(null as any, -1, -1),
  });
  return null;
}

function HoleFocus({
  tee,
  basket,
  waypoints,
  fallback,
  triggerKey,
}: {
  tee: [number, number] | null;
  basket: [number, number] | null;
  waypoints: Array<[number, number]>;
  fallback: [number, number] | null;
  triggerKey: string | number | null;
}) {
  const map = useMap();
  useEffect(() => {
    const pts: Array<[number, number]> = [];
    if (tee) pts.push(tee);
    if (basket) pts.push(basket);
    for (const w of waypoints) pts.push(w);
    if (pts.length >= 2) {
      const bounds = L.latLngBounds(pts.map((p) => L.latLng(p[0], p[1])));
      map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 20, duration: 0.6 });
    } else if (pts.length === 1) {
      map.flyTo(pts[0], Math.max(map.getZoom(), 18), { duration: 0.6 });
    }
    // If the hole has no placed features yet, leave the map where it is.
  }, [triggerKey]);
  return null;
}

function FlyTo({
  target,
  zoom,
  triggerKey,
}: {
  target: [number, number] | null;
  zoom: number;
  triggerKey: string | number | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView(target, zoom);
  }, [triggerKey]);
  return null;
}

function distanceFt(a: [number, number], b: [number, number]) {
  const R = 20902231;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

const uid = () => crypto.randomUUID();

function getOriginalEvent(e?: unknown): Event | undefined {
  return (e as { originalEvent?: Event } | undefined)?.originalEvent;
}

function stopLeafletBubble(e?: unknown) {
  const originalEvent = getOriginalEvent(e);
  stopMapItemPropagation(originalEvent);
}

function stopLeafletClick(e?: unknown) {
  const originalEvent = getOriginalEvent(e);
  if (originalEvent) L.DomEvent.stop(originalEvent);
}

function RightClickRotate() {
  const map = useMap() as L.Map & { setBearing?: (b: number) => void; getBearing?: () => number };
  useEffect(() => {
    if (typeof map.setBearing !== "function") return;
    const container = map.getContainer();
    let dragging = false;
    let startX = 0;
    let startBearing = 0;
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      dragging = true;
      startX = e.clientX;
      startBearing = map.getBearing?.() ?? 0;
      container.style.cursor = "grabbing";
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      map.setBearing!(startBearing + dx * 0.5);
    };
    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      container.style.cursor = "";
    };
    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [map]);
  return null;
}

export default function CourseBuilder({
  courseId,
  layoutIdProp,
  overlayId,
  initialHole,
  initialLayoutsOpen = false,
  onLayoutChange,
}: { courseId?: string; layoutIdProp?: string; overlayId?: string; initialHole?: number; initialLayoutsOpen?: boolean; onLayoutChange?: (id: string) => void } = {}) {
  const { user } = useSession();
  const navigate = useNavigate();
  const isEdit = !!courseId;
  const [requestedLayoutId, setRequestedLayoutId] = useState(layoutIdProp);
  useEffect(() => {setRequestedLayoutId(layoutIdProp);}, [layoutIdProp]);
  const [layoutReload, setLayoutReload] = useState(0);
  const [layoutsOpen, setLayoutsOpen] = useState(initialLayoutsOpen);
  const [layoutEditorState, setLayoutEditorState] = useState({dirty: false, busy: false});
  const layoutsChangedRef = useRef(false);
  const [loadedLayoutId, setLoadedLayoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedReadyRef = useRef(!isEdit);
  const saveInFlightRef = useRef(false);
  const removedPinIdsRef = useRef(new Set<string>());
  const [loadedLayoutName,setLoadedLayoutName] = useState("");
  const savedTeeIdsRef = useRef(new Set<string>());
  const savedBasketIdsRef = useRef(new Set<string>());

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [address, setAddress] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [holeCount, setHoleCount] = useState(18);
  const [center, setCenter] = useState<[number, number]>([39.8283, -98.5795]);
  const [zoom, setZoom] = useState(4);
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"overview" | "holes">(isEdit ? "holes" : "overview");
  // Guided wizard stage (1-5). Only active when proMode is false.
  // 1 = Locate & Name, 2 = Property boundary, 3 = Overview snapshot,
  // 4 = Hole-by-hole, 5 = Final review.
  const [stage, setStage] = useState<1 | 2 | 3 | 4 | 5>(isEdit ? 4 : 1);
  const [proMode, setProMode] = useState<boolean>(true);
  const [gpsBusy, setGpsBusy] = useState<null | "tee" | "basket">(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const overviewAutoRanRef = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const [capturingOverview, setCapturingOverview] = useState(false);
  const [boundaryLocked, setBoundaryLocked] = useState(false);
  const [overviewSnapshotPath, setOverviewSnapshotPath] = useState<string | null>(null);
  const [overviewSnapshotUrl, setOverviewSnapshotUrl] = useState<string | null>(null);
  const [flythroughPath, setFlythroughPath] = useState<string | null>(null);
  const [flythroughUrl, setFlythroughUrl] = useState<string | null>(null);

  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  // One floating panel at a time replaces the old fixed sidebar.
  const overlay = useReferenceOverlay(courseId ?? "new-course");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayMark, setOverlayMark] = useState<"tee"|"basket"|null>(null);
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [panel, setPanel] = useState<"checks" | "hole" | "pars" | "features" | null>(null);
  const panelCls = (k: "checks" | "hole" | "pars" | "features") => (panel === k ? "space-y-3" : "hidden");
  useEffect(() => {
    if (editingFeatureId) setPanel("features");
  }, [editingFeatureId]);
  // Map objects added in the builder start as drafts (hidden from players)
  // until a steward publishes them; edits to already-published objects stay live.
  const [draftCount, setDraftCount] = useState(0);
  // Map key: object types the editor has switched off on the map (view only).
  // When on, map objects tied to other holes stay visible and selectable.
  const [mapScope, setMapScope] = useState<"course" | "hole">("course");
  const showAllHoleItems = mapScope === "course";
  function changeMapScope(scope: "course" | "hole") {
    setMapScope(scope);
    setOtherHoles(scope === "hole" ? "hidden" : "faded");
  }
  // Layers: how tees, baskets and lines from holes you're not editing appear.
  const [otherHoles, setOtherHoles] = useState<"faded" | "shown" | "hidden">("faded");
  const [hiddenTypes, setHiddenTypes] = useState<Set<CourseFeatureType>>(() => new Set());
  const [publishingDrafts, setPublishingDrafts] = useState(false);
  // Snap new drawing points onto nearby existing vertices (shared corners).
  const [snapEnabled, setSnapEnabled] = useState(true);
  // Confirmation that the TD has reviewed mandatory obstacles, OB, and
  // special rules for each hole. Persisted per-course in localStorage so
  // checkmarks survive refresh, navigation, and autosaves.
  const rulesStorageKey = `course-builder:rules-confirmed:${courseId ?? "draft"}`;
  const [rulesConfirmed, setRulesConfirmed] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(
        `course-builder:rules-confirmed:${courseId ?? "draft"}`,
      );
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.filter((n) => typeof n === "number") : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(rulesStorageKey, JSON.stringify([...rulesConfirmed]));
    } catch {
      /* ignore quota */
    }
  }, [rulesConfirmed, rulesStorageKey]);

  // Prefill a brand-new course from ?name=&city=&state= so "add this course"
  // links elsewhere in the app hand off what the player already typed.
  useEffect(() => {
    if (courseId || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pName = params.get("name")?.trim();
    const pCity = params.get("city")?.trim();
    const pState = params.get("state")?.trim();
    if (pName) setName(pName);
    if (pCity) setCity(pCity);
    if (pState) setStateVal(pState);
  }, [courseId]);

  const mapRef = useRef<LMap | null>(null);
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const edgePanFrameRef = useRef<number | null>(null);
  const manualPointDragCleanupRef = useRef<(() => void) | null>(null);
  const activeMarkerDragRef = useRef<{
    target: { getLatLng: () => { lat: number; lng: number } };
    commit: (point: [number, number]) => void;
  } | null>(null);

  const makeHole = (n: number): HoleDraft => ({
    id: crypto.randomUUID(),
    number: n,
    par: 3,
    tee: null,
    basket: null,
    tee_name: "Main tee",
    basket_name: "Main basket",
    tee_color: "#ffffff",
    basket_color: "#a3e635",
    distance_override: null,
    caddy_notes: "",
    nickname: "",
    elevation_ft: null,
    shot_shape: "",
    hazards: [],
    designer_notes: "",
    extra_tees: [],
    extra_baskets: [],
    flight_path: [],
    map_snapshot_path: null,
    map_snapshot_url: null,
    map_center_lat: null,
    map_center_lng: null,
    map_zoom: null,
    flythrough_path: null,
    flythrough_url: null,
  });
  const [holes, setHoles] = useState<HoleDraft[]>(() =>
    Array.from({ length: 18 }, (_, i) => makeHole(i + 1)),
  );
  const [activeHole, setActiveHole] = useState(initialHole ?? 1);
  const [selectedFairway, setSelectedFairway] = useState<{number:number; route:string} | null>(null);
  const [endpointPreview,setEndpointPreview] = useState<(EndpointPreview & {hole:number}) | null>(null);
  // Phones get a cleaner builder: extras fold behind "View" and "More", holes step with arrows.
  const [mapViewOpen, setMapViewOpen] = useState(false);
  const [walking, setWalking] = useState(false);

  const [pendingDeleteHole, setPendingDeleteHole] = useState<number | null>(null);

  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [attachToHole, setAttachToHole] = useState(true);
  const [features, setFeatures] = useState<FeatureDraft[]>([]);
  // Course Builder 2.0: three editing modes; tools shown depend on the mode.
  const [builderMode, setBuilderMode] = useState<BuilderMode>(isEdit ? "holes" : "course");
  const changeBuilderMode = (m: BuilderMode) => {
    setBuilderMode(m);
    setPlacingTeeId(null); setPlacingBasketId(null);
    setTool({ kind: "select" });
    setDraftPoints([]);
  };
  const boundaryPoints = (features.find((f) => f.type === "course_boundary")?.points ?? []) as [number, number][];
  const setupSteps: SetupStep[] = [
    { id: "boundary", label: "Course boundary", done: boundaryPoints.length >= 3 },
    {
      id: "infra",
      label: "Infrastructure",
      done: features.some((f) => ["parking", "restroom", "path", "gazebo", "bench", "trash"].includes(f.type)),
    },
    { id: "holes", label: "Hole locations", done: holes.length > 0 && holes.every((h) => h.tee && h.basket) },
    { id: "routing", label: "Routing and rules", done: holes.length > 0 && holes.every((h) => (h.flight_path?.length ?? 0) >= 2) },
    { id: "review", label: "Review", done: false },
    { id: "publish", label: "Publish", done: false },
  ];
  const deletedFeatureIdsRef = useRef<Set<string>>(new Set());
  // Which layout each loaded map item belongs to, so saving from another layout never takes it over.
  const featureLayoutRef = useRef<Map<string, string | null>>(new Map());
  const [pinSelection, setPinSelection] = useState<{id:string; serial:number} | null>(null);
  const paletteRef = useRef<CourseTeeSetsHandle>(null);
  const [teeSetsDraft, setTeeSetsDraft] = useState<TeeSet[] | null>(null);
  const [positionsUnlocked, setPositionsUnlocked] = useState(false);
  const normalizedSnapshotRef = useRef<string | null>(null);
  const undoToSavedRef = useRef(false);
  const [itemSelectionSerial,setItemSelectionSerial] = useState(0);
  const [placingTeeId, setPlacingTeeId] = useState<string | null>(null);
  const [placingBasketId, setPlacingBasketId] = useState<string | null>(null);

  // Draft line/polygon being drawn
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [draftObSide, setDraftObSide] = useState<ObSide>("left");

  function selectFeature(id: string) {
    setPlacingTeeId(null); setPlacingBasketId(null);
    setTool({kind:"select"}); setEditingFeatureId(id);
    setPinSelection(null);setSelectedFairway(null);setPanel("features");
    setItemSelectionSerial(Date.now());
    const feature=features.find(f=>f.tempId===id);
    if(feature)setHiddenTypes(previous=>{const next=new Set(previous);next.delete(feature.type);return next;});
  }

  function selectPin(hole: number, kind: "tee" | "basket", id: string) {
    setPlacingTeeId(null); setPlacingBasketId(null);
    setTool({kind:"select"}); setActiveHole(hole);
    setEditingFeatureId(null);
    setPanel(null);setSelectedFairway(null);
    setPinSelection({id:`${kind}:${id}`,serial:Date.now()});
    setItemSelectionSerial(Date.now());
    mapRef.current?.closePopup();
  }

  function assignBaskets(hole: HoleDraft, teeId: string, ids: string[]) {
    try {
      const updated=assignStudioBaskets(hole,teeId,ids);
      setHoles(previous=>previous.map(h=>h.number===hole.number ? updated : h));
    } catch(error) { toast.error((error as Error).message); }
  }

  function openPinFairway(hole: HoleDraft, route?: string) {
    try {
      const draft=studioFairways(hole), key=route ?? Object.keys(draft.network.routes)[0];
      if(!key) return;
      setPanel(null);setPinSelection(null);
      setActiveHole(hole.number);setSelectedFairway({number:hole.number,route:key});
      setTool({kind:"select"});setPlacingTeeId(null);setPlacingBasketId(null);setEditingFeatureId(null);
    } catch(error) {toast.error((error as Error).message);}
  }

  function getDragLatLng(e?: unknown): [number, number] | null {
    const ll = (
      e as { target?: { getLatLng?: () => { lat: number; lng: number } } } | undefined
    )?.target?.getLatLng?.();
    return ll ? [ll.lat, ll.lng] : null;
  }

  function beginFeatureDrag(e?: unknown) {
    stopLeafletBubble(e);
  }

  function getMarkerDragTarget(
    e?: unknown,
  ): { getLatLng: () => { lat: number; lng: number } } | null {
    const target = (
      e as { target?: { getLatLng?: () => { lat: number; lng: number } } } | undefined
    )?.target;
    return typeof target?.getLatLng === "function"
      ? (target as { getLatLng: () => { lat: number; lng: number } })
      : null;
  }

  function beginMarkerDrag(e: unknown, commit: (point: [number, number]) => void) {
    beginFeatureDrag(e);
    const target = getMarkerDragTarget(e);
    if (target && (e as { type?: string })?.type === "dragstart") {
      const ll = target.getLatLng();
      activeMarkerDragRef.current = { target, commit };
      dragStartRef.current = [ll.lat, ll.lng];
    }
  }

  function panMapNearEdge(point: [number, number] | null) {
    const map = mapRef.current;
    if (!map || !point) return;
    if (edgePanFrameRef.current != null) return;
    edgePanFrameRef.current = window.requestAnimationFrame(() => {
      edgePanFrameRef.current = null;
      const size = map.getSize();
      const p = map.latLngToContainerPoint(point);
      const margin = 82;
      const maxStep = 18;
      const scaleStep = (v: number) => Math.max(-maxStep, Math.min(maxStep, Math.round(v / 4)));
      const dx =
        p.x < margin
          ? scaleStep(p.x - margin)
          : p.x > size.x - margin
            ? scaleStep(p.x - (size.x - margin))
            : 0;
      const dy =
        p.y < margin
          ? scaleStep(p.y - margin)
          : p.y > size.y - margin
            ? scaleStep(p.y - (size.y - margin))
            : 0;
      if (dx || dy) map.panBy([dx, dy], { animate: false });
    });
  }

  function continueFeatureDrag(e?: unknown) {
    stopLeafletBubble(e);
    panMapNearEdge(getDragLatLng(e));
  }

  const undoRef = useRef<() => void>(() => {});
  const dragStartRef = useRef<[number, number] | null>(null);
  /** Ends a press on a map item. Returns true only when the item really moved — a plain click never counts as a move. */
  function finishFeatureDrag(e?: unknown, fallbackCommit?: (point: [number, number]) => void): boolean {
    // Let the release reach Leaflet before committing the completed drag.
    if ((e as { type?: string } | undefined)?.type === "mouseup") return false;
    stopLeafletBubble(e);
    const activeDrag = activeMarkerDragRef.current;
    const target = getMarkerDragTarget(e) ?? activeDrag?.target ?? null;
    const commit = activeDrag?.commit ?? fallbackCommit;
    const start = dragStartRef.current;
    const isDragEnd = (e as { type?: string } | undefined)?.type === "dragend";
    const ll0 = target?.getLatLng();
    const moved = !!ll0 && (activeDrag && start
      ? Math.abs(ll0.lat - start[0]) > 1e-7 || Math.abs(ll0.lng - start[1]) > 1e-7
      : isDragEnd);
    let didMove = false;
    if (target && commit && moved) {
      didMove = true;
      const ll = target.getLatLng();
      commit([ll.lat, ll.lng]);
      // Every real move gets a one-tap Undo, so a stray drag is never a lost spot.
      if (activeDrag) {
        toast("Moved on the map", {
          id: "map-move-undo",
          duration: 8000,
          action: { label: "Undo", onClick: () => undoRef.current() },
        });
      }
    }
    activeMarkerDragRef.current = null;
    dragStartRef.current = null;
    setEndpointPreview(null);
    manualPointDragCleanupRef.current?.();
    manualPointDragCleanupRef.current = null;
    if (edgePanFrameRef.current != null) {
      window.cancelAnimationFrame(edgePanFrameRef.current);
      edgePanFrameRef.current = null;
    }
    const map = mapRef.current;
    if (map && !map.dragging.enabled()) map.dragging.enable();
    return didMove;
  }

  useEffect(() => {
    if (mapRef.current && !mapRef.current.dragging.enabled()) mapRef.current.dragging.enable();
    const finishAnyFeatureDrag = () => finishFeatureDrag();
    window.addEventListener("mouseup", finishAnyFeatureDrag);
    window.addEventListener("touchend", finishAnyFeatureDrag);
    window.addEventListener("blur", finishAnyFeatureDrag);
    return () => {
      window.removeEventListener("mouseup", finishAnyFeatureDrag);
      window.removeEventListener("touchend", finishAnyFeatureDrag);
      window.removeEventListener("blur", finishAnyFeatureDrag);
      finishAnyFeatureDrag();
    };
  }, []);

  // Autosave + undo/redo
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Snapshot of the last state written to the database. Drives the unsaved-work
  // indicator and the exit confirmation.
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const historyRef = useRef<{ past: string[]; future: string[]; last: string | null }>({
    past: [],
    future: [],
    last: null,
  });
  const applyingHistoryRef = useRef(false);
  const deletedHoleIdsRef = useRef<Set<string>>(new Set());
  const [, forceHistoryTick] = useState(0);

  // Grow-only: when holeCount increases past current holes, append blanks.
  // Shrinking is handled explicitly through removeHole() so we never truncate
  // saved data behind the user's back (and never fight the sync effect below).
  useEffect(() => {
    if (loading || !loadedReadyRef.current) return;
    setHoles((prev) => {
      if (prev.length >= holeCount) return prev;
      return [
        ...prev,
        ...Array.from({ length: holeCount - prev.length }, (_, i) => makeHole(prev.length + i + 1)),
      ];
    });
    if (activeHole > holeCount) setActiveHole(holeCount);
  }, [holeCount, loading]);

  // Typed hole count is kept as text so partial input ("", "1") never snaps back
  // mid-keystroke; the value is clamped and applied on blur / stepper press.
  const [holeCountDraft, setHoleCountDraft] = useState("18");
  useEffect(() => {
    setHoleCountDraft(String(holeCount));
  }, [holeCount]);

  // Lowering the count trims empty holes from the end. Mapped holes are kept so
  // placed tees/baskets are never dropped silently.
  const applyHoleCount = useCallback(
    (next: number) => {
      const target = Math.max(1, Math.min(36, next));
      if (target === holeCount) {
        setHoleCountDraft(String(holeCount));
        return;
      }
      if (target > holeCount) {
        setHoleCount(target);
        return;
      }
      let kept = holes.length;
      while (kept > target) {
        const last = holes[kept - 1];
        if (!last || last.tee || last.basket) break;
        kept -= 1;
      }
      if (kept > target) {
        toast.info(
          `Kept ${kept} holes — the holes above ${target} already have a tee or basket. Delete them on the Holes step first.`,
        );
      }
      const finalCount = Math.max(target, kept, 1);
      setHoles((prev) => prev.slice(0, finalCount));
      setHoleCount(finalCount);
      setActiveHole((prev) => Math.min(prev, finalCount));
    },
    [holeCount, holes],
  );

  // Keep the top-level holeCount in sync with the actual holes array. Only
  // grows holeCount to match — shrinking is driven by removeHole to avoid a
  // feedback loop with the effect above.
  useEffect(() => {
    if (!loading && holes.length > holeCount) setHoleCount(holes.length);
  }, [holes.length, holeCount, loading]);

  // Guided flow: when switching to a hole that isn't fully placed, auto-arm
  // the correct tool (tee first, then basket) so the builder walks the user
  // through hole-by-hole setup without needing to pick the tool manually.
  useEffect(() => {
    if (loading) return;
    if (proMode) {setTool({kind:"select"});return;}
    const h = holes.find((x) => x.number === activeHole);
    if (!h) return;
    if (!h.tee) setTool({ kind: "tee-basket", placing: "tee" });
    else if (!h.basket) setTool({ kind: "tee-basket", placing: "basket" });
    else setTool({ kind: "select" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHole, loading, proMode]);

  // Guided flow: once the current hole has tee + basket + captured tee-sign
  // image + confirmed OB/mando rules, auto-advance to the next hole so the
  // tee-tool effect above re-arms placement for that hole.
  // Only auto-advance when a hole *transitions* from incomplete to complete
  // while the user is actively on it. Selecting an already-complete hole must
  // never bounce the user forward.
  const prevCompleteRef = useRef<Set<number>>(new Set());
  const prevActiveHoleRef = useRef<number>(activeHole);
  useEffect(() => {
    const h = holes.find((x) => x.number === activeHole);
    if (!h) {
      prevActiveHoleRef.current = activeHole;
      return;
    }
    const hasImg = !!(h.map_snapshot_path || h.map_snapshot_url);
    const hasRules = rulesConfirmed.has(h.number);
    const isComplete = !!(h.tee && h.basket && hasImg && hasRules);
    const wasComplete = prevCompleteRef.current.has(activeHole);
    const activeHoleChanged = prevActiveHoleRef.current !== activeHole;

    if (isComplete) prevCompleteRef.current.add(activeHole);
    else prevCompleteRef.current.delete(activeHole);
    prevActiveHoleRef.current = activeHole;

    if (activeHoleChanged) return;
    if (wasComplete) return;
    if (!isComplete) return;
    if (activeHole >= holeCount) return;

    const t = setTimeout(() => {
      toast.success(`Hole ${activeHole} locked in 🥏`);
      setActiveHole((n) => (n === activeHole ? n + 1 : n));
    }, 500);
    return () => clearTimeout(t);
  }, [holes, rulesConfirmed, activeHole, holeCount]);

  // Renumber holes 1..N based on a new order (mutating array of HoleDrafts).
  // Also remaps every hole-scoped feature reference, the rules-confirmed set,
  // and the active-hole pointer so nothing points at a stale number.
  function remapAfterReorder(
    nextArr: HoleDraft[],
    oldNumberOf: (h: HoleDraft, idx: number) => number,
  ) {
    const map = new Map<number, number>();
    nextArr.forEach((h, i) => {
      const oldNum = oldNumberOf(h, i);
      if (oldNum > 0) map.set(oldNum, i + 1);
    });
    setFeatures((prev) =>
      prev.map((f) => {
        if (!f.hole_numbers) return f;
        const next = f.hole_numbers.map((n) => map.get(n)).filter((n): n is number => n != null);
        return { ...f, hole_numbers: next.length ? next : null };
      }),
    );
    setRulesConfirmed((prev) => {
      const nxt = new Set<number>();
      prev.forEach((n) => {
        const m = map.get(n);
        if (m != null) nxt.add(m);
      });
      return nxt;
    });
    setActiveHole((cur) => map.get(cur) ?? Math.min(cur, nextArr.length));
    return nextArr.map((h, i) => ({ ...h, number: i + 1 }));
  }

  function moveHole(fromNumber: number, dir: -1 | 1) {
    setHoles((prev) => {
      const idx = prev.findIndex((h) => h.number === fromNumber);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return remapAfterReorder(arr, (h) => h.number);
    });
  }

  function insertHoleAt(position: number) {
    // position: 1..holeCount+1 — the new hole will occupy this slot.
    setHoles((prev) => {
      if (prev.length >= 36) {
        toast.error("Max 36 holes");
        return prev;
      }
      const placeholder = makeHole(-1); // sentinel; renumbered below
      const arr = [...prev];
      const pos = Math.max(1, Math.min(prev.length + 1, position));
      arr.splice(pos - 1, 0, placeholder);
      setHoleCount(arr.length);
      // Focus the newly inserted hole after remap.
      queueMicrotask(() => setActiveHole(pos));
      return remapAfterReorder(arr, (h) => h.number);
    });
  }

  function removeHole(num: number) {
    setHoles((prev) => {
      if (prev.length <= 1) {
        toast.error("At least one hole required");
        return prev;
      }
      const removed = prev.find((h) => h.number === num);
      if (removed?.id) deletedHoleIdsRef.current.add(removed.id);
      if(removed) [...removed.extra_tees,...removed.extra_baskets].forEach(p=>removedPinIdsRef.current.add(p.tempId));
      // Preserve the "played" label of every surviving hole. Internally the
      // holes must renumber to 1..N (DB unique constraint + sequential
      // navigation), but the player-facing label should never shift. We
      // freeze the current label into `nickname` for any hole that does not
      // already have one, so hole 16 stays "16" after 13/14/15 are removed.
      const preserved = prev
        .filter((h) => h.number !== num)
        .map((h) => {
          const hasNick = (h.nickname ?? "").trim().length > 0;
          return hasNick ? h : { ...h, nickname: String(h.number) };
        });
      queueMicrotask(() => setHoleCount(preserved.length));
      prevCompleteRef.current = new Set();
      const remapped = remapAfterReorder(preserved, (h) => h.number);
      toast.success(`Deleted hole ${num}`);
      return remapped;
    });
    setPendingDeleteHole(null);
  }

  function requestHoleDelete(num: number) {
    if (holes.length <= 1) return;
    if (pendingDeleteHole === num) {
      removeHole(num);
      return;
    }
    setPendingDeleteHole(num);
    toast.message(`Click delete again to remove Hole ${holeLabelByNumber(holes, num)}`);
  }

  // Load existing course data in edit mode
  useEffect(() => {
    if (!courseId) return;
    let mounted = true;
    loadedReadyRef.current = false;
    setLoading(true);
    setLoadError(null);
    setPositionsUnlocked(false);
    setTeeSetsDraft(null);
    setSavedKey(null);
    userTouchedRef.current = false;
    historyRef.current = {past: [], future: [], last: null};
    (async () => {
      const { data: c, error: courseError } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .maybeSingle();
      if (!mounted) return;
      if (courseError) throw courseError;
      if (!c) throw new Error("This course could not be loaded. Saving is disabled.");
      setName(c.name ?? "");
      setDescription(c.description ?? "");
      setCity(c.city ?? "");
      setStateVal(c.state ?? "");
      setDifficulty(c.difficulty ?? "");

      setBoundaryLocked(!!c.boundary_locked);
      setOverviewSnapshotPath(c.overview_snapshot_path ?? null);
      if (c.overview_snapshot_path) {
        supabase.storage
          .from("hole-media")
          .createSignedUrl(c.overview_snapshot_path, 3600)
          .then(({ data }) => {
            if (data?.signedUrl) setOverviewSnapshotUrl(data.signedUrl);
          });
      }
      const cAny = c as unknown as {
        flythrough_path?: string | null;
        flythrough_url?: string | null;
      };
      setFlythroughPath(cAny.flythrough_path ?? null);
      setFlythroughUrl(cAny.flythrough_url ?? null);

      if (c.latitude != null && c.longitude != null) {
        setCenter([c.latitude, c.longitude]);
        setZoom(17);
      }
      let layoutId: string | undefined;
      let layoutName = "";
      if (requestedLayoutId) {
        const { data: chk, error: layoutError } = await supabase
          .from("course_layouts")
          .select("id, name")
          .eq("id", requestedLayoutId)
          .eq("course_id", courseId)
          .maybeSingle();
        if (layoutError) throw layoutError;
        if (!chk) throw new Error("This layout could not be loaded. Saving is disabled.");
        layoutId = chk.id as string;
        layoutName=chk.name ?? "";
      }
      if (!layoutId) {
        const { data: layouts, error: layoutsError } = await supabase
          .from("course_layouts")
          .select("id, name, is_default")
          .eq("course_id", courseId);
        if (layoutsError) throw layoutsError;
        let remembered: string | null=null;
        try {remembered=window.localStorage.getItem(editorLayoutKey(courseId));}catch{/* Storage unavailable. */}
        layoutId = layouts?.find(l=>l.id===remembered)?.id ?? await pickActiveLayoutId(courseId, layouts ?? []);
        layoutName=layouts?.find(l=>l.id===layoutId)?.name ?? "";
      }
      if (!layoutId) throw new Error("No saved layout was found. Saving is disabled.");

      const { data: holeRows, error: holesError } = await supabase
        .from("holes")
        .select("*")
        .eq("layout_id", layoutId)
        .order("number");
      if (holesError) throw holesError;
      deletedHoleIdsRef.current.clear();
      const holeIds = (holeRows ?? []).map((h) => h.id);
      const [{ data: teeRows, error: teesError }, { data: basketRows, error: basketsError }, { data: featRows, error: featuresError }] = await Promise.all([
        holeIds.length
          ? supabase.from("hole_tees").select("*").in("hole_id", holeIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        holeIds.length
          ? supabase.from("hole_baskets").select("*").in("hole_id", holeIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        supabase
          .from("course_features")
          .select("id, type, geometry, ob_side, label, hole_number, hole_numbers, ref_feature_id, publish_state, layer, event_overlay_id, layout_id")
          .eq("course_id", courseId)
          // One course build: ground (water, woods, paths…) loads from every layout of the course;
          // play rules (OB, mandos, drop zones) only when this layout plays them.
          // Event mode edits only that event's rules; normal mode never shows event-only rules.
          .then(async (res) => {
            const { data: lay, error: rulesError } = await supabase.from("course_layouts").select("played_rule_ids").eq("id", layoutId!).maybeSingle();
            if (res.error) throw res.error;
            if (rulesError) throw rulesError;
            const played = (lay?.played_rule_ids as string[] | null) ?? null;
            const seen = new Set<string>();
            let boundarySeen = false;
            const rows = (res.data ?? [])
              .filter((f: any) => (f.type === "course_boundary" && f.layer !== "event" || (overlayId ? f.event_overlay_id === overlayId : f.layer !== "event")))
              .filter((f: any) => overlayId || layoutPlaysFeature(f, layoutId!, played))
              // This layout's own copy first, so identical copies from other layouts collapse into it.
              .sort((a: any, b: any) => a.type === "course_boundary" && b.type === "course_boundary" ? Number(a.layout_id != null) - Number(b.layout_id != null) || a.id.localeCompare(b.id) : (a.layout_id === layoutId ? 0 : 1) - (b.layout_id === layoutId ? 0 : 1))
              .filter((f: any) => {
                if (f.type === "course_boundary") {if (boundarySeen) return false; boundarySeen = true;}
                if (RULE_FEATURE_TYPES.has(f.type)) return true;
                const k = `${f.type}|${JSON.stringify(f.geometry?.points ?? null)}`;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
              });
            featureLayoutRef.current = new Map(rows.map((f: any) => [f.id as string, (f.layout_id ?? null) as string | null]));
            return { ...res, data: rows };
          }),
      ]);
      if (!mounted) return;
      if (teesError || basketsError || featuresError) throw teesError || basketsError || featuresError;
      savedTeeIdsRef.current = new Set((teeRows ?? []).map(t => t.id));
      savedBasketIdsRef.current = new Set((basketRows ?? []).map(b => b.id));
      setLoadedLayoutId(layoutId);
      setLoadedLayoutName(layoutName);
      removedPinIdsRef.current.clear();
      setDraftCount((featRows ?? []).filter((f: any) => f.publish_state === "draft").length);

      // Never turn interrupted-save rows into extra numbered holes on reload.
      // Preserve the records for recovery and stop writes until numbering is repaired.
      if ((holeRows ?? []).some(h => h.number < 1)) {
        throw new Error("An interrupted save left temporary hole numbers. Your mapped holes are preserved. Saving is paused until the layout is recovered.");
      }
      const sortedHoleRows = [...(holeRows ?? [])].sort((a, b) => a.number - b.number);
      const loadedHoles: HoleDraft[] = sortedHoleRows.map((h: any, idx: number) => {
        const teesForHole = (teeRows ?? []).filter((t: any) => t.hole_id === h.id);
        const basketsForHole = (basketRows ?? []).filter((b: any) => b.hole_id === h.id);
        const tee =
          h.tee_lat != null && h.tee_lng != null
            ? ([h.tee_lat, h.tee_lng] as [number, number])
            : null;
        const basket =
          h.basket_lat != null && h.basket_lng != null
            ? ([h.basket_lat, h.basket_lng] as [number, number])
            : null;
        const savedDistance = h.distance_ft == null ? null : Number(h.distance_ft);
        const loaded:HoleDraft = {
          id: h.id,
          number: h.number,
          par: h.par ?? 3,
          par_confirmed: h.par_confirmed ?? false,
          current_pin: h.current_pin ?? null,
          tee,
          basket,
          tee_name: h.tee_name ?? "Main",
          basket_name: h.basket_name ?? "A",
          tee_color: h.tee_color ?? "#ffffff",
          tee_bearing: h.tee_bearing ?? null,
          basket_color: h.basket_color ?? "#a3e635",
          distance_override: null,
          caddy_notes: h.caddy_notes ?? "",
          nickname: h.nickname ?? "",
          elevation_ft: h.elevation_ft ?? null,
          shot_shape: h.shot_shape ?? "",
          hazards: h.hazards ?? [],
          designer_notes: h.designer_notes ?? "",
          extra_tees: teesForHole.map((t: any) => ({
            tempId: t.id,
            name: t.name ?? "",
            color: t.color ?? "#ffffff",
            lat: t.latitude,
            lng: t.longitude,
            distance_override: null,
            route_mode: (t.route_mode ?? "same") as "same" | "joins" | "own",
            ...readTeePaths(t.flight_path),
            is_drop_zone: !!t.is_drop_zone,
            bearing: t.bearing ?? null,
          })),
          extra_baskets: basketsForHole.map((b: any) => ({
            tempId: b.id,
            name: b.name ?? "",
            color: b.color ?? "#a3e635",
            lat: b.latitude,
            lng: b.longitude,
            ...readBasketPath(b.split_point),
            distance_override: null,
          })),
          flight_path: readPrimaryPath(h.flight_path),
          map_snapshot_path: h.map_snapshot_path ?? null,
          map_snapshot_url: null,
          map_center_lat: h.map_center_lat ?? null,
          map_center_lng: h.map_center_lng ?? null,
          map_zoom: h.map_zoom ?? null,
          flythrough_path: h.flythrough_path ?? null,
          flythrough_url: h.flythrough_url ?? null,
        };
        loaded.distance_override=primaryDistanceOverride(loaded,savedDistance);
        return loaded;
      });
      for (const h of (holeRows ?? []) as any[]) {
        loadedPlacement.set(h.id, {
          tee: `${h.tee_lat},${h.tee_lng}`,
          basket: `${h.basket_lat},${h.basket_lng}`,
          tee_source: h.tee_source ?? null,
          basket_source: h.basket_source ?? null,
        });
      }
      try {
        window.localStorage.setItem(editorLayoutKey(courseId),layoutId);
        checkpointDraft(window.localStorage,layoutDraftKey(courseId,layoutId),{holes:loadedHoles,layoutId,at:Date.now(),source:"server-load"});
      }catch{/* Never prevent a read when device storage is full. */}
      setHoles(loadedHoles);
      setHoleCount(loadedHoles.length);
      loadedReadyRef.current = true;

      const rawFeatRows = (featRows ?? []) as any[];
      // Build id -> tempId map so ob_reference rows can resolve their source.
      const tempIdById = new Map<string, string>();
      const withTempIds = rawFeatRows.map((f) => {
        const tempId = uid();
        tempIdById.set(f.id, tempId);
        return { f, tempId };
      });
      const loadedFeatures: FeatureDraft[] = withTempIds.map(({ f, tempId }) => {
        const legacyHole: number | null = f.hole_number ?? null;
        const arr: number[] | null =
          Array.isArray(f.hole_numbers) && f.hole_numbers.length
            ? (f.hole_numbers as number[])
            : legacyHole != null
              ? [legacyHole]
              : null;
        return {
          tempId,
          id: f.id as string,
          type: f.type,
          points: (f.geometry?.points ?? []) as [number, number][],
          hole_numbers: arr,
          ob_side: (f.ob_side ?? "none") as ObSide,
          label: f.label ?? "",
          ref_tempId: f.ref_feature_id ? (tempIdById.get(f.ref_feature_id) ?? null) : null,
          canopy_m: typeof f.geometry?.canopy_m === "number" ? f.geometry.canopy_m : null,
          bearing: typeof f.geometry?.bearing === "number" ? f.geometry.bearing : null,
        };
      });
      setFeatures(loadedFeatures);
      if (!overlayId && !loadedFeatures.some(f => f.type === "course_boundary" && f.points.length >= 3)) {setPropertyOpen(true); setStep("overview"); setBuilderMode("course");}
      setActiveHole(current => loadedHoles.some(h => h.number === current) ? current : loadedHoles[0]?.number ?? 1);

      const firstTee = loadedHoles.find((h) => h.tee)?.tee;
      if (firstTee) {
        setCenter(firstTee);
        setZoom(18);
      }
      setLoading(false);
    })().catch(error => {
      if (!mounted) return;
      loadedReadyRef.current = false;
      setLoadError(error?.message || "Course data could not be loaded. Saving is disabled.");
      setLoading(false);
    });
    return () => {
      mounted = false;
      loadedReadyRef.current = false;
    };
  }, [courseId, requestedLayoutId, overlayId, layoutReload]);

  // --- Undo/redo history ---
  const snapshotKey = useMemo(
    () =>
      JSON.stringify({
        name,
        description,
        city,
        stateVal,
        address,
        difficulty,
        holeCount,
        holes,
        features, boundaryLocked, overviewSnapshotPath, teeSetsDraft,
      }),
    [name, description, city, stateVal, address, difficulty, holeCount, holes, features, boundaryLocked, overviewSnapshotPath, teeSetsDraft],
  );

  const snapshotRef = useRef(snapshotKey);
  snapshotRef.current = snapshotKey;

  // Record before the next interaction: an immediate Undo must include the move.
  useLayoutEffect(() => {
    if (loading) return;
    const h = historyRef.current;
    if (applyingHistoryRef.current || normalizedSnapshotRef.current === snapshotKey) {
      applyingHistoryRef.current = false;
      normalizedSnapshotRef.current = null;
      h.last = snapshotKey;
      return;
    }
    if (h.last === null || !userTouchedRef.current) {
      h.last = snapshotKey;
      return;
    }
    if (recordEdit(h, snapshotKey)) forceHistoryTick(v => v + 1);
  }, [snapshotKey, loading]);

  /** Prefill the course basics from a public record the builder picked. */
  function applyPublicCourseData(c: PublicCourseCandidate) {
    if (c.name?.trim()) setName(c.name.trim());
    if (c.city) setCity(c.city);
    if (c.state) setStateVal(c.state);
    if (c.holes && c.holes > 0) setHoleCount(Math.max(1, Math.min(36, c.holes)));
    if (c.difficulty) {
      const match = ["Beginner", "Intermediate", "Advanced", "Championship"].find((d) =>
        c.difficulty!.toLowerCase().includes(d.toLowerCase()),
      );
      if (match) setDifficulty(match);
    }
    if (c.description && !description.trim()) setDescription(c.description.slice(0, 2000));
    if (typeof c.latitude === "number" && typeof c.longitude === "number") {
      setCenter([c.latitude, c.longitude]);
      setZoom(16);
    }
  }

  function applySnapshot(json: string) {
    const s = JSON.parse(json);
    applyingHistoryRef.current = true;
    undoToSavedRef.current = json === savedKey;
    // Undo/redo is an explicit removal too, including items added then saved.
    const pinIds = new Set(s.holes.flatMap((h: HoleDraft) => [...h.extra_tees, ...h.extra_baskets].map(p => p.tempId)));
    [...savedTeeIdsRef.current, ...savedBasketIdsRef.current].forEach(id => {
      if (!pinIds.has(id)) removedPinIdsRef.current.add(id);
    });
    holes.forEach(h => { if (h.id && !s.holes.some((next: HoleDraft) => next.id === h.id)) deletedHoleIdsRef.current.add(h.id); });
    features.forEach(f => { if (f.id && !s.features.some((next: FeatureDraft) => next.tempId === f.tempId)) deletedFeatureIdsRef.current.add(f.id); });
    setTeeSetsDraft(s.teeSetsDraft ?? null);
    setName(s.name);
    setDescription(s.description);
    setCity(s.city);
    setStateVal(s.stateVal);
    setAddress(s.address);
    setDifficulty(s.difficulty);
    setHoleCount(s.holeCount);
    setHoles(s.holes);
    setFeatures(s.features);
    setBoundaryLocked(!!s.boundaryLocked);
    setOverviewSnapshotPath(s.overviewSnapshotPath ?? null);
  }
  undoRef.current = () => undo();
  function undo() {
    const h = historyRef.current;
    const prev = undoEdit(h);
    if (prev === null) return;
    applySnapshot(prev);
    forceHistoryTick((v) => v + 1);
  }
  function redo() {
    const h = historyRef.current;
    const next = redoEdit(h);
    if (next === null) return;
    applySnapshot(next);
    forceHistoryTick((v) => v + 1);
  }
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  // Keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl+Shift+Z or Ctrl+Y (redo)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (layoutsOpen || walking || overlayOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement | null)?.isContentEditable
      )
        return;
      if (!mod) {
        // Tool + hole shortcuts (keyboard parity with the on-map controls).
        const key = e.key.toLowerCase();
        if (key === "t") {
          e.preventDefault();
          setTool({ kind: "tee-basket", placing: "tee" });
        } else if (key === "b") {
          e.preventDefault();
          setTool({ kind: "tee-basket", placing: "basket" });
        } else if (key === "escape" || key === "v") {
          setPlacingTeeId(null); setPlacingBasketId(null);
          setTool({ kind: "select" });
        } else if (TOOL_HOTKEYS[key]) {
          e.preventDefault();
          setTool({ kind: "feature", type: TOOL_HOTKEYS[key] });
          setDraftPoints([]);
        } else if (key === "[" || key === "arrowleft") {
          e.preventDefault();
          setActiveHole((n) => Math.max(1, n - 1));
        } else if (key === "]" || key === "arrowright") {
          e.preventDefault();
          setActiveHole((n) => Math.min(holes.length || 1, n + 1));
        }
        return;
      }
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Baseline the saved snapshot once the course finishes loading. Until the
  // user actually touches the editor, follow-up state settling after load
  // (computed distances, normalised features) re-baselines instead of
  // counting as an edit — otherwise opening a course triggered a phantom save.
  const userTouchedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    const mark = () => {
      userTouchedRef.current = true;
    };
    window.addEventListener("pointerdown", mark, { capture: true, once: true });
    window.addEventListener("keydown", mark, { capture: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", mark, { capture: true } as any);
      window.removeEventListener("keydown", mark, { capture: true } as any);
    };
  }, [loading]);
  useEffect(() => {
    if (loading) return;
    setSavedKey((prev) => (prev === null || !userTouchedRef.current ? snapshotKey : prev));
  }, [loading, snapshotKey]);
  const [mapMenu, setMapMenu] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);

  const unsavedChanges = savedKey !== null && savedKey !== snapshotKey;

  // Offline safety net (Walk & Map without signal): unsaved hole changes are
  // kept on this device, offered back on next open, and saved on reconnect.
  const legacyDraftKey = courseId ? `dgd:course-offline-draft:${courseId}` : null;
  const offlineDraftKey = courseId && loadedLayoutId ? layoutDraftKey(courseId,loadedLayoutId) : null;
  const [offlineDraft, setOfflineDraft] = useState<{ holes: HoleDraft[]; at: number; layoutId?: string } | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (!offlineDraftKey || loading || !loadedReadyRef.current) return;
    try {
      setOfflineDraft(null);
      for(const key of [offlineDraftKey,legacyDraftKey]) {
        if(!key)continue;
        const raw=window.localStorage.getItem(key);
        if(!raw)continue;
        const candidate=JSON.parse(raw);
        if(key===legacyDraftKey && window.localStorage.getItem(offlineDraftKey+":reviewed-legacy-at")===String(candidate.at))continue;
        if(loadedLayoutId && draftBelongsToLayout(candidate,loadedLayoutId,holes)) {setOfflineDraft(candidate);break;}
      }
    } catch {
      /* unreadable draft is ignored */
    }
    // Only on first load of this course.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineDraftKey, loading]);
  useEffect(() => {
    if (!offlineDraftKey || loading || !loadedReadyRef.current) return;
    if (unsavedChanges && userTouchedRef.current) {
      try {
        const prior=window.localStorage.getItem(offlineDraftKey);
        if(prior)checkpointDraft(window.localStorage,offlineDraftKey,JSON.parse(prior));
        window.localStorage.setItem(offlineDraftKey, JSON.stringify({ holes, layoutId:loadedLayoutId, at: Date.now() }));
      } catch {
        /* storage full — nothing else to do */
      }
    }
    // An explicit Undo back to the saved map must not offer the cancelled move
    // for recovery on reload. Retain its archive, but remove the pending draft.
    if (!unsavedChanges && undoToSavedRef.current) {
      undoToSavedRef.current = false;
      try {
        const prior = window.localStorage.getItem(offlineDraftKey);
        if (prior) checkpointDraft(window.localStorage, offlineDraftKey, JSON.parse(prior));
        window.localStorage.removeItem(offlineDraftKey);
        setOfflineDraft(null);
      } catch { /* Retain the draft if archiving fails. */ }
    }
  }, [offlineDraftKey, loading, unsavedChanges, holes, savedKey]);
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (!online) { wasOfflineRef.current = true; return; }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      if (unsavedChanges) toast("Back online. Choose Save changes when your map is ready.");
    }
  }, [online, unsavedChanges]);

  // Browser-level guard: never let a tab close swallow unsaved edits.
  useEffect(() => {
    if (!unsavedChanges) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsavedChanges]);

  function exitBuilder() {
    setConfirmExit(false);
    if (isEdit && courseId) {
      navigate({ to: "/courses/$courseId", params: { courseId } });
      return;
    }
    navigate({ to: "/courses" });
  }

  function requestExit() {
    if (unsavedChanges) {
      setConfirmExit(true);
      return;
    }
    exitBuilder();
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter([pos.coords.latitude, pos.coords.longitude]);
        setZoom(18);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  // Tees and baskets may only be placed once the course itself is set up and
  // the builder has reached the hole-building step. In the guided wizard that
  // means stage 4 ("Build each hole"); in pro mode it means the Holes tab.
  const holePlacementReady = step === "holes" && !!name.trim() && boundaryLocked && boundaryPoints.length >= 3 && (proMode || isEdit || stage >= 4);
  const holePlacementBlockedMessage = !name.trim()
    ? "Name your course first, then build the holes."
    : !boundaryLocked || boundaryPoints.length < 3
      ? "Draw and lock the property line first."
      : step === "holes"
      ? "Finish the course setup steps, then place tees and baskets."
      : "Switch to the Holes step to place tees and baskets.";

  // Drop the current hole's tee or basket at the user's live GPS coordinates.
  // High-accuracy fix, warns if signal is fuzzy but still drops so the user
  // can drag to adjust. Feels like the "Drop pin at my location" action in
  // course-builder game UIs.
  function gpsDropCurrent(target: "tee" | "basket") {
    if (!holePlacementReady) return toast.info(holePlacementBlockedMessage);
    if (!navigator.geolocation) return toast.error("GPS not available on this device");
    setGpsBusy(target);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        const acc = pos.coords.accuracy ?? null;
        setGpsAccuracy(acc);
        setHoles((prev) =>
          prev.map((h) => (h.number === activeHole ? ({ ...h, [target]: point } as HoleDraft) : h)),
        );
        setCenter(point);
        setZoom(20);
        setGpsBusy(null);
        if (acc != null && acc > 10) {
          toast.warning(`Dropped ${target} · GPS ±${Math.round(acc)}m — drag to fine-tune`);
        } else {
          toast.success(
            `Dropped ${target} at your location${acc != null ? ` (±${Math.round(acc)}m)` : ""} 🎯`,
          );
        }
      },
      (err) => {
        setGpsBusy(null);
        toast.error(err.message || "Could not get GPS fix");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function locateAddress() {
    const parts = [address, city, stateVal].map((s) => s.trim()).filter(Boolean);
    if (!name.trim() && parts.length === 0) {
      toast.error("Add a course name, city/state, or address");
      return;
    }
    const query = parts.length ? parts.join(", ") : name.trim();
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Lookup failed");
      const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (!data.length) {
        toast.error("No location found — try adding more detail");
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      setCenter([lat, lng]);
      setZoom(parts.length && address.trim() ? 19 : 17);
      toast.success(data[0].display_name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setGeocoding(false);
    }
  }

  // Resolve signed URLs for previously saved snapshots (edit mode)
  useEffect(() => {
    const pending = holes.filter((h) => h.map_snapshot_path && !h.map_snapshot_url);
    if (!pending.length) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        pending.map(async (h) => {
          const { data } = await supabase.storage
            .from("hole-media")
            .createSignedUrl(h.map_snapshot_path!, 3600);
          return { n: h.number, url: data?.signedUrl ?? null };
        }),
      );
      if (cancelled) return;
      setHoles((prev) =>
        prev.map((h) => {
          const hit = results.find((r) => r.n === h.number);
          return hit && hit.url ? { ...h, map_snapshot_url: hit.url } : h;
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [holes.map((h) => h.map_snapshot_path).join("|")]);

  async function captureHoleSnapshot() {
    if (!user) return toast.error("Sign in first");
    if (!mapWrapRef.current || !mapRef.current) return toast.error("Map not ready");
    const map = mapRef.current;
    const wrap = mapWrapRef.current;
    const h = holes.find((x) => x.number === activeHole);
    const rect = wrap.getBoundingClientRect();
    // Portrait tee-sign aspect (3:4). Cap width for reasonable file size.
    const sourceW = Math.max(360, Math.floor(rect.width));
    const sourceH = Math.max(360, Math.floor(rect.height));
    setCapturing(true);
    try {
      // Capture exactly what the user has framed. Do not resize, refit, or
      // invalidate the live map; those operations visibly nudge the camera.
      const c = map.getCenter();
      const z = map.getZoom();
      const screenDataUrl = await toPng(wrap, {
        cacheBust: true,
        pixelRatio: 2,
        width: sourceW,
        height: sourceH,
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          if (node.classList?.contains("leaflet-control-container") || node.classList?.contains("course-reference-overlay")) return false;
          return true;
        },
      });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const ratio = 3 / 4;
          const iw = img.naturalWidth;
          const ih = img.naturalHeight;
          let sx = 0;
          let sy = 0;
          let sw = iw;
          let sh = ih;
          if (iw / ih > ratio) {
            sw = Math.round(ih * ratio);
            sx = Math.round((iw - sw) / 2);
          } else {
            sh = Math.round(iw / ratio);
            sy = Math.round((ih - sh) / 2);
          }
          const canvas = document.createElement("canvas");
          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Could not prepare tee sign image"));
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("Could not crop tee sign image"));
        img.src = screenDataUrl;
      });
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${user.id}/${courseId ?? "draft"}/hole-${activeHole}-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("hole-media")
        .upload(path, blob, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("hole-media")
        .createSignedUrl(path, 3600);
      setHoles((prev2) =>
        prev2.map((hh) =>
          hh.number === activeHole
            ? {
                ...hh,
                map_snapshot_path: path,
                map_snapshot_url: signed?.signedUrl ?? null,
                map_center_lat: c.lat,
                map_center_lng: c.lng,
                map_zoom: z,
              }
            : hh,
        ),
      );
      toast.success(`Tee sign image captured for hole ${activeHole}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setCapturing(false);
    }
  }

  async function captureOverviewSnapshot() {
    if (!user) return toast.error("Sign in first");
    if (!mapWrapRef.current || !mapRef.current) return toast.error("Map not ready");
    if (!boundaryLocked || boundaryPoints.length < 3) {setPropertyOpen(true); return toast.error("Draw and lock the property line before capturing the overview.");}
    const map = mapRef.current;
    setCapturingOverview(true);
    try {
      // Every layout uses the same locked course property for its overview.
      map.fitBounds(L.latLngBounds(boundaryPoints), {padding: [40, 40], animate: false});
      await new Promise((r) => setTimeout(r, 500));
      const dataUrl = await toPng(mapWrapRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          if (node.classList?.contains("leaflet-control-container") || node.classList?.contains("course-reference-overlay")) return false;
          return true;
        },
      });
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${user.id}/${courseId ?? "draft"}/overview-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("hole-media")
        .upload(path, blob, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("hole-media")
        .createSignedUrl(path, 3600);
      setOverviewSnapshotPath(path);
      setOverviewSnapshotUrl(signed?.signedUrl ?? null);
      toast.success("Course overview captured.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setCapturingOverview(false);
    }
  }

  // Guided mode: on entering stage 3, auto-capture the overview snapshot once.
  useEffect(() => {
    if (proMode) return;
    if (stage !== 3) return;
    if (overviewAutoRanRef.current) return;
    if (!features.some((f) => f.type === "course_boundary" && f.points.length >= 3)) return;
    overviewAutoRanRef.current = true;
    // Small delay so the map settles after the panel change.
    const t = setTimeout(() => {
      void captureOverviewSnapshot();
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, proMode]);

  /** Warn (never block) when a placed point falls outside the property line. */
  function warnIfOutsideBoundary(point: [number, number], label: string) {
    const b = features.find((f) => f.type === "course_boundary");
    if (!b || b.points.length < 3) return;
    if (!pointInPolygon(point, b.points as [number, number][])) {
      toast.warning(`${label} is outside the property boundary — that area plays as OB.`);
    }
  }

  /**
   * Existing vertices new drawing points can snap onto, so shared corners line
   * up exactly instead of leaving hairline gaps between adjoining shapes.
   */
  function snapCandidates(): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    for (const f of features) for (const p of f.points) pts.push([p[0], p[1]]);
    for (const p of draftPoints) pts.push([p[0], p[1]]);
    return pts;
  }

  function handleMapClick(ll: LatLng) {
    const rawPoint: [number, number] = [ll.lat, ll.lng];
    const point: [number, number] =
      tool.kind === "feature" && snapEnabled
        ? snapToNearbyVertex(rawPoint, snapCandidates())
        : rawPoint;
    // Tees and baskets belong to the hole-building stage. Block them while the
    // course is still being located, named, or bounded so a stray map click
    // can't create hole geometry before the course exists.
    if ((placingTeeId || placingBasketId || tool.kind === "tee-basket") && !holePlacementReady) {
      toast.info(holePlacementBlockedMessage);
      if (tool.kind === "tee-basket") setTool({ kind: "select" });
      setPlacingTeeId(null);
      setPlacingBasketId(null);
      toast.success("Basket placed. Drag it to fine-tune.", { id: "place-pad" });
      return;
    }

    if (placingTeeId) {
      setHoles((prev) =>
        prev.map((h) =>
          h.number === activeHole
            ? {
                ...h,
                extra_tees: h.extra_tees.map((t) =>
                  t.tempId === placingTeeId ? { ...t, lat: point[0], lng: point[1] } : t,
                ),
              }
            : h,
        ),
      );
      setPlacingTeeId(null);
      toast.success("Tee pad placed. Drag it to fine-tune.", { id: "place-pad" });
      return;
    }
    if (placingBasketId) {
      setHoles((prev) =>
        prev.map((h) =>
          h.number === activeHole
            ? {
                ...h,
                extra_baskets: h.extra_baskets.map((b) =>
                  b.tempId === placingBasketId ? { ...b, lat: point[0], lng: point[1] } : b,
                ),
              }
            : h,
        ),
      );
      setPlacingBasketId(null);
      toast.success("Basket placed. Drag it to fine-tune.", { id: "place-pad" });
      return;
    }
    if (tool.kind === "tee-basket") {
      const target = tool.placing; // "tee" | "basket"
      const currentHole = holes.find((h) => h.number === activeHole);
      // An explicitly selected placement tool adds another asset; it never
      // relocates an existing endpoint or changes its saved routes.
      if (currentHole && (currentHole[target] || tool.identity?.role === "alternate" || tool.identity?.role === "drop_zone")) {
        const id = uid();
        setHoles(previous=>previous.map(h=>h.number!==activeHole ? h : target==="tee"
          ? {...h,extra_tees:[...h.extra_tees,{tempId:id,name:tool.identity?.name || endpointRoleLabel("tee", tool.identity?.role ?? "alternate"),color:tool.identity?.color ?? "#2563eb",lat:point[0],lng:point[1],distance_override:null,is_drop_zone:tool.identity?.role === "drop_zone"}]}
          : {...h,extra_baskets:[...h.extra_baskets,{tempId:id,name:tool.identity?.name || "Alternate basket",color:tool.identity?.color ?? "#a3e635",lat:point[0],lng:point[1],distance_override:null}]}));
        selectPin(activeHole,target,id);
        toast.success(`${tool.identity?.name ?? (target === "tee" ? "Tee pad" : "Basket")} added. Edit its name, color and connections here.`);
        return;
      }
      setHoles((prev) =>
        prev.map((h) => (h.number === activeHole ? ({ ...h, [target]: point, ...(tool.identity ? target === "tee" ? {tee_name:tool.identity.name,tee_color:tool.identity.color} : {basket_name:tool.identity.name,basket_color:tool.identity.color} : {}) } as HoleDraft) : h)),
      );
      // Guided flow: after tee, auto-arm basket tool; after basket, return to select.
      if (target === "tee") {
        const hasBasket = !!(currentHole && currentHole.basket);
        setTool(hasBasket ? { kind: "select" } : { kind: "tee-basket", placing: "basket" });
      } else {
        setTool({ kind: "select" });
      }
      toast.success(`${target === "tee" ? "Tee" : "Basket"} placed on Hole ${activeHole}.`);
      warnIfOutsideBoundary(point, target === "tee" ? "That tee" : "That basket");
      {
        const other = target === "tee" ? currentHole?.basket : currentHole?.tee;
        if (other) {
          const warning = holeLengthWarning(feetBetween(point, other as [number, number]));
          if (warning) toast.warning(warning);
        }
      }
      return;
    }

    if (tool.kind === "ob-ref") {
      // Build candidate list of OB sources: course-wide OB lines / areas, plus
      // the course property boundary (so a hole can reference a segment of the
      // boundary as OB).
      const sources = features
        .filter((f) => f.type === "ob_line" || f.type === "ob_area" || f.type === "course_boundary")
        .filter((f) => f.points.length >= 2)
        .map((f) => ({
          key: f.tempId,
          pts: f.points.map((p) => [p[0], p[1]] as GeoLatLng),
          closed: f.type === "ob_area" || f.type === "course_boundary",
        }));
      const click: GeoLatLng = [ll.lat, ll.lng];
      const hit = findNearestObSource(click, sources, 80);
      if (!hit) {
        toast.error("Click near an existing OB line or OB area edge");
        return;
      }
      if (!tool.draft) {
        setTool({
          kind: "ob-ref",
          draft: { sourceTempId: hit.key, startPoint: [hit.proj.point[0], hit.proj.point[1]] },
        });
        toast.message("Start point set — click the end point on the same OB");
        return;
      }
      if (tool.draft.sourceTempId !== hit.key) {
        toast.error("End point must be on the same OB feature");
        return;
      }
      const src = features.find((f) => f.tempId === hit.key);
      if (!src) return;
      const srcPts: GeoLatLng[] = src.points.map((p) => [p[0], p[1]] as GeoLatLng);
      const closed = src.type === "ob_area" || src.type === "course_boundary";
      const startProj = findNearestObSource(
        [tool.draft.startPoint[0], tool.draft.startPoint[1]] as GeoLatLng,
        [{ key: "s", pts: srcPts, closed }],
        1000,
      );
      if (!startProj) return;
      const segment = extractSubPath(srcPts, closed, startProj.proj, hit.proj);
      if (!segment || segment.length < 2) {
        toast.error("Could not build reference segment");
        return;
      }
      const newId = uid();
      setFeatures((prev) => [
        ...prev,
        {
          tempId: newId,
          id: null,
          type: "ob_reference",
          points: segment.map((p) => [p[0], p[1]] as [number, number]),
          hole_numbers: [activeHole],
          ob_side: draftObSide,
          label: "",
          ref_tempId: hit.key,
        },
      ]);
      setEditingFeatureId(newId);
      setTool({ kind: "select" });
      toast.success(
        `OB reference added for Hole ${activeHole}. Set the OB side in the feature editor.`,
      );
      return;
    }
    if (tool.kind !== "feature") return; // select mode: do nothing on map click
    // feature tool
    const cfg = FEATURE_CONFIG[tool.type];
    if (cfg.geom === "point") {
      const newId = uid();
      setFeatures((prev) => [
        ...prev,
        {
          tempId: newId,
          id: null,
          type: tool.type,
          points: [point],
          hole_numbers: attachToHole ? [activeHole] : null,
          ob_side: "none",
          label: "",
          ref_tempId: null,
        },
      ]);
      setEditingFeatureId(newId);
      setTool({ kind: "select" });
    } else {
      setDraftPoints((prev) => [...prev, point]);
    }
  }

  function finishDraft() {
    if (tool.kind !== "feature") return;
    const cfg = FEATURE_CONFIG[tool.type];
    if (cfg.geom === "line" && draftPoints.length < 2) return toast.error("Add at least 2 points");
    if (cfg.geom === "polygon" && draftPoints.length < 3)
      return toast.error("Add at least 3 points");
    // Only one property boundary per course.
    if (tool.type === "course_boundary" && features.some((f) => f.type === "course_boundary")) {
      toast.error("Course already has a property boundary — edit or delete it first.");
      setDraftPoints([]);
      return;
    }
    const newId = uid();
    setFeatures((prev) => [
      ...prev,
      {
        tempId: newId,
        id: null,
        type: tool.type,
        // Boundary is always course-wide.
        points: draftPoints,
        hole_numbers: tool.type === "course_boundary" ? null : attachToHole ? [activeHole] : null,
        ob_side: tool.type === "ob_line" ? draftObSide : "none",
        label: "",
        ref_tempId: null,
      },
    ]);
    setEditingFeatureId(newId);
    setDraftPoints([]);
    if (tool.type === "course_boundary") {
      setTool({ kind: "select" });
      setPropertyOpen(true); setEditingFeatureId(null); setPanel(null);
      toast.success("Property line drawn. Lock it when the outline is correct.");
    }
  }

  function cancelDraft() {
    setDraftPoints([]);
  }

  function clearHole(n: number) {
    setHoles((prev) => prev.map((h) => (h.number === n ? { ...h, tee: null, basket: null } : h)));
  }

  // Re-home a tee or basket on another hole: fills the main slot if empty, else adds an alternate.
  function moveHolePadTo(kind: "tee" | "basket", to: number, pt: [number, number], name: string, color: string) {
    setHoles((prev) =>
      prev.map((x) => {
        if (x.number !== to) return x;
        if (kind === "tee") {
          if (!x.tee) return { ...x, tee: pt, tee_name: name, tee_color: color };
          return { ...x, extra_tees: [...x.extra_tees, { tempId: uid(), name, color, lat: pt[0], lng: pt[1], distance_override: null }] };
        }
        if (!x.basket) return { ...x, basket: pt, basket_name: name, basket_color: color };
        return { ...x, extra_baskets: [...x.extra_baskets, { tempId: uid(), name, color, lat: pt[0], lng: pt[1], distance_override: null }] };
      }),
    );
  }

  function removeFeature(id: string) {
    setFeatures((prev) => {
      const removed = prev.find((f) => f.tempId === id);
      if (removed?.id) deletedFeatureIdsRef.current.add(removed.id);
      return prev.filter((f) => f.tempId !== id);
    });
  }

  const current = holes.find((h) => h.number === activeHole);
  const parTotal = useMemo(() => holes.reduce((s, h) => s + h.par, 0), [holes]);
  const measuredRoutes=useMemo(()=>new Map(holes.map(h=>{
    try {const d=studioFairways(h);return [h.number,{draft:d,geometry:createFairwayGeometry(d)}] as const;}catch{return [h.number,null] as const;}
  })),[holes]);
  const measuredDistance=(h:HoleDraft,key="main-tee/main-basket")=>{
    const d=measuredRoutes.get(h.number);return d?.draft.network.routes[key]?d.geometry.distance(key):0;
  };
  const holeDistance = (h: HoleDraft) =>
    h.distance_override != null
      ? h.distance_override
      : h.tee && h.basket
        ? measuredDistance(h)
        : 0;
  const distTotal = useMemo(() => holes.reduce((s, h) => s + holeDistance(h), 0), [holes]);

  // Full design intelligence for this layout: hazard counts, OB footage,
  // water/island holes, longest & shortest hole. Saved with the layout so the
  // rest of the app can read the course without re-deriving geometry.
  const designSummary = useMemo(
    () =>
      summarizeLayout(
        holes.map((h) => ({
          number: h.number,
          par: h.par,
          distance_ft:
            h.distance_override != null
              ? h.distance_override
              : h.tee && h.basket
                ? measuredDistance(h)
                : null,
          tee: h.tee,
          basket: h.basket,
          elevation_ft: h.elevation_ft,
          shot_shape: effectiveShotShape(h),
          hazards: h.hazards,
        })),
        features.map((f) => ({
          type: f.type,
          points: f.points,
          hole_numbers: f.hole_numbers,
        })),
      ),
    [holes, features],
  );
  const designGapList = useMemo(() => designGaps(designSummary), [designSummary]);
  const designHighlightList = useMemo(() => designHighlights(designSummary), [designSummary]);
  const layoutDesignColumns = useMemo(
    () => ({
      mando_count: designSummary.mando_count,
      dropzone_count: designSummary.dropzone_count,
      ob_line_feet: designSummary.ob_line_feet,
      ob_area_count: designSummary.ob_area_count,
      water_hole_count: designSummary.water_hole_count,
      island_green_count: designSummary.island_green_count,
      longest_hole_ft: designSummary.longest_hole_ft,
      shortest_hole_ft: designSummary.shortest_hole_ft,
      design_summary: designSummary as unknown as Json,
      design_updated_at: new Date().toISOString(),
    }),
    [designSummary],
  );

  const holeFeatures = features.filter(
    (f) =>
      !hiddenTypes.has(f.type) &&
      (f.type === "course_boundary" || showAllHoleItems ||
        f.tempId === editingFeatureId ||
        f.hole_numbers?.includes(activeHole)),
  );

  const axisForFeature = (f: {
    hole_numbers?: number[] | null;
  }): { tee: [number, number]; basket: [number, number] } | null => {
    const nums =
      Array.isArray(f.hole_numbers) && f.hole_numbers.length ? f.hole_numbers : [activeHole];
    // Prefer the currently-active hole's axis when the feature applies to it,
    // so multi-hole OB features orient arrows/labels relative to the hole
    // being viewed (not just the first hole in the list).
    const ordered = nums.includes(activeHole)
      ? [activeHole, ...nums.filter((n) => n !== activeHole)]
      : nums;
    for (const n of ordered) {
      const h = holes.find((x) => x.number === n);
      if (h?.tee && h?.basket) return { tee: h.tee, basket: h.basket };
    }
    const h = holes.find((x) => x.number === activeHole);
    if (h?.tee && h?.basket) return { tee: h.tee, basket: h.basket };
    return null;
  };

  const boundaryPtsForOb: [number, number][] | null = (() => {
    const b = features.find((f) => f.type === "course_boundary");
    const pts = (b?.points ?? []) as [number, number][];
    return pts.length >= 3 ? pts : null;
  })();

  const avoidPtsForOb: Array<[number, number]> = (() => {
    const arr: Array<[number, number]> = [];
    for (const h of holes) {
      if (h.tee) arr.push(h.tee);
      if (h.basket) arr.push(h.basket);
    }
    return arr;
  })();

  // Shared assignment editor used in map popups and lists.
  function AssignmentPicker({ f }: { f: (typeof features)[number] }) {
    const isCourseWide = f.hole_numbers == null;
    const setAll = () =>
      setFeatures((prev) =>
        prev.map((x) => (x.tempId === f.tempId ? { ...x, hole_numbers: null } : x)),
      );
    const setOnly = (n: number) =>
      setFeatures((prev) =>
        prev.map((x) => (x.tempId === f.tempId ? { ...x, hole_numbers: [n] } : x)),
      );
    const toggle = (n: number) =>
      setFeatures((prev) =>
        prev.map((x) => {
          if (x.tempId !== f.tempId) return x;
          const cur = x.hole_numbers ?? [];
          const next = cur.includes(n)
            ? cur.filter((h) => h !== n)
            : [...cur, n].sort((a, b) => a - b);
          return { ...x, hole_numbers: next.length ? next : [activeHole] };
        }),
      );
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            Applies to
          </span>
          <button
            type="button"
            onClick={setAll}
            className={`ml-auto inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] border ${isCourseWide ? "bg-amber-500 text-amber-50 border-amber-500" : "border-input text-muted-foreground hover:bg-muted"}`}
          >
            <Globe2 className="h-2.5 w-2.5" />
            Course-wide
          </button>
          <button
            type="button"
            onClick={() => setOnly(activeHole)}
            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] border ${!isCourseWide && f.hole_numbers!.length === 1 && f.hole_numbers![0] === activeHole ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-muted"}`}
          >
            <Pin className="h-2.5 w-2.5" />
            Only H{activeHole}
          </button>
        </div>
        <div
          className={`flex flex-wrap gap-0.5 ${isCourseWide ? "opacity-40 pointer-events-none" : ""}`}
        >
          {holes.map((h) => {
            const on = !isCourseWide && f.hole_numbers!.includes(h.number);
            return (
              <button
                key={h.number}
                type="button"
                onClick={() => toggle(h.number)}
                title={`Hole ${holeLabel(h)}`}
                className={`h-6 min-w-6 px-1 rounded text-[10px] border ${on ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-muted"}`}
              >
                {holeLabel(h)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  async function save() {
    if (!user || loading || layoutsOpen || !loadedReadyRef.current || saveInFlightRef.current) return false;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      if (!name.trim()) throw new Error("Give your course a name");
      // Validate every route before any database write. Keep durable identities
      // in state even when a request fails, so a retry updates the same rows.
      const shapedHoles = holes.map(h => persistentStudioPins(applyStudioFairways({...h, id: h.id || crypto.randomUUID()}, studioFairways(h))));
      normalizedSnapshotRef.current = JSON.stringify({...JSON.parse(snapshotKey), holes: shapedHoles});
      setHoles(shapedHoles);
      try {
        if (offlineDraftKey) {
          const checkpoint={holes:shapedHoles,layoutId:loadedLayoutId,at:Date.now()};
          checkpointDraft(window.localStorage,offlineDraftKey,checkpoint);
          window.localStorage.setItem(offlineDraftKey + ":before-save", JSON.stringify(checkpoint));
        }
      } catch { /* A full browser disk must not delete existing server rows. */ }
      assertExplicitPinRemoval(savedTeeIdsRef.current,new Set(shapedHoles.flatMap(h=>h.extra_tees.map(t=>t.tempId))),removedPinIdsRef.current);
      assertExplicitPinRemoval(savedBasketIdsRef.current,new Set(shapedHoles.flatMap(h=>h.extra_baskets.map(b=>b.tempId))),removedPinIdsRef.current);
      const preparedPins = shapedHoles.map(h => ({h, paths: studioFairways(h), tees: h.extra_tees.map(t => writeTeePaths(t) as Json), baskets: h.extra_baskets.map(b => writeBasketPath(b) as Json)}));
      const holeRows = shapedHoles.map((h) => ({
        id: h.id,
        layout_id: loadedLayoutId ?? "",
        number: h.number,
        par: h.par,
        ...(h.par_confirmed ? { par_confirmed: true } : {}),
        current_pin: h.current_pin ?? null,
        distance_ft: holeDistance(h) || null,
        tee_lat: h.tee?.[0] ?? null,
        tee_lng: h.tee?.[1] ?? null,
        basket_lat: h.basket?.[0] ?? null,
        basket_lng: h.basket?.[1] ?? null,
        ...placementProvenance(h),
        tee_name: h.tee_name.trim() || null,
        basket_name: h.basket_name.trim() || null,
        tee_color: h.tee_color || null,
        tee_bearing: h.tee_bearing ?? null,
        basket_color: h.basket_color || null,
        caddy_notes: h.caddy_notes.trim() || null,
        nickname: h.nickname.trim() || null,
        elevation_ft: h.elevation_ft,
        shot_shape: effectiveShotShape(h),
        hazards: h.hazards,
        designer_notes: h.designer_notes.trim() || null,
        map_snapshot_path: h.map_snapshot_path,
        map_center_lat: h.map_center_lat,
        map_center_lng: h.map_center_lng,
        map_zoom: h.map_zoom,
        flight_path: h.flight_path,
        flythrough_path: h.flythrough_path,
        flythrough_url: h.flythrough_url,
      }));
      const teeRows: Array<{
        route_mode?: string;
        flight_path?: Json;
        id?: string;
        split_point?: Json;
        is_drop_zone?: boolean;
        bearing?: number | null;
        hole_id: string;
        name: string;
        color: string | null;
        distance_ft: number | null;
        latitude: number | null;
        longitude: number | null;
        sort_order: number;
      }> = [];
      const basketRows: typeof teeRows = [];
      shapedHoles.forEach((h) => {
        const prepared = preparedPins.find(p => p.h.id === h.id)!;
        const paths = prepared.paths;
        h.extra_tees.forEach((t, i) => {
          const dist =
            t.distance_override != null
              ? t.distance_override
              : t.lat != null && t.lng != null && h.basket
                ? paths.network.routes[`${t.tempId}/main-basket`]?pairSummary(h,paths,`${t.tempId}/main-basket`).distance:null
                : null;
          teeRows.push({
            id: t.tempId,
            hole_id: h.id!,
            name: endpointName("tee", t.tempId, t.name, t.is_drop_zone),
            color: t.color || null,
            distance_ft: dist,
            latitude: t.lat,
            longitude: t.lng,
            sort_order: i,
            route_mode: t.route_mode ?? "same",
            flight_path: prepared.tees[i],
            is_drop_zone: !!t.is_drop_zone,
            bearing: t.bearing ?? null,
          });
        });
        h.extra_baskets.forEach((b, i) => {
          const dist =
            b.distance_override != null
              ? b.distance_override
              : b.lat != null && b.lng != null && h.tee
                ? paths.network.routes[`main-tee/${b.tempId}`]?pairSummary(h,paths,`main-tee/${b.tempId}`).distance:null
                : null;
          basketRows.push({
            id: b.tempId,
            hole_id: h.id!,
            name: endpointName("basket", b.tempId, b.name),
            color: b.color || null,
            distance_ft: dist,
            latitude: b.lat,
            longitude: b.lng,
            sort_order: i,
            split_point: prepared.baskets[i],
          });
        });
      });
      let existingHoles: {id: string; number: number}[] = [];
      if (isEdit && loadedLayoutId) {
        const result = await supabase.from("holes").select("id, number").eq("layout_id", loadedLayoutId);
        if (result.error) throw result.error;
        existingHoles = result.data ?? [];
        assertCompleteHoleSave(existingHoles, shapedHoles, deletedHoleIdsRef.current);
        const knownIds = new Set(existingHoles.map(h => h.id));
        const addedIds = shapedHoles.map(h => h.id!).filter(id => !knownIds.has(id));
        if (addedIds.length) {
          const {data: otherRows, error} = await supabase.from("holes").select("id, layout_id").in("id", addedIds);
          if (error) throw error;
          if (otherRows?.some(h => h.layout_id !== loadedLayoutId)) throw new Error("This draft contains holes belonging to another layout. Saving is paused to preserve both layouts.");
        }
      }
      await paletteRef.current?.flush(teeSetsDraft ?? undefined);
      const firstTee = holes.find((h) => h.tee)?.tee ?? center;
      // Store states as two-letter codes so directory filters, map pins and
      // "courses near me" defaults all match the rest of the library.
      const rawState = stateVal.trim();
      const normalizedState = rawState
        ? (normalizeStateCode(rawState) ?? rawState.toUpperCase().slice(0, 2))
        : null;
      let courseIdFinal: string;
      let layoutIdFinal: string;

      if (isEdit && courseId) {
        courseIdFinal = courseId;

        if (loadedLayoutId) {
          layoutIdFinal = loadedLayoutId;
          // Do not bulk-delete course_features here. Features are synced below
          // by id/upsert; deleting first makes saved OB/water disappear on the
          // next save because existing feature ids then update zero rows.
          if (existingHoles.some(h => { const draft = shapedHoles.find(d => d.id === h.id); return draft && draft.number !== h.number; })) {
            const { error: rnErr } = await supabase.rpc("begin_layout_hole_renumber", {_layout: loadedLayoutId});
            if (rnErr) throw rnErr;
          }
        } else {
          const { data: layout, error: lErr } = await supabase
            .from("course_layouts")
            .insert({
              course_id: courseIdFinal,
              name: "Main",
              hole_count: holeCount,
              par_total: parTotal,
              distance_total: distTotal,
              ...layoutDesignColumns,
              is_default: true,
            })
            .select("id")
            .single();
          if (lErr) throw lErr;
          layoutIdFinal = layout!.id;
        }
      } else {
        const slug =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "") +
          "-" +
          Math.random().toString(36).slice(2, 6);
        const { data: course, error: cErr } = await supabase
          .from("courses")
          .insert({
            name: name.trim(),
            slug,
            description: description.trim() || null,
            city: city.trim() || null,
            state: normalizedState,
            latitude: firstTee[0],
            longitude: firstTee[1],
            hole_count: holeCount,
            difficulty: difficulty || null,
            boundary_locked: boundaryLocked,
            overview_snapshot_path: overviewSnapshotPath,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (cErr) throw cErr;
        courseIdFinal = course!.id;

        const { data: layout, error: lErr } = await supabase
          .from("course_layouts")
          .insert({
            course_id: courseIdFinal,
            name: "Main",
            hole_count: holeCount,
            par_total: parTotal,
            distance_total: distTotal,
            ...layoutDesignColumns,
            is_default: true,
          })
          .select("id")
          .single();
        if (lErr) throw lErr;
        layoutIdFinal = layout!.id;
      }

      const { data: insertedHoles, error: hErr } = await supabase
        .from("holes")
        .upsert(holeRows.map(h => ({...h, layout_id: layoutIdFinal})), { onConflict: "id" })
        .select("id, number");
      if (hErr) {
        if (existingHoles.some(h => { const draft = shapedHoles.find(d => d.id === h.id); return draft && draft.number !== h.number; })) {
          for (const h of existingHoles) {
            const {error} = await supabase.from("holes").update({number: h.number}).eq("id", h.id);
            if (error) throw new Error("Hole reordering was interrupted. Your tees are preserved; saving is paused for recovery.");
          }
        }
        throw hErr;
      }
      if (insertedHoles?.length !== shapedHoles.length) throw new Error("Not all holes were confirmed saved. Your tees and recovery draft are preserved.");
      // Every hole must be back in the normal range. If any temporary negative
      // number is left, a hole was saved as a new row instead of updating the
      // old one — stop here so it surfaces as a sync issue, not silent duplicates.
      {
        const { data: stranded, error: sErr } = await supabase
          .from("holes")
          .select("id")
          .eq("layout_id", layoutIdFinal)
          .lt("number", 0);
        if (sErr) throw sErr;
        if (stranded?.some(h => !deletedHoleIdsRef.current.has(h.id))) {
          throw new Error(
            "Some holes didn't finish saving. Your tees and local recovery draft are preserved; saving is paused.",
          );
        }
      }

      if (teeRows.length) {
        const { error: tErr } = await supabase.from("hole_tees").upsert(teeRows.map(({split_point:_s,...t})=>t), {onConflict: "id"});
        if (tErr) throw tErr;
      }
      if (basketRows.length) {
        const { error: bErr } = await supabase.from("hole_baskets").upsert(basketRows.map(({ route_mode: _r, flight_path: _f, is_drop_zone: _d, bearing: _b, ...b }) => b), {onConflict: "id"});
        if (bErr) throw bErr;
      }

      if (isEdit && loadedLayoutId) {
        const { data: currentHoleIds, error: currentIdsError } = await supabase
          .from("holes")
          .select("id")
          .eq("layout_id", loadedLayoutId);
        if (currentIdsError) throw currentIdsError;
        const currentIds = new Set((currentHoleIds ?? []).map((h) => h.id as string));
        const removedIds = [...deletedHoleIdsRef.current].filter((id) => currentIds.has(id));
        if (removedIds.length) {
          for (const table of ["hole_media", "hole_baskets", "hole_tees"] as const) {
            const {error} = await supabase.from(table).delete().in("hole_id", removedIds);
            if (error) throw error;
          }
          const {error} = await supabase.from("holes").delete().in("id", removedIds);
          if (error) throw error;
          removedIds.forEach((id) => deletedHoleIdsRef.current.delete(id));
        }
      }

      const teeIds = new Set(teeRows.map(t => t.id!));
      const basketIds = new Set(basketRows.map(b => b.id!));
      for (const [table, previous, current] of [
        ["hole_tees", savedTeeIdsRef.current, teeIds],
        ["hole_baskets", savedBasketIdsRef.current, basketIds],
      ] as const) {
        const removed = removedSavedPins(previous, current);
        if (removed.length) {
          const {error} = await supabase.from(table).delete().in("id", removed);
          if (error) throw error;
        }
      }
      savedTeeIdsRef.current = teeIds;
      savedBasketIdsRef.current = basketIds;
      removedPinIdsRef.current.clear();

      const savedFeatureIds = new Map<string, string>();
      // Safe sync of course_features:
      // - Upsert features that already have a DB id, so rows can be restored if
      //   a previous broken autosave deleted them.
      // - Insert new features with no id and write the ids back into state.
      // - Delete only rows explicitly removed by the user, never rows merely
      //   missing from a transient/partially-loaded client state.
      {
        const stateIds = new Set(features.filter((f) => f.id).map((f) => f.id as string));

        // Two-pass so ob_reference rows can resolve ref_feature_id.
        // The shared property is reference geometry in an event-only edit.
        const nonRef = features.filter((f) => f.type !== "ob_reference" && !(overlayId && f.type === "course_boundary"));
        const refs = features.filter((f) => f.type === "ob_reference");
        const tempIdToDbId = new Map<string, string>();
        for (const f of features) if (f.id) tempIdToDbId.set(f.tempId, f.id);

        const idAssignments = savedFeatureIds; // tempId -> new DB id

        for (const f of nonRef) {
          const row = {
            course_id: courseIdFinal,
            layout_id: f.type === "course_boundary" ? null : layoutIdFinal,
            hole_number: f.hole_numbers && f.hole_numbers.length ? f.hole_numbers[0] : null,
            hole_numbers: f.hole_numbers,
            type: f.type,
            geometry: { points: f.points, ...(f.canopy_m ? { canopy_m: f.canopy_m } : {}), ...(f.bearing != null ? { bearing: f.bearing } : {}) },
            ob_side: f.ob_side,
            label: f.label || null,
            created_by: user.id,
            ...(f.type === "course_boundary" ? {layer: "base", event_overlay_id: null} : overlayId ? { layer: "event", event_overlay_id: overlayId } : {}),
          } as any;
          if (f.id) {
            const { error } = await supabase
              .from("course_features")
              .upsert({ ...row, id: f.id, layout_id: f.type === "course_boundary" ? null : featureLayoutRef.current.has(f.id) ? featureLayoutRef.current.get(f.id) : row.layout_id }, { onConflict: "id" });
            if (error) throw error;
          } else {
            const { data, error } = await supabase
              .from("course_features")
              .insert({ ...row, publish_state: overlayId ? "published" : "draft" })
              .select("id")
              .single();
            if (error) throw error;
            if (data?.id) {
              setDraftCount((n) => n + 1);
              tempIdToDbId.set(f.tempId, data.id);
              idAssignments.set(f.tempId, data.id);
            }
          }
        }
        for (const f of refs) {
          const refId = f.ref_tempId ? (tempIdToDbId.get(f.ref_tempId) ?? null) : null;
          if (!refId) continue;
          const row = {
            course_id: courseIdFinal,
            layout_id: f.type === "course_boundary" ? null : layoutIdFinal,
            hole_number: f.hole_numbers && f.hole_numbers.length ? f.hole_numbers[0] : null,
            hole_numbers: f.hole_numbers,
            type: f.type,
            geometry: { points: f.points, ...(f.canopy_m ? { canopy_m: f.canopy_m } : {}), ...(f.bearing != null ? { bearing: f.bearing } : {}) },
            ob_side: f.ob_side,
            label: f.label || null,
            created_by: user.id,
            ref_feature_id: refId,
            ...(f.type === "course_boundary" ? {layer: "base", event_overlay_id: null} : overlayId ? { layer: "event", event_overlay_id: overlayId } : {}),
          } as any;
          if (f.id) {
            const { error } = await supabase
              .from("course_features")
              .upsert({ ...row, id: f.id, layout_id: f.type === "course_boundary" ? null : featureLayoutRef.current.has(f.id) ? featureLayoutRef.current.get(f.id) : row.layout_id }, { onConflict: "id" });
            if (error) throw error;
          } else {
            const { data, error } = await supabase
              .from("course_features")
              .insert({ ...row, publish_state: overlayId ? "published" : "draft" })
              .select("id")
              .single();
            if (error) throw error;
            if (data?.id) idAssignments.set(f.tempId, data.id);
          }
        }

        // Assigned database identities are bookkeeping, not a user edit. Apply
        // them to every undo/redo snapshot so restored items update the same row.
        if (idAssignments.size) {
          const withIds = (json: string) => {
            const snapshot = JSON.parse(json);
            return JSON.stringify({...snapshot, features: snapshot.features.map((f: FeatureDraft) =>
              !f.id && idAssignments.has(f.tempId) ? {...f, id: idAssignments.get(f.tempId)!} : f)});
          };
          const history = historyRef.current;
          rebaseEditHistory(history, withIds);
          normalizedSnapshotRef.current = withIds(snapshotRef.current);
          setSavedKey(previous => previous ? withIds(previous) : previous);
          setFeatures(previous => previous.map(f =>
            !f.id && idAssignments.has(f.tempId) ? {...f, id: idAssignments.get(f.tempId)!} : f));
          const liveFeatures = JSON.parse(snapshotRef.current).features as FeatureDraft[];
          idAssignments.forEach((id, tempId) => {
            if (!liveFeatures.some(f => f.tempId === tempId)) deletedFeatureIdsRef.current.add(id);
          });
        }

        const toDelete = [...deletedFeatureIdsRef.current].filter((id) => !stateIds.has(id) && ![...savedFeatureIds.values()].includes(id));
        if (toDelete.length) {
          await supabase
            .from("course_features")
            .delete()
            .in("ref_feature_id", toDelete)
            .then(
              () => {},
              () => {},
            );
          const { error } = await supabase.from("course_features").delete().in("id", toDelete);
          if (error) throw error;
          toDelete.forEach((id) => deletedFeatureIdsRef.current.delete(id));
        }
      }

      // Counts describe successfully saved rows, never an unfinished batch.
      if (isEdit && courseId) {
        const { error: uErr } = await supabase
          .from("courses")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            city: city.trim() || null,
            state: normalizedState,
            latitude: firstTee[0],
            longitude: firstTee[1],
            difficulty: difficulty || null,
            boundary_locked: boundaryLocked,
            overview_snapshot_path: overviewSnapshotPath,
          })
          .eq("id", courseId);
        if (uErr) throw uErr;
        const {error: layoutUpdateError} = await supabase.from("course_layouts").update({
          hole_count: shapedHoles.length, par_total: parTotal, distance_total: distTotal, ...layoutDesignColumns,
        }).eq("id", layoutIdFinal);
        if (layoutUpdateError) throw layoutUpdateError;
      }
      if (offlineDraftKey) {
        try {
          window.localStorage.setItem(offlineDraftKey + ":last-saved", JSON.stringify({holes: shapedHoles, layoutId: layoutIdFinal, at: Date.now()}));
          const pending = JSON.parse(window.localStorage.getItem(offlineDraftKey) || "null");
          if (pending && [JSON.stringify(holes), JSON.stringify(shapedHoles)].includes(JSON.stringify(pending.holes))) {
            window.localStorage.removeItem(offlineDraftKey);
            setOfflineDraft(null);
          }
        } catch { /* Keep existing backups if browser storage is unavailable. */ }
      }
      setLastSavedAt(new Date());
      setSaveError(null);
      setSavedKey(JSON.stringify({...JSON.parse(snapshotKey), holes: shapedHoles,
        features: features.map(f => savedFeatureIds.has(f.tempId) ? {...f, id: savedFeatureIds.get(f.tempId)!} : f),
      }));
      // An Undo while a request was in flight stays a draft against the submitted map.
      const liveHoles = JSON.parse(snapshotRef.current).holes as HoleDraft[];
      const livePinIds = new Set(liveHoles.flatMap(h => [...h.extra_tees, ...h.extra_baskets].map(p => p.tempId)));
      [...teeIds, ...basketIds].forEach(id => { if (!livePinIds.has(id)) removedPinIdsRef.current.add(id); });
      {
        toast.success(
          isEdit
            ? "Course updated."
            : "Course submitted for admin review. It becomes public once approved.",
        );
        if (!isEdit) navigate({ to: "/courses/$courseId/edit", params: { courseId: courseIdFinal }, search: {layout: layoutIdFinal} });
      }
      return true;
    } catch (e) {
      const msg =
        (e as {message?: string})?.message || "We couldn't save this course. Your recovery draft is retained.";
      setSaveError(msg);
      if (/already exists as/i.test(msg)) {
        toast.error(msg);
      } else if (/holes_layout_id_number_key/i.test(msg)) {
        toast.error("Two holes ended up with the same number. Save again — your work is still here.");
      } else if (/duplicate key|unique/i.test(msg) || /23505/.test(msg)) {
        toast.error(
          "A course with this name already exists in that city/state. Add a layout to that course instead.",
        );
      } else {
        toast.error(msg);
      }
      return false;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  async function openLayouts() {
    if (saving || loading) return;
    if (unsavedChanges) { toast.info("Save changes or undo your edits before opening Layouts."); return; }
    setLayoutsOpen(true);
  }
  function showLayoutOnMap(id: string) {
    // Invalidate the old draft before the layout editor unmounts. Autosave must
    // never replay old slots over a newly saved layout.
    loadedReadyRef.current = false;
    setLoading(true);
    setLayoutsOpen(false);
    setRequestedLayoutId(id);
    onLayoutChange?.(id);
    setLayoutReload(n => n + 1);
    layoutsChangedRef.current = false;
    setPinSelection(null); setSelectedFairway(null); setPanel(null);
  }
  function closeLayouts() {
    if (layoutEditorState.busy) return;
    if (layoutEditorState.dirty && !window.confirm("Discard unsaved layout changes?")) return;
    if (layoutsChangedRef.current && loadedLayoutId) showLayoutOnMap(loadedLayoutId);
    else setLayoutsOpen(false);
  }

  const isDrawingLineOrPoly = tool.kind === "feature" && FEATURE_CONFIG[tool.type].geom !== "point";

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Loading course…
      </div>
    );
  }

  if (loadError) return (
    <div role="alert" className="mx-auto max-w-xl space-y-4 rounded-xl border border-destructive/40 bg-card p-6">
      <h1 className="font-display text-xl font-semibold">Course saving is paused</h1>
      <p>{loadError}</p>
      <p className="text-sm text-muted-foreground">The builder will not write to the course in this state. Any local recovery draft is kept on this device.</p>
      <Button variant="outline" onClick={() => {
        const copies = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith(`dgd:course-offline-draft:${courseId}`)).map(k => [k, localStorage.getItem(k)]));
        const url = URL.createObjectURL(new Blob([JSON.stringify(copies, null, 2)], {type: "application/json"}));
        const link = document.createElement("a"); link.href = url; link.download = `course-${courseId}-recovery.json`; link.click(); URL.revokeObjectURL(url);
      }}>Export recovery draft</Button>
    </div>
  );

  const builderShell = (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <CourseReviewBanner courseId={courseId} />
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate({ to: "/courses" })}
          title="Back to courses"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <div className="truncate font-display text-base font-semibold leading-tight">
            {isEdit ? "Edit course" : "New course"}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {name || "Untitled course"}
            {city || stateVal ? ` · ${[city, stateVal].filter(Boolean).join(", ")}` : ""}
            {loadedLayoutName && <span className="block" data-testid="editing-layout">Layout: {loadedLayoutName}</span>}
          </div>
        </div>
        {/* Wizard progress ribbon */}
        {proMode ? (
          <div className="ml-3 hidden items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5 md:flex">
            <button
              onClick={() => setStep("overview")}
              className={
                "rounded-md px-3 py-1 text-xs font-semibold " +
                (step === "overview"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              Overview
            </button>
            <button
              onClick={() => setStep("holes")}
              disabled={!name.trim()}
              className={
                "rounded-md px-3 py-1 text-xs font-semibold disabled:opacity-40 " +
                (step === "holes"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              Holes
            </button>
          </div>
        ) : (
          <div className="ml-3 hidden items-center gap-1 md:flex">
            {(
              [
                { n: 1, label: "Locate" },
                { n: 2, label: "Boundary" },
                { n: 3, label: "Overview" },
                { n: 4, label: "Holes" },
                { n: 5, label: "Review" },
              ] as const
            ).map((s, i, arr) => {
              const done = stage > s.n;
              const active = stage === s.n;
              const reachable =
                s.n <= stage ||
                (s.n === 2 && name.trim()) ||
                (s.n <= 4 && stage >= 2) ||
                (s.n === 5 && stage >= 4);
              return (
                <Fragment key={s.n}>
                  <button
                    disabled={!reachable}
                    onClick={() => {
                      if (!reachable) return;
                      setStage(s.n as 1 | 2 | 3 | 4 | 5);
                      setStep(s.n >= 4 ? "holes" : "overview");
                    }}
                    className={
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 " +
                      (active
                        ? "bg-primary text-primary-foreground shadow"
                        : done
                          ? "bg-primary/15 text-primary hover:bg-primary/25"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted")
                    }
                    title={`Step ${s.n} · ${s.label}`}
                  >
                    <span
                      className={
                        "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] " +
                        (active
                          ? "bg-primary-foreground/25"
                          : done
                            ? "bg-primary/30"
                            : "bg-muted-foreground/20")
                      }
                    >
                      {done ? <Check className="h-3 w-3" /> : s.n}
                    </span>
                    {s.label}
                  </button>
                  {i < arr.length - 1 ? (
                    <span className={"h-px w-3 " + (stage > s.n ? "bg-primary/60" : "bg-border")} />
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div className="hidden items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground md:flex">
            <span>{holeCount} holes</span>
            <span aria-hidden>·</span>
            <span>
              Layout Par{" "}
              <span className="font-semibold text-foreground">
                {holes.length && holes.every((h) => Number.isFinite(h.par) && h.par > 0) ? parTotal : "—"}
              </span>
            </span>
            <span aria-hidden>·</span>
            <span className="font-semibold text-foreground">{distTotal.toLocaleString()} ft</span>
            <span aria-hidden>·</span>
            <span>
              <span className="font-semibold text-foreground">{holes.filter((h) => h.tee && h.basket).length}/{holeCount}</span> mapped
            </span>
          </div>
          {offlineDraft && !unsavedChanges ? (
            <span className="inline-flex flex-wrap items-center gap-1 text-sm">
              Changes from {new Date(offlineDraft.at).toLocaleString()} weren't saved.
              <Button
                size="sm"
                variant="secondary"
                className="h-7"
                onClick={() => {
                  try {assertSafeDraftRestore(offlineDraft,loadedLayoutId!,holes);}catch(error){toast.error((error as Error).message);return;}
                  userTouchedRef.current = true;
                  setHoles(offlineDraft.holes);
                  try {if(offlineDraftKey){checkpointDraft(window.localStorage,offlineDraftKey,offlineDraft);window.localStorage.setItem(offlineDraftKey+":reviewed-legacy-at",String(offlineDraft.at));}}catch{/* Keep the in-memory recovery even when storage is full. */}
                  setOfflineDraft(null);
                  toast.success("Offline changes restored — save to keep them.");
                }}
              >
                Restore
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => {
                  if (offlineDraftKey) {
                    try {checkpointDraft(window.localStorage,offlineDraftKey,offlineDraft);window.localStorage.setItem(offlineDraftKey+":reviewed-legacy-at",String(offlineDraft.at));window.localStorage.removeItem(offlineDraftKey);}catch{/* Preserve the draft if its archive could not be written. */}
                  }
                  setOfflineDraft(null);
                }}
              >
                Discard
              </Button>
            </span>
          ) : null}
          {isEdit ? (
            <span
              className={
                "inline-flex items-center gap-1 whitespace-nowrap text-sm " +
                (saveError ? "text-destructive" : "text-muted-foreground")
              }
              title={saveError ?? (lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : undefined)}
              role="status"
            >
              {saving ? (
                "Saving…"
              ) : saveError ? (
                "Sync issue"
              ) : !online ? (
                "Offline — kept on this device"
              ) : unsavedChanges ? (
                "Unsaved changes"
              ) : (
                <>
                  <Check className="h-4 w-4" /> Saved
                </>
              )}
            </span>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Editor settings" title="Editor settings">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Editor settings</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={snapEnabled} onCheckedChange={(v) => setSnapEnabled(!!v)}>
                Snap to nearby corners
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={!proMode} onCheckedChange={(v) => setProMode(!v)}>
                Help me map this course
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-normal text-muted-foreground">
                Shortcuts: T tee · B basket · [ ] hole · Esc select
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            <Save className="mr-1 h-4 w-4" />
            {saving ? "Saving…" : isEdit ? "Save changes" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={requestExit}
            disabled={saving}
            title={unsavedChanges ? "Exit — you'll be asked about unsaved changes" : "Exit builder"}
          >
            <X className="mr-1 h-4 w-4" />
            Exit
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have changes that haven't been saved. Leaving now discards them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmExit(false);
                void save().then(saved => {if (saved) exitBuilder();});
              }}
              disabled={saving}
            >
              Save changes
            </Button>
            <AlertDialogAction onClick={exitBuilder}>Discard and exit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {courseId && <Dialog open={layoutsOpen} onOpenChange={open => {if (!open) closeLayouts();}}>
        <DialogContent overlayClassName="bg-black/20" className="left-auto right-0 top-0 h-dvh max-h-dvh w-full translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:max-w-2xl">
          <DialogTitle>Layouts</DialogTitle>
          <DialogDescription>Choose tees and baskets, order holes, and save layouts while keeping your course map open.</DialogDescription>
          <LayoutStudioPage courseId={courseId} embedded onEditorState={setLayoutEditorState}
            onLayoutSaved={() => {layoutsChangedRef.current = true;}} onEditMap={showLayoutOnMap} />
        </DialogContent>
      </Dialog>}

      <div className="relative grid min-h-0 flex-1 grid-cols-1">
        {/* Editor menus: checks, hole and features open as one floating panel over the map */}
        <div className="absolute left-14 right-2 top-2 z-[1150] flex justify-between gap-1 rounded-xl md:left-auto md:right-3 md:top-3 md:justify-start border border-border bg-background/95 p-1 shadow-md">
          {([
            ["hole", step === "holes" ? `Hole ${holeLabelByNumber(holes, activeHole)}` : "Course setup", Flag],
            ["features", "Items", Layers],
          ] as const).map(([k, label, Icon]) => (
            <Button key={k} size="sm" variant={panel === k ? "default" : "ghost"} aria-label={label} className="h-10 gap-1.5 px-3 md:h-8 md:px-2.5" aria-expanded={panel === k} onClick={() => {if(k==="features"){setPanel(null);setPinSelection(null);setEditingFeatureId(null);setSelectedFairway(null);setItemSelectionSerial(Date.now());}else {setSelectedFairway(null);setPanel((p) => (p === k ? null : k));}}}>
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
              <ChevronDown className={"hidden h-3.5 w-3.5 transition-transform sm:block " + (panel === k ? "rotate-180" : "")} />
            </Button>
          ))}
          <Button size="sm" variant={propertyOpen ? "default" : "ghost"} onClick={() => {setPropertyOpen(v => !v);setOverlayOpen(false);setPanel(null);setSelectedFairway(null);}}>Property</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-10 gap-1 md:h-8">Map tools <ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[1300]">
              <DropdownMenuItem onSelect={() => {setOverlayOpen(true);setPropertyOpen(false);setPanel(null);setTool({kind:"select"});setSelectedFairway(null);}}>Place map over aerial</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {changeBuilderMode("course");setPropertyOpen(true);}}>Course overview</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => changeBuilderMode("holes")}>Edit holes</DropdownMenuItem>
              {courseId && !overlayId && <DropdownMenuItem disabled={saving} onSelect={() => void openLayouts()}>Layouts</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => {if(!boundaryLocked || boundaryPoints.length<3){setPropertyOpen(true);return;}setPanel(null);setPropertyOpen(false);setOverlayOpen(false);setSelectedFairway(null);changeBuilderMode("holes");setWalking(true);}}>Walk course</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={positionsUnlocked} onCheckedChange={v => setPositionsUnlocked(!!v)}>Unlock tee and basket positions</DropdownMenuCheckboxItem>
              <DropdownMenuItem onSelect={() => setPanel("checks")}>Checks</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPanel("pars")}>Pars &amp; distances</DropdownMenuItem>
              <DropdownMenuItem disabled={!canUndo} onSelect={undo}>Undo</DropdownMenuItem>
              <DropdownMenuItem disabled={!canRedo} onSelect={redo}>Redo</DropdownMenuItem>
              {courseId && <DropdownMenuItem asChild><Link to="/courses/$courseId/tee-signs" params={{courseId}} search={{...(loadedLayoutId ? {layout: loadedLayoutId} : {}), ...(overlayId ? {event: overlayId} : {})}} target="_blank">Preview sign</Link></DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {overlayOpen && <ReferenceOverlayControl image={overlay.image} onChange={overlay.setImage} storageError={overlay.storageError}
          courseId={courseId} boundary={boundaryPoints} boundaryLocked={boundaryLocked} holes={holes.map(h => h.number)} activeHole={activeHole}
          mark={overlayMark} onMark={setOverlayMark} onClose={() => {setOverlayOpen(false);setOverlayMark(null);if(overlay.image && !overlay.image.locked)overlay.setImage({...overlay.image,visible:false});}}
          onBuild={items => {
            userTouchedRef.current = true;
            setHoles(previous => items.reduce((current,item) => current.map(h => {
              if(h.number!==item.hole) return h;
              const peers=item.kind==="tee" ? h.extra_tees : h.extra_baskets;
              if((h[item.kind] && sameOverlaySpot(h[item.kind]!,item.point)) || peers.some(p=>p.lat!=null&&p.lng!=null&&sameOverlaySpot([p.lat,p.lng],item.point))) return h;
              if(!h[item.kind])return {...h,[item.kind]:item.point,[`${item.kind}_name`]:item.name,[`${item.kind}_color`]:item.color};
              const pad={tempId:uid(),name:item.name,color:item.color,lat:item.point[0],lng:item.point[1],distance_override:null};
              return item.kind==="tee" ? {...h,extra_tees:[...h.extra_tees,pad]} : {...h,extra_baskets:[...h.extra_baskets,pad]};
            }),previous));
            setOverlayMark(null); toast.success("Selected locations added. Existing items were kept and duplicates skipped. Fairways update automatically.");
          }}/>}
        {propertyOpen && <section aria-label="Property setup" className="absolute left-14 right-2 top-16 z-[1160] max-h-[65%] overflow-y-auto rounded-xl border bg-background/95 p-3 shadow-xl sm:right-auto sm:w-80">
          <div className="flex items-center justify-between"><strong>1. Property line &amp; overview</strong><Button size="sm" variant="ghost" aria-label="Close property setup" onClick={() => setPropertyOpen(false)}>×</Button></div>
          <p className="my-2 text-xs text-muted-foreground">Outline the playable property first. All layouts share this line, and course overviews use this area.</p>
          <p className="mb-2 text-sm">{boundaryPoints.length >= 3 ? `${polygonAcres(boundaryPoints).toFixed(1)} acres · ${boundaryLocked ? "Locked" : "Unlocked"}` : "No property line yet"}</p>
          {tool.kind === "feature" && tool.type === "course_boundary" ? <div className="flex flex-wrap gap-2"><span className="text-xs">Click the map edge · {draftPoints.length} points</span><Button size="sm" disabled={draftPoints.length < 3} onClick={finishDraft}>Finish property line</Button><Button size="sm" variant="outline" onClick={() => setDraftPoints(p => p.slice(0,-1))}>Undo point</Button><Button size="sm" variant="outline" onClick={() => {cancelDraft();setTool({kind:"select"});}}>Cancel drawing</Button></div> : <div className="grid gap-2">
            {!boundaryPoints.length && <Button disabled={!!overlayId} onClick={() => {setBoundaryLocked(false);setTool({kind:"feature",type:"course_boundary"});setDraftPoints([]);setPanel(null);}}>Draw property line</Button>}
            {boundaryPoints.length >= 3 && <><Button variant="outline" onClick={() => mapRef.current?.fitBounds(boundaryPoints,{padding:[60,60]})}>Show whole property</Button><Button disabled={!!overlayId} onClick={() => {setBoundaryLocked(v => !v);setTool({kind:"select"});setEditingFeatureId(null);setPanel(null);}}>{boundaryLocked ? "Unlock to adjust property" : "Lock property line"}</Button>
            {!boundaryLocked && <p className="text-xs">Drag the boundary points on the map to adjust the outline.</p>}
            <Button variant="outline" disabled={!boundaryLocked || capturingOverview} onClick={() => void captureOverviewSnapshot()}>{capturingOverview ? "Capturing…" : "Capture property overview"}</Button><Button disabled={!boundaryLocked} onClick={() => {setPropertyOpen(false);changeBuilderMode("holes");}}>Continue to tees &amp; baskets</Button></>}
          </div>}
        </section>}
        <aside
          className={(panel ? "" : "hidden ") + "absolute inset-x-2 bottom-20 z-[1140] max-h-[48%] md:inset-x-auto md:bottom-auto md:left-2 md:top-16 md:max-h-[calc(100%-13rem)] md:w-80 space-y-3 overflow-y-auto rounded-xl border border-border bg-background/95 p-3 shadow-lg"}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{panel === "checks" ? "Checks" : panel === "features" ? "Edit item" : panel === "pars" ? `Pars & distances · ${holes.length} holes` : step === "holes" ? "Hole tools" : "Course setup"}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Close panel" onClick={() => {setPanel(null);setEditingFeatureId(null);}}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className={panelCls("checks")}>
          {courseId ? (
            <MapChecker
              boundaries={features.filter((f) => f.type === "course_boundary").map((f) => f.points)}
              holes={holes.map((h) => ({
                number: h.number,
                par: h.par ?? null,
                parConfirmed: h.par_confirmed !== false,
                tee: h.tee,
                basket: h.basket,
                flightPath: h.flight_path,
                rulesConfirmed: true,
                hasDistance: h.distance_override != null || (h.tee != null && h.basket != null),
                hasCaddyNotes: h.caddy_notes.trim().length > 0,
              }))}
              features={features.map((f) => ({
                type: f.type,
                hole_number: f.hole_numbers?.[0] ?? null,
                label: f.label,
                points: f.points,
                hasDirection: f.ob_side !== "none",
              }))}
              infrastructureCount={
                features.filter((f) => ["parking", "restroom", "path", "trash", "bench", "gazebo"].includes(f.type)).length
              }
              onGoToHole={(n) => {
                changeBuilderMode("holes");
                setActiveHole(n);
              }}
            />
          ) : null}
          </div>
          <div className={panelCls("features")}>
          {(() => {
            const sel = editingFeatureId ? features.find((x) => x.tempId === editingFeatureId) : null;
            if (!sel) return null;
            const cfg = FEATURE_CONFIG[sel.type];
            const isArea = sel.type === "course_boundary" || POLY_FEATURES.includes(sel.type);
            const measure =
              sel.points.length < 2
                ? null
                : isArea && sel.points.length >= 3
                  ? `${polygonAcres(sel.points).toFixed(2)} acres`
                  : `${Math.round(pathLengthFt(sel.points))} ft long`;
            return (
              <section
                aria-label="Selected map object"
                className="space-y-2 rounded-xl border border-primary/40 bg-card p-3 text-sm"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <FeatureGlyph type={sel.type} size={16} />
                  <span>{cfg.label}</span>
                  <button
                    type="button"
                    className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => {setEditingFeatureId(null);setPanel(null);}}
                  >
                    Done
                  </button>
                </div>
                {measure ? <div className="text-xs text-muted-foreground">{measure}</div> : null}
                <Button size="sm" variant="outline" onClick={()=>{if(sel.points.length)mapRef.current?.fitBounds(sel.points,{padding:[90,90],maxZoom:20});}}>Locate item</Button>
                <Input
                  value={sel.label}
                  aria-label="Item name"
                  placeholder="Name (optional)"
                  className="h-8 text-sm"
                  onChange={(e) =>
                    setFeatures((prev) =>
                      prev.map((x) => (x.tempId === sel.tempId ? { ...x, label: e.target.value } : x)),
                    )
                  }
                />
                <StudioFeatureProperties feature={sel} onChange={patch=>setFeatures(previous=>previous.map(f=>f.tempId===sel.tempId?{...f,...patch}:f))}/>
                {sel.type !== "course_boundary" ? <AssignmentPicker f={sel} /> : null}
                {courseId ? (
                  <CopyToLayouts courseId={courseId} currentLayoutId={loadedLayoutId} feature={sel} userId={user?.id} />
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Drag it on the map to move it. Lines and areas have a centre handle to move the whole shape.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive"
                  onClick={() => {
                    removeFeature(sel.tempId);
                    setEditingFeatureId(null);
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove from map
                </Button>
              </section>
            );
          })()}
          </div>
          <div className={panelCls("hole")}>
          {step === "overview" ? (
            <>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
                <div className="font-semibold text-primary">
                  {proMode
                    ? "Course overview"
                    : stage === 1
                      ? "Step 1 · Locate & name your course"
                      : stage === 2
                        ? "Step 2 · Draw the property boundary"
                        : stage === 3
                          ? "Step 3 · Snapshot the course overview"
                          : "Overview"}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {proMode
                    ? "Fill out the basics and pin the course on the map. Next you'll build each hole and capture a tee-sign image."
                    : stage === 1
                      ? "Give your course a name, then drop it on the map with GPS or an address."
                      : stage === 2
                        ? "Trace the edge of the property. Anything outside becomes OB by default."
                        : "Locking in a satellite snapshot of the whole property — this becomes your caddy-book cover."}
                </div>
              </div>
              {proMode || stage === 1 ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Course name</Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Maple Hill"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <CoursePublicImportDialog
                          name={name}
                          city={city}
                          state={stateVal}
                          onApply={applyPublicCourseData}
                        />
                        <span className="text-xs text-muted-foreground">
                          Prefill the basics from PDGA, UDisc, or Disc Golf Course Review.
                        </span>
                      </div>
                    </div>

                    <div>
                      <Label>City</Label>
                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Leicester"
                      />
                    </div>
                    <div>
                      <Label>State</Label>
                      <Input
                        value={stateVal}
                        onChange={(e) => setStateVal(e.target.value)}
                        placeholder="MA"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <DuplicateCourseWarning
                        name={name}
                        city={city}
                        state={stateVal}
                        lat={holes.find((h) => h.tee)?.tee?.[0] ?? center[0]}
                        lng={holes.find((h) => h.tee)?.tee?.[1] ?? center[1]}
                        excludeId={courseId}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>
                        Address <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="230 Redemption Rock Trl"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={locateAddress}
                          disabled={geocoding}
                        >
                          <MapPin className="mr-1 h-3.5 w-3.5" />
                          {geocoding ? "Locating…" : "Locate"}
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Finds the area on the map. Uses city + state if no address is entered.
                      </p>
                    </div>
                    <div>
                      <Label>Holes</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Remove a hole"
                          disabled={holeCount <= 1}
                          onClick={() => applyHoleCount(holeCount - 1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={36}
                          className="text-center"
                          value={holeCountDraft}
                          onChange={(e) => setHoleCountDraft(e.target.value)}
                          onBlur={() => {
                            const parsed = parseInt(holeCountDraft, 10);
                            if (Number.isNaN(parsed)) {
                              setHoleCountDraft(String(holeCount));
                              return;
                            }
                            applyHoleCount(parsed);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Add a hole"
                          disabled={holeCount >= 36}
                          onClick={() => applyHoleCount(holeCount + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        1–36 holes. Lowering the count removes empty holes from the end; holes that
                        already have a tee or basket stay until you delete them on the Holes step.
                      </p>
                    </div>
                    <div>
                      <Label>Difficulty</Label>
                      <select
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                      >
                        <option value="">Select…</option>
                        <option>Beginner</option>
                        <option>Intermediate</option>
                        <option>Advanced</option>
                        <option>Championship</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                  <Button
                    className="mt-3 w-full"
                    disabled={!name.trim()}
                    onClick={() => {
                      if (!name.trim()) return toast.error("Give your course a name");
                      if (proMode) {
                        setPropertyOpen(true); setPanel(null); setStep("overview");
                      } else {
                        setStage(2);
                        toast.success("Course pinned! Now draw the property line 🗺️");
                      }
                    }}
                  >
                    Continue → Property line
                  </Button>
                </div>
              ) : null}
              {isEdit && courseId && user ? (
                <CourseFlythroughUploader
                  courseId={courseId}
                  userId={user.id}
                  initialUrl={flythroughUrl}
                  initialPath={flythroughPath}
                  onChange={({ url, path }) => {
                    setFlythroughUrl(url);
                    setFlythroughPath(path);
                  }}
                />
              ) : null}

              {/* Property boundary — stage 2 in wizard */}
              {proMode || stage === 2 ? (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div>
                    <div className="text-sm font-semibold">Property boundary</div>
                    <p className="text-xs text-muted-foreground">
                      Trace the course property line. Anything outside is treated as OB, and
                      hole-level "on-or-over" OB rules can reference this boundary.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={
                        tool.kind === "feature" && tool.type === "course_boundary"
                          ? "default"
                          : "outline"
                      }
                      onClick={() => {
                        if (boundaryLocked) {
                          setBoundaryLocked(false);
                          toast.message("Boundary unlocked for editing");
                        }
                        setTool({ kind: "feature", type: "course_boundary" });
                        setDraftPoints([]);
                      }}
                    >
                      Draw / edit boundary
                    </Button>
                    {features.some((f) => f.type === "course_boundary") ? (
                      <Button
                        size="sm"
                        variant={boundaryLocked ? "default" : "outline"}
                        onClick={() => setBoundaryLocked((v) => !v)}
                      >
                        {boundaryLocked ? "Locked — click to unlock" : "Lock property line"}
                      </Button>
                    ) : null}
                    {features.some((f) => f.type === "course_boundary") && !boundaryLocked ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() =>
                          setFeatures((prev) => prev.filter((f) => f.type !== "course_boundary"))
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  {tool.kind === "feature" && tool.type === "course_boundary" ? (
                    <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-xs">
                      <span className="font-semibold text-primary">Drawing property line</span>
                      <span className="text-muted-foreground">
                        {draftPoints.length} points · click map to add
                      </span>
                      <div className="ml-auto flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDraftPoints((prev) => prev.slice(0, -1))}
                          disabled={draftPoints.length === 0}
                        >
                          Undo
                        </Button>
                        <Button size="sm" onClick={finishDraft} disabled={draftPoints.length < 3}>
                          <Check className="mr-1 h-3.5 w-3.5" /> Finish
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelDraft}>
                          <X className="mr-1 h-3.5 w-3.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {!proMode ? (
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <Button size="sm" variant="ghost" onClick={() => setStage(1)}>
                        ← Back
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          !features.some(
                            (f) => f.type === "course_boundary" && (f.points?.length ?? 0) >= 3,
                          )
                        }
                        onClick={() => {
                          setBoundaryLocked(true);
                          setTool({ kind: "select" });
                          setStage(3);
                          toast.success("Boundary locked! Capturing your overview 📸");
                        }}
                      >
                        Continue → Overview snapshot
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Course overview snapshot — stage 3 in wizard */}
              {proMode || stage === 3 ? (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="text-sm font-semibold">Course overview snapshot</div>
                  <p className="text-xs text-muted-foreground">
                    A satellite image of the full property for the caddy-book cover. You can
                    recapture this any time.
                  </p>

                  {/* Boundary verification (stage 3 gate) */}
                  {!proMode
                    ? (() => {
                        const boundary = features.find((f) => f.type === "course_boundary");
                        const points = boundary?.points?.length ?? 0;
                        const drawn = points >= 3;
                        return (
                          <div
                            className={
                              "rounded-lg border p-3 text-xs " +
                              (drawn && boundaryLocked
                                ? "border-primary/40 bg-primary/5"
                                : "border-amber-500/40 bg-amber-500/5")
                            }
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-semibold">
                                {drawn && boundaryLocked
                                  ? "✓ Property boundary confirmed"
                                  : drawn
                                    ? "Boundary drawn — please lock it"
                                    : "Property boundary missing"}
                              </div>
                              <span className="text-[11px] text-muted-foreground">
                                {drawn ? `${points} points` : "0 points"}
                              </span>
                            </div>
                            <p className="mt-1 text-muted-foreground">
                              {drawn && boundaryLocked
                                ? "The property line is locked. Overview snapshot fits this boundary."
                                : "The overview should include the full course. Return to Step 2 to draw or lock the property line."}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => setStage(2)}>
                                {drawn ? "Adjust boundary" : "Draw boundary"}
                              </Button>
                              {drawn && !boundaryLocked ? (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setBoundaryLocked(true);
                                    toast.success("Property line locked");
                                  }}
                                >
                                  Lock property line
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })()
                    : null}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={captureOverviewSnapshot}
                      disabled={capturingOverview}
                    >
                      {capturingOverview
                        ? "Capturing…"
                        : overviewSnapshotPath
                          ? "Recapture overview"
                          : "Capture overview"}
                    </Button>
                    {overviewSnapshotUrl ? (
                      <a
                        href={overviewSnapshotUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline self-center"
                      >
                        View snapshot
                      </a>
                    ) : null}
                  </div>
                  {overviewSnapshotUrl ? (
                    <img
                      src={overviewSnapshotUrl}
                      alt="Course overview"
                      className="mt-1 w-full rounded-lg border border-border"
                    />
                  ) : null}
                  {!proMode
                    ? (() => {
                        const boundary = features.find((f) => f.type === "course_boundary");
                        const drawn = (boundary?.points?.length ?? 0) >= 3;
                        const ready = drawn && boundaryLocked && !!overviewSnapshotPath;
                        return (
                          <div className="flex items-center justify-between border-t border-border pt-3">
                            <Button size="sm" variant="ghost" onClick={() => setStage(2)}>
                              ← Back
                            </Button>
                            <Button
                              size="sm"
                              disabled={!ready}
                              title={
                                !drawn
                                  ? "Draw the property line first"
                                  : !boundaryLocked
                                    ? "Lock the property line first"
                                    : !overviewSnapshotPath
                                      ? "Capture the overview snapshot first"
                                      : ""
                              }
                              onClick={() => {
                                setStage(4);
                                setStep("holes");
                                setActiveHole(1);
                                toast.success("Now let's build your holes 🥏");
                              }}
                            >
                              Continue → Build holes
                            </Button>
                          </div>
                        );
                      })()
                    : null}
                </div>
              ) : null}
            </>
          ) : null}
          </div>

          {step === "holes" ? (
            <>
              <div className={panelCls("checks")}>
              {!proMode && stage === 5 ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="text-sm font-semibold text-primary">
                    Step 5 · Review & publish
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Check every hole below, then publish. You can keep editing after publishing.
                  </p>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1 text-left">Hole</th>
                          <th className="px-2 py-1 text-right">Par</th>
                          <th className="px-2 py-1 text-right">Dist</th>
                          <th className="px-2 py-1 text-right">Hazards</th>
                        </tr>
                      </thead>
                      <tbody>
                        {designSummary.holes.map((h) => {
                          const hazards =
                            h.mando_count + h.dropzone_count + h.ob_area_count + (h.water ? 1 : 0);
                          return (
                            <tr
                              key={h.number}
                              className="cursor-pointer border-t border-border hover:bg-muted/40"
                              onClick={() => {
                                setStage(4);
                                setActiveHole(h.number);
                              }}
                            >
                              <td className="px-2 py-1 font-semibold">
                                {h.number}
                                {h.mapped ? "" : " ⚠"}
                              </td>
                              <td className="px-2 py-1 text-right">{h.par}</td>
                              <td className="px-2 py-1 text-right">
                                {h.distance_ft ? `${h.distance_ft.toLocaleString()} ft` : "—"}
                              </td>
                              <td className="px-2 py-1 text-right">{hazards || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => void save()}
                    disabled={saving || designSummary.mapped_hole_count === 0}
                  >
                    {saving ? "Publishing…" : isEdit ? "Save changes" : "Publish course"}
                  </Button>
                  <Button size="sm" variant="ghost" className="w-full" onClick={() => setStage(4)}>
                    Back to holes
                  </Button>
                </div>
              ) : null}
              </div>

              {/* Course intelligence — every detail the app reads back later */}
              <div className={panelCls("checks")}>
              <details className="group rounded-xl border border-border bg-card p-3 space-y-2">
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <div className="text-sm font-semibold">Course intelligence</div>
                  <span className="text-[11px] text-muted-foreground">
                    {designSummary.mapped_hole_count}/{holeCount} holes mapped
                  </span>
                </summary>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  {(
                    [
                      ["Par", String(designSummary.par_total)],
                      ["Distance", `${designSummary.distance_total.toLocaleString()} ft`],
                      [
                        "Longest hole",
                        designSummary.longest_hole_ft
                          ? `${designSummary.longest_hole_ft.toLocaleString()} ft`
                          : "—",
                      ],
                      [
                        "Shortest hole",
                        designSummary.shortest_hole_ft
                          ? `${designSummary.shortest_hole_ft.toLocaleString()} ft`
                          : "—",
                      ],
                      ["Mandatories", String(designSummary.mando_count)],
                      ["Drop zones", String(designSummary.dropzone_count)],
                      ["OB lines", `${designSummary.ob_line_feet.toLocaleString()} ft`],
                      ["OB areas", String(designSummary.ob_area_count)],
                      ["Water holes", String(designSummary.water_hole_count)],
                      ["Island greens", String(designSummary.island_green_count)],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
                {designHighlightList.length ? (
                  <ul className="space-y-0.5 text-[11px] text-foreground">
                    {designHighlightList.map((h) => (
                      <li key={h}>· {h}</li>
                    ))}
                  </ul>
                ) : null}
                {designGapList.length ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]">
                    <div className="font-semibold text-amber-600 dark:text-amber-400">
                      Still to finish
                    </div>
                    <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
                      {designGapList.map((g) => (
                        <li key={g}>· {g}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] font-semibold text-primary">
                    This layout is complete and ready to publish.
                  </div>
                )}
                {!proMode && stage < 5 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setStage(5)}
                  >
                    Review & publish →
                  </Button>
                ) : null}
              </details>
              </div>

              <div className={panelCls("hole")}>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-primary">
                    Step 2 · Hole {holeLabelByNumber(holes, activeHole)} of {holeCount}
                  </div>
                  <button
                    className="text-[11px] text-primary hover:underline"
                    onClick={() => setStep("overview")}
                  >
                    Edit overview
                  </button>
                </div>
              </div>
              </div>

            </>
          ) : null}

          {/* Compact totals — saving lives in the top bar */}
          <div className={panelCls("checks")}>
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            {features.length} feature{features.length === 1 ? "" : "s"} ·{" "}
            {holes.filter((h) => h.tee && h.basket).length}/{holeCount} holes mapped
          </div>
          </div>

          {step === "holes" ? (
            <>
              {/* Per-hole progress checklist */}
              <div className={panelCls("checks")}>
              {current
                ? (() => {
                    const hasTee = !!current.tee;
                    const hasBasket = !!current.basket;
                    const hasPar = current.par >= 2;
                    const hasImg = !!(current.map_snapshot_path || current.map_snapshot_url);
                    const hasRules = rulesConfirmed.has(current.number);
                    const toggleRules = () => {
                      setRulesConfirmed((prev) => {
                        const next = new Set(prev);
                        if (next.has(current.number)) next.delete(current.number);
                        else next.add(current.number);
                        return next;
                      });
                    };
                    const steps = [
                      { label: "Place tee pad", done: hasTee },
                      { label: "Place basket", done: hasBasket },
                      { label: "Confirm par", done: hasPar },
                      { label: "Tee-sign image", done: hasImg },
                      {
                        label: "Confirm mandatory obstacles, OB & special rules",
                        done: hasRules,
                        onClick: toggleRules,
                        actionLabel: hasRules ? "Confirmed" : "Confirm",
                      },
                    ];
                    const doneCount = steps.filter((s) => s.done).length;
                    const pct = Math.round((doneCount / steps.length) * 100);
                    const canAdvance = hasTee && hasBasket;
                    const advance = () => {
                      if (!canAdvance) {
                        toast.error("Place both the tee and basket before moving on");
                        return;
                      }
                      if (!hasImg) void captureHoleSnapshot();
                      if (activeHole < holeCount) {
                        toast.success(`Hole ${activeHole} locked in 🥏`);
                        setActiveHole(activeHole + 1);
                      } else {
                        toast.success("All holes mapped. Choose Save changes to save your course.");
                      }
                    };
                    return (
                      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-primary">
                            Hole {holeLabel(current)} checklist
                          </div>
                          <div className="text-[11px] font-semibold text-primary">
                            {doneCount}/{steps.length}
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <ul className="space-y-1 text-xs">
                          {steps.map((s) => {
                            const hasAction =
                              "onClick" in s &&
                              typeof (s as { onClick?: () => void }).onClick === "function";
                            return (
                              <li
                                key={s.label}
                                className={
                                  "flex items-center gap-2 " +
                                  (s.done ? "text-foreground" : "text-muted-foreground")
                                }
                              >
                                <span
                                  className={
                                    "grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px] " +
                                    (s.done
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border")
                                  }
                                >
                                  {s.done ? "✓" : ""}
                                </span>
                                <span className="flex-1 leading-tight">{s.label}</span>
                                {hasAction ? (
                                  <button
                                    type="button"
                                    onClick={(s as { onClick: () => void }).onClick}
                                    className={
                                      "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition " +
                                      (s.done
                                        ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                                        : "border-border bg-background text-foreground hover:bg-muted")
                                    }
                                  >
                                    {(s as { actionLabel?: string }).actionLabel ?? "Mark"}
                                  </button>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={advance}
                          disabled={!canAdvance}
                          title={canAdvance ? "" : "Place tee and basket first"}
                        >
                          {activeHole < holeCount ? `Next hole →` : "Finish holes"}
                        </Button>
                      </div>
                    );
                  })()
                : null}
              </div>

              {/* Hole navigator + tee sign capture */}
              <div className={panelCls("hole")}>
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveHole(Math.max(1, activeHole - 1))}
                    disabled={activeHole <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-sm font-semibold">
                    Hole {holeLabelByNumber(holes, activeHole)}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveHole(Math.min(holeCount, activeHole + 1))}
                    disabled={activeHole >= holeCount}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <Button
                  size="sm"
                  className="w-full"
                  onClick={captureHoleSnapshot}
                  disabled={capturing}
                >
                  <Camera className="mr-1 h-4 w-4" />
                  {capturing
                    ? "Capturing…"
                    : current?.map_snapshot_url
                      ? "Recapture tee sign image"
                      : "Capture tee sign image"}
                </Button>
                {current?.map_snapshot_url ? (
                  <div
                    className="mx-auto overflow-hidden rounded-md border border-border"
                    style={{ aspectRatio: "3 / 4", maxWidth: "180px" }}
                  >
                    <img
                      src={current.map_snapshot_url}
                      alt={`Hole ${holeLabelByNumber(holes, activeHole)} map`}
                      className="block h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">
                    <ImageIcon className="mr-1 h-3.5 w-3.5" /> No tee sign image yet
                  </div>
                )}
              </div>
              </div>

              <div className={panelCls("hole")}>
              {/* Active hole editor */}
              {current ? (
                <details
                  open
                  className="rounded-xl border border-border bg-card [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-sm font-semibold">
                    <span>Hole {holeLabel(current)} details</span>
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 p-3 pt-0">
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="text-sm font-semibold">
                          Hole {holeLabel(current)} distance
                        </div>
                        {current.tee && current.basket ? (
                          <div className="text-[10px] text-muted-foreground">
                            GPS: {distanceFt(current.tee, current.basket)} ft
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        {[-20, -10, -5].map((d) => (
                          <Button
                            key={d}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setHoles((prev) =>
                                prev.map((h) =>
                                  h.number === current.number
                                    ? { ...h, distance_override: Math.max(0, holeDistance(h) + d) }
                                    : h,
                                ),
                              )
                            }
                          >
                            {d}
                          </Button>
                        ))}
                        <Input
                          type="number"
                          min={0}
                          max={2000}
                          className="mx-1 h-9 w-24 text-center"
                          value={holeDistance(current) || ""}
                          placeholder="ft"
                          onChange={(e) => {
                            const v =
                              e.target.value === "" ? null : Math.max(0, parseInt(e.target.value));
                            setHoles((prev) =>
                              prev.map((h) =>
                                h.number === current.number
                                  ? { ...h, distance_override: Number.isNaN(v) ? null : v }
                                  : h,
                              ),
                            );
                          }}
                        />
                        {[5, 10, 20].map((d) => (
                          <Button
                            key={d}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setHoles((prev) =>
                                prev.map((h) =>
                                  h.number === current.number
                                    ? { ...h, distance_override: Math.max(0, holeDistance(h) + d) }
                                    : h,
                                ),
                              )
                            }
                          >
                            +{d}
                          </Button>
                        ))}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {current.distance_override != null
                            ? "Manual override"
                            : "Measured along fairway"}
                        </span>
                        {current.distance_override != null ? (
                          <button
                            className="text-primary hover:underline"
                            onClick={() =>
                              setHoles((prev) =>
                                prev.map((h) =>
                                  h.number === current.number
                                    ? { ...h, distance_override: null }
                                    : h,
                                ),
                              )
                            }
                          >
                            Reset to GPS
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-2 space-y-2">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Hole order · Hole {holeLabel(current)} (#{current.number} of {holeCount})
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => moveHole(current.number, -1)}
                          disabled={current.number <= 1}
                          title="Move this hole one slot earlier"
                        >
                          ↑ Move up
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => moveHole(current.number, 1)}
                          disabled={current.number >= holeCount}
                          title="Move this hole one slot later"
                        >
                          ↓ Move down
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => insertHoleAt(current.number)}
                          title="Insert a new blank hole immediately before this one"
                        >
                          + Insert before
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => insertHoleAt(current.number + 1)}
                          title="Insert a new blank hole immediately after this one"
                        >
                          + Insert after
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => requestHoleDelete(current.number)}
                          disabled={holes.length <= 1}
                          title="Remove this hole from the layout"
                        >
                          {pendingDeleteHole === current.number ? "Confirm delete" : "🗑 Delete"}
                        </Button>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Inserting or reordering renumbers every hole 1–{holeCount} and remaps
                        hole-scoped OB, mandos, and rules automatically.
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <Label className="text-xs">Hole name (overrides the number)</Label>
                        <Input
                          value={current.nickname}
                          placeholder='e.g. "X", "Y", "Island Green"'
                          onChange={(e) =>
                            setHoles((prev) =>
                              prev.map((h) =>
                                h.number === current.number
                                  ? { ...h, nickname: e.target.value }
                                  : h,
                              ),
                            )
                          }
                        />
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Leave blank to keep "{current.number}". Any text here (letters, symbols)
                          replaces the number everywhere in the app.
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Elevation (ft)</Label>
                        <Input
                          type="number"
                          placeholder="±"
                          value={current.elevation_ft ?? ""}
                          onChange={(e) => {
                            const v = e.target.value === "" ? null : parseInt(e.target.value);
                            setHoles((prev) =>
                              prev.map((h) =>
                                h.number === current.number
                                  ? { ...h, elevation_ft: Number.isNaN(v) ? null : v }
                                  : h,
                              ),
                            );
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Shot shape</Label>
                        <select
                          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={current.shot_shape}
                          onChange={(e) =>
                            setHoles((prev) =>
                              prev.map((h) =>
                                h.number === current.number
                                  ? { ...h, shot_shape: e.target.value }
                                  : h,
                              ),
                            )
                          }
                        >
                          {SHOT_SHAPES.map((s) => (
                            <option key={s.v} value={s.v}>
                              {s.l}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Hazards</Label>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {HAZARD_OPTIONS.map((hz) => {
                          const active = current.hazards.includes(hz);
                          return (
                            <button
                              key={hz}
                              type="button"
                              onClick={() =>
                                setHoles((prev) =>
                                  prev.map((h) =>
                                    h.number === current.number
                                      ? {
                                          ...h,
                                          hazards: active
                                            ? h.hazards.filter((x) => x !== hz)
                                            : [...h.hazards, hz],
                                        }
                                      : h,
                                  ),
                                )
                              }
                              className={
                                "rounded-full border px-2 py-0.5 text-xs " +
                                (active
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted")
                              }
                            >
                              {hz}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-sm font-semibold">Caddy notes</div>
                      <Textarea
                        rows={3}
                        placeholder="Tunnel shot right, OB left. Play a controlled hyzer to the corner…"
                        value={current.caddy_notes}
                        onChange={(e) =>
                          setHoles((prev) =>
                            prev.map((h) =>
                              h.number === current.number
                                ? { ...h, caddy_notes: e.target.value }
                                : h,
                            ),
                          )
                        }
                      />
                    </div>

                    <div>
                      <div className="mb-1 text-sm font-semibold">Designer notes</div>
                      <Textarea
                        rows={2}
                        placeholder="Optional notes from the designer (shown on tee signs)."
                        value={current.designer_notes}
                        onChange={(e) =>
                          setHoles((prev) =>
                            prev.map((h) =>
                              h.number === current.number
                                ? { ...h, designer_notes: e.target.value }
                                : h,
                            ),
                          )
                        }
                      />
                    </div>

                    {isEdit && courseId && user ? (
                      <HoleFlythroughUploader
                        courseId={courseId}
                        holeNumber={current.number}
                        holeLabel={holeLabel(current)}
                        userId={user.id}
                        path={current.flythrough_path}
                        url={current.flythrough_url}
                        onChange={({ url, path }) =>
                          setHoles((prev) =>
                            prev.map((h) =>
                              h.number === current.number
                                ? { ...h, flythrough_path: path, flythrough_url: url }
                                : h,
                            ),
                          )
                        }
                      />
                    ) : (
                      <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-[11px] text-muted-foreground">
                        Save the course once to unlock per-hole flythrough uploads.
                      </div>
                    )}


                    {holeFeatures.length ? (
                      <div>
                        {([
                          ["Only on this hole", "Drawn for this hole (or a few holes). Shows on its tee sign.", holeFeatures.filter((x) => x.hole_numbers != null)],
                        ] as const).map(([title, hint, list]) => list.length ? (
                        <div key={title} className="mb-3">
                        <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                          {title} <span className="font-normal normal-case">({list.length})</span>
                        </div>
                        <p className="mb-1 text-[11px] text-muted-foreground">{hint}</p>
                        <div className="space-y-1">
                          {list.map((f) => {
                            const isCourseWide = f.hole_numbers == null;
                            const isOnCurrent =
                              !isCourseWide && f.hole_numbers!.includes(current.number);
                            const toggleHole = (n: number) =>
                              setFeatures((prev) =>
                                prev.map((x) => {
                                  if (x.tempId !== f.tempId) return x;
                                  // A course-wide feature becomes hole-specific on the
                                  // first hole picked, so a mando can be moved to its hole
                                  // without a separate step.
                                  if (x.hole_numbers == null) return { ...x, hole_numbers: [n] };
                                  const cur = x.hole_numbers;
                                  const next = cur.includes(n)
                                    ? cur.filter((h) => h !== n)
                                    : [...cur, n].sort((a, b) => a - b);
                                  return { ...x, hole_numbers: next.length ? next : [activeHole] };
                                }),
                              );
                            const isEditingRow = editingFeatureId === f.tempId;
                            return (
                              <div
                                key={f.tempId}
                                className={`rounded-md p-2 text-xs space-y-1 cursor-pointer transition-colors border-l-2 ${isEditingRow ? "bg-primary/15 ring-1 ring-primary" : "bg-muted/50 hover:bg-muted"} ${isCourseWide ? "border-l-amber-500" : "border-l-primary"}`}
                                onClick={() => setEditingFeatureId(f.tempId)}
                              >
                                <div className="flex items-center gap-1">
                                  <FeatureGlyph type={f.type} size={14} />
                                  <span className="font-semibold">
                                    {FEATURE_CONFIG[f.type].label}
                                  </span>
                                  {isCourseWide ? (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                      <Globe2 className="h-2.5 w-2.5" />
                                      Course-wide
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-primary/20 px-1 py-0.5 text-[10px] font-semibold text-primary">
                                      <Pin className="h-2.5 w-2.5" />
                                      {f.hole_numbers!.length === 1
                                        ? `Hole ${f.hole_numbers![0]}`
                                        : `${f.hole_numbers!.length} holes`}
                                    </span>
                                  )}
                                  {f.ob_side !== "none" ? (
                                    <span className="text-red-400">
                                      {f.type === "mando"
                                        ? `· pass ${f.ob_side}`
                                        : `· OB ${f.ob_side}`}
                                    </span>
                                  ) : null}
                                  {isEditingRow ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingFeatureId(null);
                                      }}
                                      className="rounded bg-primary/30 px-1 text-[10px] font-semibold text-primary hover:bg-primary/40"
                                    >
                                      Done
                                    </button>
                                  ) : null}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeFeature(f.tempId);
                                    }}
                                    className="ml-auto text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                                <Input
                                  value={f.label}
                                  placeholder="Label / name (e.g. Pond, Gap right)"
                                  className="h-7 text-xs"
                                  onChange={(e) =>
                                    setFeatures((prev) =>
                                      prev.map((x) =>
                                        x.tempId === f.tempId ? { ...x, label: e.target.value } : x,
                                      ),
                                    )
                                  }
                                />
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground mr-1">
                                    Applies to:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFeatures((prev) =>
                                        prev.map((x) =>
                                          x.tempId === f.tempId ? { ...x, hole_numbers: null } : x,
                                        ),
                                      )
                                    }
                                    className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] border ${isCourseWide ? "bg-amber-500 text-amber-50 border-amber-500" : "border-input text-muted-foreground hover:bg-muted"}`}
                                  >
                                    <Globe2 className="h-2.5 w-2.5" />
                                    Course-wide
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleHole(current.number)}
                                    disabled={isCourseWide}
                                    className={`rounded px-1.5 py-0.5 text-[10px] border disabled:opacity-40 ${isOnCurrent ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-muted"}`}
                                  >
                                    H{current.number}
                                  </button>
                                </div>
                                {isEditingRow ? (
                                  <div className="flex flex-wrap gap-0.5">
                                    {holes.map((h) => {
                                      const on = !isCourseWide && f.hole_numbers!.includes(h.number);
                                      return (
                                        <button
                                          key={h.number}
                                          type="button"
                                          onClick={() => toggleHole(h.number)}
                                          className={`h-6 w-6 rounded text-[10px] border ${on ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-muted"}`}
                                        >
                                          {h.number}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : null}
                                {f.type === "mando" ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground">
                                      Pass:
                                    </span>
                                    <select
                                      value={f.ob_side === "left" || f.ob_side === "right" ? f.ob_side : "none"}
                                      className="h-7 flex-1 rounded-md border border-input bg-background px-1 text-xs"
                                      onChange={(e) =>
                                        setFeatures((prev) =>
                                          prev.map((x) =>
                                            x.tempId === f.tempId
                                              ? { ...x, ob_side: e.target.value as ObSide }
                                              : x,
                                          ),
                                        )
                                      }
                                    >
                                      <option value="left">Pass left of the mando</option>
                                      <option value="right">Pass right of the mando</option>
                                      <option value="none">Direction not set</option>
                                    </select>
                                  </div>
                                ) : null}
                                {FEATURE_CONFIG[f.type].geom === "line" &&
                                (f.type === "ob_line" || f.type === "ob_reference") ? (
                                  <select
                                    value={f.ob_side}
                                    className="h-7 w-full rounded-md border border-input bg-background px-1 text-xs"
                                    onChange={(e) =>
                                      setFeatures((prev) =>
                                        prev.map((x) =>
                                          x.tempId === f.tempId
                                            ? { ...x, ob_side: e.target.value as ObSide }
                                            : x,
                                        ),
                                      )
                                    }
                                  >
                                    <option value="left">{obSideLabel("left")}</option>
                                    <option value="right">{obSideLabel("right")}</option>
                                    <option value="none">
                                      {f.type === "ob_reference" ? "Reference only" : "Line only"}
                                    </option>
                                  </select>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                        </div>
                        ) : null)}
                        {holeFeatures.some((x) => x.hole_numbers == null) ? (
                          <button type="button" onClick={() => setPanel("features")} className="w-full rounded-md border border-dashed border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted">
                            {holeFeatures.filter((x) => x.hole_numbers == null).length} course-wide items also apply here · View in Features
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
              </div>

              <div className={panelCls("features")}>
              {courseId && loadedLayoutId ? <LayoutRulePicker courseId={courseId} layoutId={loadedLayoutId} /> : null}
              {/* All features */}
              {features.length
                ? (() => {
                    const courseWide = features.filter((f) => f.hole_numbers == null);
                    const holeSpecific = features.filter((f) => f.hole_numbers != null);
                    const renderRow = (f: (typeof features)[number]) => {
                      const isCourseWide = f.hole_numbers == null;
                      const badge = isCourseWide ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          <Globe2 className="h-2.5 w-2.5" />
                          Course
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 rounded bg-primary/20 px-1 py-0.5 text-[10px] font-semibold text-primary">
                          <Pin className="h-2.5 w-2.5" />
                          {f.hole_numbers!.length === 1
                            ? `H${f.hole_numbers![0]}`
                            : `${f.hole_numbers!.length}h`}
                        </span>
                      );
                      return (
                        <div
                          key={f.tempId}
                          className={`space-y-1 rounded-md border-l-2 bg-muted/40 px-2 py-1.5 text-xs ${isCourseWide ? "border-l-amber-500" : "border-l-primary"}`}
                        >
                          <div className="flex items-center gap-2">
                            <FeatureGlyph type={f.type} size={15} />
                            <span className="w-16 truncate">{FEATURE_CONFIG[f.type].label}</span>
                            <Input
                              value={f.label}
                              placeholder="Label"
                              className="h-7 flex-1 text-xs"
                              onChange={(e) =>
                                setFeatures((prev) =>
                                  prev.map((x) =>
                                    x.tempId === f.tempId ? { ...x, label: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                            {badge}
                            <button
                              onClick={() => removeFeature(f.tempId)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          {f.type !== "course_boundary" ? <AssignmentPicker f={f} /> : null}
                        </div>
                      );
                    };
                    return (
                      <details className="rounded-xl border border-border bg-card [&_summary::-webkit-details-marker]:hidden">
                        <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2">
                          <div className="text-sm font-semibold">
                            All features ({features.length})
                          </div>
                          <ChevronDown className="h-4 w-4" />
                        </summary>
                        <div className="max-h-[320px] space-y-3 overflow-y-auto p-3 pt-0">
                          {courseWide.length ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                <Globe2 className="h-3 w-3" />
                                Course-wide ({courseWide.length})
                              </div>
                              {courseWide.map(renderRow)}
                            </div>
                          ) : null}
                          {holeSpecific.length ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                <Pin className="h-3 w-3" />
                                Hole-specific ({holeSpecific.length})
                              </div>
                              {holeSpecific.map(renderRow)}
                            </div>
                          ) : null}
                        </div>
                      </details>
                    );
                  })()
                : null}
              </div>

              {/* Every mapped pairing has its own par and distance. */}
              <div className={panelCls("pars")}>
                <div className="rounded-xl border bg-card p-3 space-y-3">
                  <h3 className="text-sm font-semibold">Tee → basket pars & distances</h3>
                  <p className="text-xs text-muted-foreground">Layout totals use its main tee-to-basket pairing on each hole. Alternate pairings keep their own values.</p>
                  {holes.map(h=><details key={h.number} open={h.number===activeHole} className="rounded-lg border p-2">
                    <summary className="cursor-pointer text-sm font-semibold" onClick={()=>setActiveHole(h.number)}>Hole {holeLabel(h)}{h.nickname ? ` · ${h.nickname}` : ""}</summary>
                    <details className="my-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Hole name & basket in use</summary>
                      <label className="mt-2 block">Hole name<input aria-label={`Hole ${h.number} name`} className="mt-1 w-full rounded border bg-background p-2" value={h.nickname} onChange={e=>setHoles(prev=>prev.map(row=>row.number===h.number ? {...row,nickname:e.target.value} : row))}/></label>
                      {h.extra_baskets.length>0 && <label className="mt-2 block">Basket in use<select className="ml-2 rounded border bg-background p-1" value={h.current_pin ?? ""} onChange={e=>setHoles(prev=>prev.map(row=>row.number===h.number ? {...row,current_pin:e.target.value||null} : row))}><option value="">{h.basket_name || "Main basket"}</option>{h.extra_baskets.map(b=><option key={b.tempId} value={b.name}>{b.name}</option>)}</select></label>}
                      <Button size="sm" variant="outline" className="mt-2 text-destructive" disabled={holes.length<=1} onClick={()=>requestHoleDelete(h.number)}>{pendingDeleteHole===h.number ? "Confirm delete hole" : "Delete hole"}</Button>
                    </details>
                    <div className="mt-2"><PairScoreTable hole={h} onChange={(tee,basket,patch)=>setHoles(previous=>previous.map(row=>row.number===h.number ? setPairScoring(row,tee,basket,patch) : row))} onEdit={route=>{setActiveHole(h.number);setSelectedFairway({number:h.number,route});setEditingFeatureId(null);setTool({kind:"select"});setPanel(null);}}/></div>
                  </details>)}
                </div>
              </div>
            </>
          ) : null}
        </aside>

        {/* Center map */}
        <div className="relative min-h-[400px] min-w-0">
          <div
            ref={mapWrapRef}
            className="absolute inset-0 [&_.leaflet-bottom.leaflet-right]:mb-24"
          >
            {mapMenu ? (
              <div
                role="menu"
                className="absolute z-[1100] min-w-[190px] rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
                style={{ left: Math.max(4, mapMenu.x), top: Math.max(4, mapMenu.y) }}
              >
                {holePlacementReady
                  ? (["tee", "basket"] as const).map((target) => (
                      <button
                        key={target}
                        role="menuitem"
                        className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                        onClick={() => {
                          const p: [number, number] = [mapMenu.lat, mapMenu.lng];
                          setHoles((prev) =>
                            prev.map((h) => (h.number === activeHole ? ({ ...h, [target]: p } as HoleDraft) : h)),
                          );
                          toast.success(`${target === "tee" ? "Tee" : "Basket"} for hole ${activeHole} moved here.`);
                          setMapMenu(null);
                        }}
                      >
                        {`Put hole ${activeHole} ${target} here`}
                      </button>
                    ))
                  : null}
                <button
                  role="menuitem"
                  className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                  onClick={() => {
                    mapRef.current?.panTo([mapMenu.lat, mapMenu.lng]);
                    setMapMenu(null);
                  }}
                >
                  Centre map here
                </button>
                <button
                  role="menuitem"
                  className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                  onClick={() => {
                    void navigator.clipboard?.writeText(`${mapMenu.lat.toFixed(6)}, ${mapMenu.lng.toFixed(6)}`);
                    toast.success("Coordinates copied");
                    setMapMenu(null);
                  }}
                >
                  Copy coordinates
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  role="menuitem"
                  disabled={!canUndo}
                  className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                  onClick={() => { undo(); setMapMenu(null); }}
                >
                  Undo
                </button>
                <button
                  role="menuitem"
                  disabled={historyRef.current.future.length === 0}
                  className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                  onClick={() => { redo(); setMapMenu(null); }}
                >
                  Redo
                </button>
              </div>
            ) : null}
            <MapContainer
              center={center}
              zoom={zoom}
              zoomSnap={0.25}
              zoomDelta={0.25}
              wheelPxPerZoomLevel={600}
              scrollWheelZoom
              maxZoom={22}
              style={{ height: "100%", width: "100%" }}
              ref={(m) => {
                mapRef.current = m;
              }}
              {...({
                rotate: true,
                touchRotate: true,
                bearing: 0,
                rotateControl: { closeOnZeroBearing: false, position: "topleft" },
              } as unknown as Record<string, unknown>)}
            >
              <RightClickRotate />
              <ReferenceOverlayLayer image={overlay.image} onChange={overlay.setImage} mark={overlayOpen?overlayMark:null} onMarked={() => setOverlayMark(null)} hole={activeHole}/>
              <CourseBasemapLayers />
              <FlyTo target={center} zoom={zoom} triggerKey={`${center[0]},${center[1]},${zoom}`} />
              <HoleFocus
                tee={current?.tee ?? null}
                basket={current?.basket ?? null}
                waypoints={current?.flight_path ?? []}
                fallback={center}
                triggerKey={current?.number ?? null}
              />

              <ClickCapture onClick={(ll) => { setMapMenu(null); handleMapClick(ll); }} />
              <ContextMenuCapture
                onOpen={(ll, x, y) => setMapMenu(ll ? { lat: ll.lat, lng: ll.lng, x, y } : null)}
              />

              {(() => {
                const renderHole = (h: HoleDraft) => {
                const isActive = h.number === activeHole;

                const allTees: Array<{
                  pt: [number, number];
                  color: string;
                  bearing: number | null;
                  dz?: boolean;
                  onTurn?: (v: number) => void;
                  key: string;
                  onDrag: (p: [number, number]) => void;
                  onRename: (name: string) => void;
                  onRemove: () => void;
                }> = [];

                if (h.tee)
                  allTees.push({
                    pt: h.tee,
                    color: h.tee_color || "#ffffff",
                    bearing: h.tee_bearing ?? ((h.flight_path[0] ?? h.basket) ? bearingDeg(h.tee, (h.flight_path[0] ?? h.basket)!) : null),
                    key: `t-main-${h.number}`,
                    onDrag: (p) =>
                      setHoles((prev) =>
                        prev.map((x) =>
                          x.number === h.number
                            ? {
                                ...x,
                                tee: p,
                              }
                            : x,
                        ),
                      ),
                    onRename: (nm) =>
                      setHoles((prev) =>
                        prev.map((x) => (x.number === h.number ? { ...x, tee_name: nm } : x)),
                      ),
                    onRemove: () =>
                      setHoles((prev) =>
                        prev.map((x) =>
                          x.number === h.number ? { ...x, tee: null } : x,
                        ),
                      ),
                  });
                if (isActive)
                  h.extra_tees.forEach((t) => {
                    if (t.lat != null && t.lng != null)
                      allTees.push({
                        pt: [t.lat, t.lng],
                        color: t.color || "#ffffff",
                        bearing: t.bearing ?? ((t.bends?.[0] ?? h.basket) ? bearingDeg([t.lat, t.lng], (t.bends?.[0] ?? h.basket)!) : null),
                        onTurn: (v: number) =>
                          setHoles((prev) =>
                            prev.map((x) =>
                              x.number === h.number
                                ? { ...x, extra_tees: x.extra_tees.map((y) => (y.tempId === t.tempId ? { ...y, bearing: v } : y)) }
                                : x,
                            ),
                          ),
                        dz: !!t.is_drop_zone,
                        key: `t-${t.tempId}`,
                        onDrag: (p) =>
                          setHoles((prev) =>
                            prev.map((x) =>
                              x.number === h.number
                                ? {
                                    ...x,
                                    extra_tees: x.extra_tees.map((y) =>
                                      y.tempId === t.tempId ? { ...y, lat: p[0], lng: p[1] } : y,
                                    ),
                                  }
                                : x,
                            ),
                          ),
                        onRename: (nm) =>
                          setHoles((prev) =>
                            prev.map((x) =>
                              x.number === h.number
                                ? {
                                    ...x,
                                    extra_tees: x.extra_tees.map((y) =>
                                      y.tempId === t.tempId ? { ...y, name: nm } : y,
                                    ),
                                  }
                                : x,
                            ),
                          ),
                        onRemove: () => {
                          removedPinIdsRef.current.add(t.tempId);
                          setHoles(prev=>prev.map(x=>x.number===h.number ? {...x,extra_tees:x.extra_tees.filter(y=>y.tempId!==t.tempId)} : x));
                        },
                      });
                  });
                const allBaskets: Array<{
                  pt: [number, number];
                  color: string;
                  key: string;
                  onDrag: (p: [number, number]) => void;
                  onRename: (name: string) => void;
                  onRemove: () => void;
                }> = [];
                if (h.basket)
                  allBaskets.push({
                    pt: h.basket,
                    color: h.basket_color || "#a3e635",
                    key: `b-main-${h.number}`,
                    onDrag: (p) =>
                      setHoles((prev) =>
                        prev.map((x) =>
                          x.number === h.number
                            ? {
                                ...x,
                                basket: p,
                              }
                            : x,
                        ),
                      ),
                    onRename: (nm) =>
                      setHoles((prev) =>
                        prev.map((x) => (x.number === h.number ? { ...x, basket_name: nm } : x)),
                      ),
                    onRemove: () =>
                      setHoles((prev) =>
                        prev.map((x) =>
                          x.number === h.number ? { ...x, basket: null } : x,
                        ),
                      ),
                  });
                if (isActive)
                  h.extra_baskets.forEach((b) => {
                    if (b.lat != null && b.lng != null)
                      allBaskets.push({
                        pt: [b.lat, b.lng],
                        color: b.color || "#a3e635",
                        key: `b-${b.tempId}`,
                        onDrag: (p) =>
                          setHoles((prev) =>
                            prev.map((x) =>
                              x.number === h.number
                                ? {
                                    ...x,
                                    extra_baskets: x.extra_baskets.map((y) =>
                                      y.tempId === b.tempId ? { ...y, lat: p[0], lng: p[1] } : y,
                                    ),
                                  }
                                : x,
                            ),
                          ),
                        onRename: (nm) =>
                          setHoles((prev) =>
                            prev.map((x) =>
                              x.number === h.number
                                ? {
                                    ...x,
                                    extra_baskets: x.extra_baskets.map((y) =>
                                      y.tempId === b.tempId ? { ...y, name: nm } : y,
                                    ),
                                  }
                                : x,
                            ),
                          ),
                        onRemove: () => {
                          removedPinIdsRef.current.add(b.tempId);
                          setHoles(prev=>prev.map(x=>x.number===h.number ? {...x,extra_baskets:x.extra_baskets.filter(y=>y.tempId!==b.tempId)} : x));
                        },
                      });
                  });
                if (!allTees.length && !allBaskets.length) return null;
                return (
                  <Fragment key={h.number}>
                    {/* Tee pad rectangle removed per request */}

                    {allTees.map((t, i) => {
                      const nm =
                        t.key.startsWith("t-main-")
                          ? h.tee_name || "Main"
                          : h.extra_tees.find(p => `t-${p.tempId}` === t.key)?.name || `Tee ${i + 1}`;
                      return (
                        <Fragment key={t.key}>
                        <StudioEndpointMarker
                          position={t.pt}
                          interactive={!saving && tool.kind === "select" && !placingTeeId && !placingBasketId}
                          icon={teeIcon({
                            hole: holeLabel(h),
                            name: nm,
                            color: t.color,
                            active: isActive,
                            bearing: t.bearing,
                            dropZone: t.dz,
                          })}
                          draggable={positionsUnlocked && isActive && tool.kind === "select" && !saving}
                          bubblingMouseEvents={false}
                          eventHandlers={{
                            mousedown: (e) => beginMarkerDrag(e, t.onDrag),
                            mouseup: (e) => finishFeatureDrag(e, t.onDrag),
                            click: (e) => {
                              finishFeatureDrag(e, t.onDrag);
                              selectPin(h.number, "tee", t.key.startsWith("t-main-") ? "main-tee" : t.key.slice(2));
                            },
                            dblclick: stopLeafletClick,
                            contextmenu: stopLeafletClick,
                            dragstart: (e) => beginMarkerDrag(e, t.onDrag),
                            drag: (e) => { continueFeatureDrag(e); const point=getDragLatLng(e); if(point)setEndpointPreview({hole:h.number,group:"tees",id:t.key.startsWith("t-main-") ? "main-tee" : t.key.slice(2),point}); },
                            dragend: (e) => {
                              setEndpointPreview(null);finishFeatureDrag(e, t.onDrag);
                            },
                          }}
                        >

                        </StudioEndpointMarker>
                        {positionsUnlocked && !saving && isActive && tool.kind === "select" && !placingTeeId && !placingBasketId && t.bearing != null ? (
                          <RotateHandle
                            center={t.pt}
                            bearing={t.bearing}
                            onChange={(v) =>
                              t.key.startsWith("t-main-")
                                ? setHoles((prev) => prev.map((x) => (x.number === h.number ? { ...x, tee_bearing: v } : x)))
                                : t.onTurn?.(v)
                            }
                          />
                        ) : null}
                        </Fragment>
                      );
                    })}
                    {allBaskets.map((b, i) => {
                      const pn =
                        b.key.startsWith("b-main-")
                          ? h.basket_name || "A"
                          : h.extra_baskets.find(p => `b-${p.tempId}` === b.key)?.name || String.fromCharCode(65 + i);
                      return (
                        <StudioEndpointMarker
                          key={b.key}
                          interactive={!saving && tool.kind === "select" && !placingTeeId && !placingBasketId}
                          position={b.pt}
                          icon={basketIcon({
                            hole: holeLabel(h),
                            pin: pn,
                            color: b.color,
                            active: isActive,
                          })}
                          draggable={positionsUnlocked && isActive && tool.kind === "select" && !saving}
                          bubblingMouseEvents={false}
                          eventHandlers={{
                            mousedown: (e) => beginMarkerDrag(e, b.onDrag),
                            mouseup: (e) => finishFeatureDrag(e, b.onDrag),
                            click: (e) => {
                              finishFeatureDrag(e, b.onDrag);
                              selectPin(h.number, "basket", b.key.startsWith("b-main-") ? "main-basket" : b.key.slice(2));
                            },
                            dblclick: stopLeafletClick,
                            contextmenu: stopLeafletClick,
                            dragstart: (e) => beginMarkerDrag(e, b.onDrag),
                            drag: (e) => { continueFeatureDrag(e); const point=getDragLatLng(e); if(point)setEndpointPreview({hole:h.number,group:"baskets",id:b.key.startsWith("b-main-") ? "main-basket" : b.key.slice(2),point}); },
                            dragend: (e) => {
                              setEndpointPreview(null);finishFeatureDrag(e, b.onDrag);
                            },
                          }}
                        >

                        </StudioEndpointMarker>
                      );
                    })}
                    <StudioFairwayEditor
                      hole={h}
                      active={isActive}
                      editable={isActive && tool.kind === "select" && !placingTeeId && !placingBasketId}
                      selectedRoute={selectedFairway?.number===h.number ? selectedFairway.route : null}
                      endpointPreview={endpointPreview?.hole===h.number ? endpointPreview : null}
                      onSelect={route=>{setSelectedFairway(route ? {number:h.number,route} : null);setEditingFeatureId(null);}}
                      onScoringChange={(tee,basket,patch)=>setHoles(previous=>previous.map(hole=>hole.number===h.number ? setPairScoring(hole,tee,basket,patch) : hole))}
                      onChange={draft=>setHoles(previous=>previous.map(hole=>hole.number===h.number ? applyStudioFairways(hole,draft) : hole))}
                    />
                  </Fragment>
                );
                };
                const others = holes.filter((h) => h.number !== activeHole);
                return (
                  <>
                    {holes.filter((h) => h.number === activeHole).map(renderHole)}
                    {otherHoles === "hidden" ? null : (
                      <Pane
                        name="dgd-other-holes"
                        style={{ zIndex: 590, opacity: otherHoles === "faded" ? 0.4 : 1 }}
                      >
                        {others.map(renderHole)}
                      </Pane>
                    )}
                  </>
                );
              })()}

              {/* When picking a Segment of existing OB, brighten every eligible
                    source (ob_line, ob_area, course_boundary) so users can see
                    where to click, and mark the start point after the first pick. */}
              {tool.kind === "ob-ref" ? (
                <>
                  {features
                    .filter(
                      (f) =>
                        (f.type === "ob_line" ||
                          f.type === "ob_area" ||
                          f.type === "course_boundary") &&
                        f.points.length >= 2,
                    )
                    .map((f) => {
                      const isClosed = f.type === "ob_area" || f.type === "course_boundary";
                      return isClosed ? (
                        <Polygon
                          key={`obref-hi-${f.tempId}`}
                          positions={f.points}
                          interactive={false}
                          pathOptions={{
                            color: "#fde047",
                            weight: 5,
                            opacity: 0.95,
                            fillOpacity: 0,
                            dashArray: "1 6",
                          }}
                        />
                      ) : (
                        <Polyline
                          key={`obref-hi-${f.tempId}`}
                          positions={f.points}
                          interactive={false}
                          pathOptions={{
                            color: "#fde047",
                            weight: 8,
                            opacity: 0.65,
                            lineCap: "round",
                          }}
                        />
                      );
                    })}
                  {tool.draft
                    ? (() => {
                        const draft = tool.draft;
                        if (!draft) return null;
                        const src = features.find((f) => f.tempId === draft.sourceTempId);
                        if (!src) return null;
                        const srcPts: GeoLatLng[] = src.points.map(
                          (p) => [p[0], p[1]] as GeoLatLng,
                        );
                        const closed = src.type === "ob_area" || src.type === "course_boundary";
                        const startProj = findNearestObSource(
                          [draft.startPoint[0], draft.startPoint[1]] as GeoLatLng,
                          [{ key: "s", pts: srcPts, closed }],
                          1000,
                        );
                        if (!startProj) return null;
                        const pointer = extractSubPath(
                          srcPts,
                          closed,
                          startProj.proj,
                          startProj.proj,
                        );
                        return pointer && pointer.length >= 2 ? (
                          <Fragment key="obref-draft-preview">
                            {renderObHighlight(
                              pointer as [number, number][],
                              draftObSide,
                              "#ef4444",
                              axisForFeature({ hole_numbers: [activeHole] }),
                              boundaryPtsForOb,
                              avoidPtsForOb,
                            )}
                          </Fragment>
                        ) : null;
                      })()
                    : null}
                  {tool.draft ? (
                    <CircleMarker
                      center={tool.draft.startPoint}
                      radius={7}
                      pathOptions={{
                        color: "#fde047",
                        fillColor: "#facc15",
                        fillOpacity: 1,
                        weight: 2,
                      }}
                      interactive={false}
                    />
                  ) : null}
                </>
              ) : null}

              {holeFeatures.map((f) => {
                const cfg = FEATURE_CONFIG[f.type];
                const isEditing = editingFeatureId === f.tempId || (propertyOpen && f.type === "course_boundary" && !boundaryLocked);
                const isSelectMode = tool.kind === "select";
                const canInteract = isSelectMode || isEditing;
                if (cfg.geom === "point") {
                  const marker = (
                    <StudioEndpointMarker
                      key={f.tempId + (canInteract ? ":i" : "")}
                      position={f.points[0]}
                      icon={featureIcon(f.type, {
                        active: isEditing,
                        mandoSide:
                          f.type === "mando"
                            ? f.ob_side === "left" || f.ob_side === "right" || f.ob_side === "past"
                              ? f.ob_side
                              : "none"
                            : undefined,
                        mandoBearing: f.type === "mando" || f.type === "dropzone" ? f.bearing ?? null : undefined,
                      })}
                      draggable={canInteract}
                      interactive={canInteract}
                      bubblingMouseEvents={false}
                      zIndexOffset={isEditing ? 1400 : 700}
                      eventHandlers={{
                        mousedown: (e) =>
                          beginMarkerDrag(e, (p) => {
                            setFeatures((prev) =>
                              prev.map((x) => (x.tempId === f.tempId ? { ...x, points: [p] } : x)),
                            );
                          }),
                        dblclick: stopLeafletClick,
                        contextmenu: stopLeafletClick,
                        click: (e) => {
                          stopLeafletBubble(e);
                          finishFeatureDrag(e);
                          if (canInteract) {
                            selectFeature(f.tempId);
                          }
                        },
                        dragstart: (e) => {
                          beginMarkerDrag(e, (p) => {
                            setFeatures((prev) =>
                              prev.map((x) => (x.tempId === f.tempId ? { ...x, points: [p] } : x)),
                            );
                          });
                        },
                        drag: continueFeatureDrag,
                        dragend: (e) => {
                          finishFeatureDrag(e, (p) => {
                            setFeatures((prev) =>
                              prev.map((x) => (x.tempId === f.tempId ? { ...x, points: [p] } : x)),
                            );
                          });
                          if (canInteract) selectFeature(f.tempId);
                        },
                      }}
                    >
                      {null}
                    </StudioEndpointMarker>
                  );
                  const rotatable = isEditing && (f.type === "mando" || f.type === "dropzone");
                  return rotatable ? (
                    <Fragment key={f.tempId + ":r"}>
                      {marker}
                      <RotateHandle
                        center={f.points[0]}
                        bearing={f.bearing ?? (f.ob_side === "left" ? 270 : f.ob_side === "right" ? 90 : 0)}
                        onChange={(v) => setFeatures((prev) => prev.map((x) => (x.tempId === f.tempId ? { ...x, bearing: v } : x)))}
                      />
                    </Fragment>
                  ) : marker;
                }
                if (cfg.geom === "line" || cfg.geom === "polygon") {
                  const isPoly = cfg.geom === "polygon";
                  const isBoundary = f.type === "course_boundary";
                  const locked = isBoundary && boundaryLocked;
                  const updatePoints = (fn: (pts: [number, number][]) => [number, number][]) =>
                    setFeatures((prev) =>
                      prev.map((x) => (x.tempId === f.tempId ? { ...x, points: fn(x.points) } : x)),
                    );
                  const minPts = isPoly ? 3 : 2;
                  const midPairs: [number, number][] = [];
                  for (let i = 0; i < f.points.length - 1; i++) midPairs.push([i, i + 1]);
                  if (isPoly && f.points.length >= 3) midPairs.push([f.points.length - 1, 0]);
                  const selectHandler = {
                    mousedown: stopLeafletBubble,
                    dblclick: stopLeafletClick,
                    contextmenu: stopLeafletClick,
                    click: (e: unknown) => {
                      stopLeafletBubble(e);
                      selectFeature(f.tempId);
                    },
                  };
                  const interactive = canInteract;
                  const handlers = interactive ? selectHandler : undefined;
                  // Highlight when editing
                  const editHighlight = isEditing ? { opacity: 1 } : { opacity: 0.9 };
                  // Leaflet fixes "interactive" when a shape is created, so remount when select mode toggles.
                  return (
                    <Fragment key={f.tempId + (interactive ? ":i" : "")}>
                      {isBoundary && f.points.length >= 3 ? (
                        <>
                          <Polygon
                            positions={[
                              [
                                [-85, -180],
                                [-85, 180],
                                [85, 180],
                                [85, -180],
                              ] as [number, number][],
                              f.points,
                            ]}
                            interactive={false}
                            pathOptions={{
                              color: "#ef4444",
                              weight: 0,
                              fillColor: "#ef4444",
                              fillOpacity: 0.22,
                              fillRule: "evenodd",
                            }}
                          />
                          <Polygon
                            positions={f.points}
                            eventHandlers={handlers}
                            bubblingMouseEvents={false}
                            interactive={interactive}
                            pathOptions={{
                              color: cfg.color,
                              weight: isEditing ? 4 : 3,
                              dashArray: "6 4",
                              fill: false,
                              fillOpacity: 0,
                              opacity: 0.95,
                            }}
                          >
                            {null}
                          </Polygon>
                        </>
                      ) : f.type === "island_green" && f.points.length >= 3 ? (
                        <Polygon
                          positions={f.points}
                          eventHandlers={handlers}
                          bubblingMouseEvents={false}
                          interactive={interactive}
                          pathOptions={{
                            color: cfg.color,
                            weight: isEditing ? 4 : 3,
                            fillColor: cfg.color,
                            fillOpacity: isEditing ? 0.35 : 0.25,
                            opacity: 1,
                          }}
                        >
                          {null}
                        </Polygon>
                      ) : isPoly ? (
                        <Polygon
                          positions={f.points}
                          eventHandlers={handlers}
                          bubblingMouseEvents={false}
                          interactive={interactive}
                          pathOptions={{
                            color: cfg.color,
                            weight: isEditing ? 3 : 2,
                            fillOpacity:
                              f.type === "ob_area"
                                ? isEditing
                                  ? 0.38
                                  : 0.28
                                : isEditing
                                  ? 0.28
                                  : 0.18,
                            ...editHighlight,
                          }}
                        >
                          {null}
                        </Polygon>
                      ) : (
                        <>
                          {f.type === "ob_line" || f.type === "ob_reference" ? (
                            <>
                              {renderObHighlight(
                                f.points,
                                f.ob_side,
                                cfg.color,
                                axisForFeature(f),
                                boundaryPtsForOb,
                                avoidPtsForOb,
                              )}
                            </>
                          ) : null}
                          <Polyline
                            positions={f.points}
                            eventHandlers={handlers}
                            bubblingMouseEvents={false}
                            interactive={interactive}
                            pathOptions={{
                              color: cfg.color,
                              weight: isEditing ? 6 : 4,
                              dashArray:
                                f.type === "ob_line"
                                  ? "8 6"
                                  : f.type === "ob_reference"
                                    ? "2 6"
                                    : f.type === "fence"
                                      ? "2 6"
                                      : "10 6",
                              ...editHighlight,
                            }}
                          >
                            {null}
                          </Polyline>
                        </>
                      )}

                      {isEditing && !locked && f.points.length >= 2
                        ? (() => {
                            // Whole-shape move handle: drag the centre to slide every point together.
                            const c: [number, number] = [
                              f.points.reduce((t, q) => t + q[0], 0) / f.points.length,
                              f.points.reduce((t, q) => t + q[1], 0) / f.points.length,
                            ];
                            const shift = (point: [number, number]) =>
                              updatePoints((pts) =>
                                pts.map((q) => [q[0] + point[0] - c[0], q[1] + point[1] - c[1]] as [number, number]),
                              );
                            return (
                              <Marker
                                key={`move-${f.tempId}`}
                                position={c}
                                icon={featureIcon(f.type, { active: true })}
                                draggable
                                bubblingMouseEvents={false}
                                zIndexOffset={1200}
                                title="Drag to move the whole shape"
                                eventHandlers={{
                                  mousedown: (e) => beginMarkerDrag(e, shift),
                                  dragstart: (e) => beginMarkerDrag(e, shift),
                                  drag: continueFeatureDrag,
                                  dragend: (e) => finishFeatureDrag(e, shift),
                                  mouseup: (e) => finishFeatureDrag(e, shift),
                                  dblclick: stopLeafletClick,
                                  contextmenu: stopLeafletClick,
                                }}
                              />
                            );
                          })()
                        : null}
                      {isEditing && !locked
                        ? f.points.map((p, i) => (
                            <Marker
                              key={`v-${i}`}
                              position={p}
                              icon={vertexHandleIcon(cfg.color)}
                              draggable
                              bubblingMouseEvents={false}
                              zIndexOffset={1000}
                              eventHandlers={{
                                mousedown: (e) =>
                                  beginMarkerDrag(e, (point) =>
                                    updatePoints((pts) => pts.map((q, j) => (j === i ? point : q))),
                                  ),
                                mouseup: (e) =>
                                  finishFeatureDrag(e, (point) =>
                                    updatePoints((pts) => pts.map((q, j) => (j === i ? point : q))),
                                  ),
                                click: (e) => {
                                  finishFeatureDrag(e, (point) =>
                                    updatePoints((pts) => pts.map((q, j) => (j === i ? point : q))),
                                  );
                                },
                                dblclick: stopLeafletClick,
                                contextmenu: stopLeafletClick,
                                dragstart: (e) =>
                                  beginMarkerDrag(e, (point) =>
                                    updatePoints((pts) => pts.map((q, j) => (j === i ? point : q))),
                                  ),
                                drag: continueFeatureDrag,
                                dragend: (e) => {
                                  finishFeatureDrag(e, (point) =>
                                    updatePoints((pts) => pts.map((q, j) => (j === i ? point : q))),
                                  );
                                },
                              }}
                            >
                              <Popup autoPan={false} closeButton={false}>
                                <div className="flex flex-col gap-1 text-xs">
                                  <div className="font-semibold">
                                    Point {i + 1} of {f.points.length}
                                  </div>
                                  <button
                                    className="rounded bg-muted px-2 py-1 text-left hover:bg-muted/70"
                                    onClick={() => {
                                      const prev =
                                        f.points[(i - 1 + f.points.length) % f.points.length];
                                      const mid: [number, number] = [
                                        (prev[0] + p[0]) / 2,
                                        (prev[1] + p[1]) / 2,
                                      ];
                                      updatePoints((pts) => [
                                        ...pts.slice(0, i),
                                        mid,
                                        ...pts.slice(i),
                                      ]);
                                    }}
                                  >
                                    Insert point before
                                  </button>
                                  <button
                                    className="rounded bg-muted px-2 py-1 text-left hover:bg-muted/70"
                                    onClick={() => {
                                      const next = f.points[(i + 1) % f.points.length];
                                      const mid: [number, number] = [
                                        (next[0] + p[0]) / 2,
                                        (next[1] + p[1]) / 2,
                                      ];
                                      updatePoints((pts) => [
                                        ...pts.slice(0, i + 1),
                                        mid,
                                        ...pts.slice(i + 1),
                                      ]);
                                    }}
                                  >
                                    Insert point after
                                  </button>
                                  <button
                                    className="rounded bg-destructive/10 px-2 py-1 text-left text-destructive hover:bg-destructive/20"
                                    onClick={() => {
                                      if (f.points.length <= minPts) {
                                        toast.error(`Needs at least ${minPts} points`);
                                        return;
                                      }
                                      updatePoints((pts) => pts.filter((_, j) => j !== i));
                                    }}
                                  >
                                    Remove point
                                  </button>
                                </div>
                              </Popup>
                            </Marker>
                          ))
                        : null}
                      {isEditing && !locked
                        ? midPairs.map(([a, b], k) => {
                            const pa = f.points[a];
                            const pb = f.points[b];
                            const mid: [number, number] = [
                              (pa[0] + pb[0]) / 2,
                              (pa[1] + pb[1]) / 2,
                            ];
                            return (
                              <CircleMarker
                                key={`m-${k}`}
                                center={mid}
                                radius={4}
                                bubblingMouseEvents={false}
                                pathOptions={{
                                  color: cfg.color,
                                  fillColor: "#0b1a10",
                                  fillOpacity: 0.9,
                                  weight: 2,
                                  opacity: 0.9,
                                }}
                                eventHandlers={{
                                  mousedown: stopLeafletBubble,
                                  dblclick: stopLeafletClick,
                                  contextmenu: stopLeafletClick,
                                  click: (e) => {
                                    stopLeafletBubble(e);
                                    const insertAt = b === 0 ? f.points.length : b;
                                    updatePoints((pts) => [
                                      ...pts.slice(0, insertAt),
                                      mid,
                                      ...pts.slice(insertAt),
                                    ]);
                                  },
                                }}
                              />
                            );
                          })
                        : null}
                    </Fragment>
                  );
                }
                return null;
              })}

              {/* draft */}
              {draftPoints.map((p, i) => (
                <Marker
                  key={i}
                  position={p}
                  icon={vertexHandleIcon(
                    FEATURE_CONFIG[(tool as { type: CourseFeatureType }).type].color,
                  )}
                  draggable
                  bubblingMouseEvents={false}
                  zIndexOffset={1000}
                  eventHandlers={{
                    mousedown: (e) =>
                      beginMarkerDrag(e, (point) =>
                        setDraftPoints((prev) => prev.map((q, j) => (j === i ? point : q))),
                      ),
                    mouseup: (e) =>
                      finishFeatureDrag(e, (point) =>
                        setDraftPoints((prev) => prev.map((q, j) => (j === i ? point : q))),
                      ),
                    click: (e) => {
                      finishFeatureDrag(e, (point) =>
                        setDraftPoints((prev) => prev.map((q, j) => (j === i ? point : q))),
                      );
                    },
                    dblclick: stopLeafletClick,
                    contextmenu: stopLeafletClick,
                    dragstart: (e) =>
                      beginMarkerDrag(e, (point) =>
                        setDraftPoints((prev) => prev.map((q, j) => (j === i ? point : q))),
                      ),
                    drag: continueFeatureDrag,
                    dragend: (e) => {
                      finishFeatureDrag(e, (point) =>
                        setDraftPoints((prev) => prev.map((q, j) => (j === i ? point : q))),
                      );
                    },
                  }}
                />
              ))}
              {draftPoints.length >= 2 &&
              tool.kind === "feature" &&
              FEATURE_CONFIG[tool.type].geom === "line" ? (
                <Polyline
                  positions={draftPoints}
                  interactive={false}
                  pathOptions={{
                    color: FEATURE_CONFIG[tool.type].color,
                    weight: 3,
                    dashArray: "4 6",
                  }}
                />
              ) : null}
              {draftPoints.length >= 3 &&
              tool.kind === "feature" &&
              FEATURE_CONFIG[tool.type].geom === "polygon" ? (
                <Polygon
                  positions={draftPoints}
                  interactive={false}
                  pathOptions={{
                    color: FEATURE_CONFIG[tool.type].color,
                    weight: 2,
                    fillOpacity: 0.15,
                  }}
                />
              ) : null}
            </MapContainer>
          </div>
          {/* Quick tools + undo/redo, floated over the top of the map so the
              common drawing tools are reachable without the sidebar. */}
          <div className="pointer-events-none absolute bottom-20 right-3 z-[500] flex flex-col items-end">
            <button
                type="button"
                onClick={() => setMapViewOpen((v) => !v)}
                aria-expanded={mapViewOpen}
                className="pointer-events-auto mb-2 flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background/95 px-3 text-sm font-medium shadow"
              >
                <Layers className="h-4 w-4" /> View
              </button>
            <div className={"pointer-events-auto " + (!mapViewOpen ? "hidden" : "")}>
              <div className="mb-2 rounded-lg border border-border bg-background/95 p-2 text-sm shadow">
                <label className="mb-2 block">Show items
                  <select aria-label="Map item scope" className="ml-2 rounded border bg-background p-1" value={mapScope} onChange={e => changeMapScope(e.target.value as "course" | "hole")}>
                    <option value="course">Whole course</option><option value="hole">Hole {activeHole} only</option>
                  </select>
                </label>
                <div className="mb-1 font-medium">Other holes</div>
                <div className="flex gap-1" role="group" aria-label="Other holes">
                  {(["faded", "shown", "hidden"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={otherHoles === m}
                      onClick={() => {setOtherHoles(m);setMapScope(m === "hidden" ? "hole" : "course");}}
                      className={`rounded-md px-2 py-1 ${otherHoles === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      {m === "faded" ? "Faded" : m === "shown" ? "Shown" : "Hidden"}
                    </button>
                  ))}
                </div>

              </div>
              <MapLegend
                types={[...new Set(features.map((f) => f.type))]}
                hidden={hiddenTypes}
                onToggle={(t) =>
                  setHiddenTypes((prev) => {
                    const n = new Set(prev);
                    if (n.has(t)) n.delete(t);
                    else n.add(t);
                    return n;
                  })
                }
              />
            </div>
          </div>
          {courseId ? (
            <div className="pointer-events-none absolute bottom-16 left-14 right-14 z-[500] flex flex-col items-center gap-2">
              {draftCount > 0 && !propertyOpen && !overlayOpen ? (
                <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-1.5 text-sm shadow">
                  <span>
                    {draftCount} new map {draftCount === 1 ? "object is" : "objects are"} a draft — players can't see {draftCount === 1 ? "it" : "them"} yet.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={publishingDrafts || !loadedLayoutId}
                    onClick={async () => {
                      if (!loadedLayoutId) return;
                      setPublishingDrafts(true);
                      const { error } = await supabase
                        .from("course_features")
                        .update({ publish_state: "published" })
                        .eq("course_id", courseId)
                        .or(`layout_id.eq.${loadedLayoutId},and(layout_id.is.null,type.eq.course_boundary)`)
                        .eq("publish_state", "draft");
                      setPublishingDrafts(false);
                      if (error) toast.error("Couldn't publish the drafts. Try again in a moment.");
                      else {
                        setDraftCount(0);
                        toast.success("Published — players now see the updated map.");
                      }
                    }}
                  >
                    Publish to players
                  </Button>
                </div>
              ) : null}
              <div className="pointer-events-auto">
                <CoEditorWarning
                  courseId={courseId}
                  userId={user?.id}
                  name={(user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? user?.email?.split("@")[0]}
                />
              </div>
            </div>
          ) : null}
          <div className={panel || walking || propertyOpen || overlayOpen ? "hidden" : ""}>
            <StudioObjectTools onRemovePin={id=>removedPinIdsRef.current.add(id)} courseId={courseId} holes={holes} setHoles={setHoles} features={features} activeHole={activeHole} scope={mapScope} onScopeChange={changeMapScope}
              selectedPin={pinSelection} selectionSerial={itemSelectionSerial} paletteRef={paletteRef} paletteDraft={teeSetsDraft} onPaletteChange={setTeeSetsDraft}
              onSelectPin={selectPin} onSelectFeature={selectFeature}
              onClear={()=>{setPinSelection(null);setSelectedFairway(null);setEditingFeatureId(null);setPanel(null);}}
              onLocate={(point,kind,id)=>{if(point)mapRef.current?.setView(point,Math.max(mapRef.current.getZoom(),19));else {setPlacingTeeId(kind==="tee"&&id!=="main-tee"?id:null);setPlacingBasketId(kind==="basket"&&id!=="main-basket"?id:null);setTool(id.startsWith("main-")?{kind:"tee-basket",placing:kind}:{kind:"select"});toast("Click the map to place this item.");}}}
              onAssign={assignBaskets} onEditFairway={openPinFairway}
              fairwayActive={!!selectedFairway&&tool.kind==="select"&&!placingTeeId&&!placingBasketId}
              onAdd={(kind,identity)=>{if((kind==="tee"||kind==="basket")&&(!boundaryLocked||boundaryPoints.length<3)){setPropertyOpen(true);toast.info("Draw and lock the property line first.");return;}setPinSelection(null);setSelectedFairway(null);setEditingFeatureId(null);setPlacingTeeId(null);setPlacingBasketId(null);setDraftPoints([]);if(kind==="tee"||kind==="basket")setTool({kind:"tee-basket",placing:kind,identity});else if(kind==="ob-ref")setTool({kind:"ob-ref",draft:null});else {if(kind==="course_boundary")setBoundaryLocked(false);setTool({kind:"feature",type:kind});}}}
              attachToHole={attachToHole} onAttachToHole={setAttachToHole}
              placement={tool.kind==="ob-ref"?"Click an existing OB edge":tool.kind==="tee-basket"?`Click to place ${tool.identity?.name ?? "a"} ${tool.placing} on Hole ${activeHole}`:tool.kind==="feature"?`Place ${FEATURE_CONFIG[tool.type].label}`:placingTeeId||placingBasketId?"Click to place the selected item":null}
              finish={finishDraft} cancel={()=>{cancelDraft();setPlacingTeeId(null);setPlacingBasketId(null);setTool({kind:"select"});}}
              points={draftPoints.length} boundaryLocked={boundaryLocked} onToggleBoundary={()=>setBoundaryLocked(v=>!v)}
            />
          </div>

          {builderMode === "course" && !proMode ? (
            <div className="pointer-events-none absolute left-[13.5rem] top-32 z-[500]">
              <div className="pointer-events-auto">
                <GuidedSetupCard
                  steps={setupSteps}
                  hasBoundary={boundaryPoints.length >= 3}
                  acres={polygonAcres(boundaryPoints)}
                  drawing={tool.kind === "feature" && tool.type === "course_boundary"}
                  onDrawBoundary={() => {
                    setBoundaryLocked(false);
                    setTool({ kind: "feature", type: "course_boundary" });
                    setDraftPoints([]);
                  }}
                  onGoHoles={() => changeBuilderMode("holes")}
                />
              </div>
            </div>
          ) : null}
          {walking ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1200] md:inset-x-auto md:bottom-3 md:left-1/2 md:w-[420px] md:-translate-x-1/2">
              <WalkCourse
                holes={holes}
                onAdd={(number, kind, identity) => {
                  const id = uid();
                  const h = holes.find(h => h.number === number);
                  const main = identity.role === "main" && !h?.[kind];
                  userTouchedRef.current = true;
                  setHoles(previous => previous.map(h => {
                    if (h.number !== number) return h;
                    if (main) return {...h, [`${kind}_name`]: identity.name, [`${kind}_color`]: identity.color};
                    const item = {tempId: id, name: identity.name, color: identity.color, lat: null, lng: null, distance_override: null};
                    return kind === "tee" ? {...h, extra_tees: [...h.extra_tees, {...item, is_drop_zone: identity.role === "drop_zone"}]}
                      : {...h, extra_baskets: [...h.extra_baskets, item]};
                  }));
                  return `${number}-${kind === "tee" ? "t" : "b"}${main ? "" : `-${id}`}`;
                }}
                startHole={activeHole}
                steps={holes.flatMap((h): WalkStep[] => [
                  { key: `${h.number}-t`, hole: h.number, holeLabel: holeLabel(h), kind: "tee", padId: null, name: endpointName("tee", "main-tee", h.tee_name), spot: h.tee },
                  ...h.extra_tees.map((t, k): WalkStep => ({ key: `${h.number}-t-${t.tempId}`, hole: h.number, holeLabel: holeLabel(h), kind: "tee", padId: t.tempId, name: endpointName("tee", t.tempId, t.name, t.is_drop_zone), spot: t.lat != null && t.lng != null ? [t.lat, t.lng] : null })),
                  { key: `${h.number}-b`, hole: h.number, holeLabel: holeLabel(h), kind: "basket", padId: null, name: endpointName("basket", "main-basket", h.basket_name), spot: h.basket },
                  ...h.extra_baskets.map((b, k): WalkStep => ({ key: `${h.number}-b-${b.tempId}`, hole: h.number, holeLabel: holeLabel(h), kind: "basket", padId: b.tempId, name: endpointName("basket", b.tempId, b.name), spot: b.lat != null && b.lng != null ? [b.lat, b.lng] : null })),
                ])}
                onHole={(n) => setActiveHole(n)}
                onFocus={(p) => mapRef.current?.panTo(p, { animate: true })}
                onPlace={(st, p, acc) => {
                  userTouchedRef.current = true;
                  setHoles((prev) =>
                    prev.map((h) => {
                      if (h.number !== st.hole) return h;
                      if (st.padId == null) {
                        return { ...h, [st.kind]: p, [`${st.kind}_gps_accuracy_m`]: acc } as HoleDraft;
                      }
                      return st.kind === "tee"
                        ? { ...h, extra_tees: h.extra_tees.map((t) => (t.tempId === st.padId ? { ...t, lat: p[0], lng: p[1] } : t)) }
                        : { ...h, extra_baskets: h.extra_baskets.map((b) => (b.tempId === st.padId ? { ...b, lat: p[0], lng: p[1] } : b)) };
                    }),
                  );
                  mapRef.current?.panTo(p, { animate: true });
                }}
                onClose={() => setWalking(false)}
              />
            </div>
          ) : null}
          {step === "holes" && builderMode === "holes" && !walking ? (
            <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[500]">
              <div className="pointer-events-auto mx-auto max-w-md rounded-xl border border-border bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur">
                {(() => {
                  const idx = holes.findIndex((h) => h.number === activeHole);
                  const cur = holes[idx];
                  return (
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" className="h-11 w-11 shrink-0" aria-label="Previous hole" disabled={idx <= 0} onClick={() => setActiveHole(holes[idx - 1].number)}>
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <select
                        aria-label="Choose hole"
                        value={activeHole}
                        onChange={(e) => setActiveHole(Number(e.target.value))}
                        className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base font-semibold"
                      >
                        {holes.map((h) => (
                          <option key={h.number} value={h.number}>
                            Hole {holeLabel(h)}{h.tee && h.basket ? " ✓" : h.tee || h.basket ? " · in progress" : " · not started"}
                          </option>
                        ))}
                      </select>
                      <span className="shrink-0 text-sm text-muted-foreground">{cur?.par ? `Par ${cur.par}` : ""}</span>
                      <Button size="icon" variant="outline" className="h-11 w-11 shrink-0" aria-label="Next hole" disabled={idx < 0 || idx >= holes.length - 1} onClick={() => setActiveHole(holes[idx + 1].number)}>
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                  );
                })()}

              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  // The builder is a full-screen tool. Rendered in place it would sit inside
  // the page content stacking context, where the app header paints over its own
  // top bar and toolbar, so it is portaled to the body instead.
  return createPortal(builderShell, document.body);
}

/** Single-key shortcuts for hole tools (T, B and V are handled separately). */
const TOOL_HOTKEYS: Record<string, CourseFeatureType> = {
  m: "mando",
  z: "dropzone",
  o: "ob_line",
  a: "ob_area",
  i: "island_green",
};
const HOTKEY_BY_TYPE: Partial<Record<CourseFeatureType, string>> = Object.fromEntries(
  Object.entries(TOOL_HOTKEYS).map(([k, t]) => [t, k.toUpperCase()]),
);

function FeatureBtn({
  t,
  active,
  onClick,
}: {
  t: CourseFeatureType;
  active: boolean;
  onClick: () => void;
}) {
  const cfg = FEATURE_CONFIG[t];
  return (
    <button
      onClick={onClick}
      title={cfg.label}
      className={
        "flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition " +
        (active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")
      }
    >
      <FeatureGlyph type={t} size={14} />
      <span>{cfg.label}</span>
    </button>
  );
}
