import { useRef, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { clampElement, type SignDesign, type SignElement } from "@/lib/tee-sign-design";

/**
 * The tee sign picture area: background photo (or captured map) plus text and logo boxes.
 * When `editable`, boxes can be dragged and resized from the bottom-right handle.
 */
export function SignCanvas({
  design,
  fallbackUrl,
  urls,
  alt,
  editable = false,
  selectedId,
  onSelect,
  onChangeElement,
  lockedIds,
  base,
}: {
  design: SignDesign;
  fallbackUrl: string | null;
  urls: Record<string, string>;
  alt: string;
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChangeElement?: (el: SignElement) => void;
  /** Shared (all-sign) elements shown but not movable while editing one sign. */
  lockedIds?: Set<string>;
  /** Replaces the background picture (e.g. the printed hole-map sign). */
  base?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bg = design.photoPath ? urls[design.photoPath] : fallbackUrl;

  const startDrag = (e: React.PointerEvent, el: SignElement, mode: "move" | "resize") => {
    if (!editable || lockedIds?.has(el.id) || !ref.current) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(el.id);
    const rect = ref.current.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const start = { ...el };
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - sx) / rect.width) * 100;
      const dy = ((ev.clientY - sy) / rect.height) * 100;
      onChangeElement?.(
        clampElement(
          mode === "move"
            ? { ...start, x: start.x + dx, y: start.y + dy }
            : { ...start, w: start.w + dx, h: start.h + dy },
        ),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={ref}
      className="relative aspect-[3/4] w-full touch-none overflow-hidden bg-muted [container-type:inline-size]"
      onPointerDown={() => editable && onSelect?.(null)}
    >
      {base ? (
        <div className="h-full w-full">{base}</div>
      ) : bg ? (
        <img
          src={bg}
          alt={alt}
          loading="lazy"
          className={"block h-full w-full " + (design.photoFit === "contain" ? "object-contain" : "object-cover")}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
          <ImageOff className="h-5 w-5" />
          <span>No picture yet</span>
        </div>
      )}
      {(design.elements ?? []).map((el) => {
        const locked = lockedIds?.has(el.id);
        const selected = editable && selectedId === el.id;
        return (
          <div
            key={el.id}
            onPointerDown={(e) => startDrag(e, el, "move")}
            className={
              "absolute " +
              (editable && !locked ? "cursor-move " : "") +
              (selected ? "outline outline-2 outline-primary" : editable && !locked ? "outline-dashed outline-1 outline-border" : "")
            }
            style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
          >
            {el.kind === "image" ? (
              el.path && urls[el.path] ? (
                <img src={urls[el.path]} alt="" draggable={false} className="h-full w-full object-contain" />
              ) : null
            ) : (
              <div
                className="flex h-full w-full items-center overflow-hidden px-[2%] leading-tight"
                style={{
                  color: el.color,
                  background: el.background ?? "transparent",
                  fontSize: `${el.fontSize ?? 6}cqw`,
                  fontWeight: el.bold ? 700 : 400,
                  justifyContent: el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center",
                  textAlign: el.align ?? "center",
                  whiteSpace: "pre-wrap",
                }}
              >
                {el.text}
              </div>
            )}
            {selected ? (
              <div
                role="presentation"
                onPointerDown={(e) => startDrag(e, el, "resize")}
                className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-background bg-primary"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
