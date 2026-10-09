import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Circle, Eraser, Pencil, Square, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tool = "pen" | "circle" | "rect" | "arrow";

type Shape =
  | { tool: "pen"; color: string; points: Array<{ x: number; y: number }> }
  | {
      tool: "circle" | "rect" | "arrow";
      color: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
    };

const TOOLS: Array<{ value: Tool; label: string; Icon: typeof Pencil }> = [
  { value: "pen", label: "Draw freehand", Icon: Pencil },
  { value: "circle", label: "Circle an area", Icon: Circle },
  { value: "rect", label: "Box an area", Icon: Square },
  { value: "arrow", label: "Point with an arrow", Icon: ArrowUpRight },
];

const COLORS = [
  { value: "#ef4444", label: "Red" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#22d3ee", label: "Cyan" },
  { value: "#22c55e", label: "Green" },
];

/**
 * Lets a tester mark up a captured screenshot — circle the broken bit, arrow at
 * it, scribble a note — then hands back a flattened PNG data URL.
 */
export function ScreenshotAnnotator({
  imageUrl,
  onChange,
  className,
}: {
  imageUrl: string;
  /** Called with the flattened PNG whenever the markup changes. */
  onChange: (dataUrl: string) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("circle");
  const [color, setColor] = useState(COLORS[0].value);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      setShapes([]);
      setReady(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, s: Shape, scale: number) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = Math.max(3, 3 * scale);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (s.tool === "pen") {
      ctx.beginPath();
      s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      return;
    }
    const { from, to } = s;
    if (s.tool === "rect") {
      ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
      return;
    }
    if (s.tool === "circle") {
      ctx.beginPath();
      ctx.ellipse(
        (from.x + to.x) / 2,
        (from.y + to.y) / 2,
        Math.abs(to.x - from.x) / 2,
        Math.abs(to.y - from.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      return;
    }
    const head = Math.max(12, 12 * scale);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 7), to.y - head * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 7), to.y - head * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
  }, []);

  // Repaint the base image plus every mark, then publish the flattened result.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !ready) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    [...shapes, ...(draft ? [draft] : [])].forEach((s) => drawShape(ctx, s, scale));
    if (!draft) onChange(canvas.toDataURL("image/png"));
  }, [shapes, draft, ready, drawShape, onChange]);

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {TOOLS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={tool === value}
              onClick={() => setTool(value)}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                tool === value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              aria-label={`${c.label} marker`}
              aria-pressed={color === c.value}
              onClick={() => setColor(c.value)}
              className={cn(
                "h-5 w-5 rounded-full border-2",
                color === c.value ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!shapes.length}
          onClick={() => setShapes((s) => s.slice(0, -1))}
        >
          <Undo2 className="h-4 w-4" /> Undo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!shapes.length}
          onClick={() => setShapes([])}
        >
          <Eraser className="h-4 w-4" /> Clear marks
        </Button>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full cursor-crosshair touch-none rounded-lg border bg-muted"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = pointFrom(e);
          setDraft(
            tool === "pen"
              ? { tool: "pen", color, points: [p] }
              : { tool, color, from: p, to: p },
          );
        }}
        onPointerMove={(e) => {
          if (!draft) return;
          const p = pointFrom(e);
          setDraft(
            draft.tool === "pen"
              ? { ...draft, points: [...draft.points, p] }
              : { ...draft, to: p },
          );
        }}
        onPointerUp={() => {
          if (!draft) return;
          setShapes((s) => [...s, draft]);
          setDraft(null);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Drag on the shot to mark what's wrong. Everything you draw is sent with your report.
      </p>
    </div>
  );
}
