import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Settings2, RotateCcw, Check, Sparkles, Eye } from "lucide-react";
import { useDashboard } from "./dashboard-context";

export function DashboardToolbar() {
  const { def, registry, prefs, mode, setMode } = useDashboard();
  const [confirmReset, setConfirmReset] = useState(false);
  const hiddenList = Array.from(prefs.hidden);

  if (mode === "view") {
    return (
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setMode("customize")}>
          <Settings2 className="mr-1.5 h-4 w-4" /> Customize dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="sticky top-[64px] z-20 -mx-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/40 bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Customization mode
        </span>
        <span className="text-xs text-muted-foreground">
          Drag cards to reorder, hide, or resize.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {def.presets && def.presets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Preset{" "}
                {prefs.preset
                  ? `· ${def.presets.find((p) => p.key === prefs.preset)?.label ?? ""}`
                  : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Apply a preset</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {def.presets.map((p) => (
                <DropdownMenuItem key={p.key} onClick={() => prefs.applyPreset(p.key)}>
                  <div>
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {hiddenList.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Eye className="mr-1 h-3.5 w-3.5" /> Restore ({hiddenList.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Hidden widgets</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {hiddenList.map((id) => {
                const w = registry[id];
                if (!w) return null;
                return (
                  <DropdownMenuItem key={id} onClick={() => prefs.restore(id)}>
                    Restore <span className="ml-1 font-medium">{w.title}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {confirmReset ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                prefs.reset();
                setConfirmReset(false);
              }}
            >
              Confirm reset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
          </Button>
        )}
        <Button size="sm" onClick={() => setMode("view")}>
          <Check className="mr-1 h-3.5 w-3.5" /> Done
        </Button>
      </div>
    </div>
  );
}
