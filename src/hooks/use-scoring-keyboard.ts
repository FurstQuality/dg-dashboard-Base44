import { useEffect } from "react";
import { isTypingTarget, resolveScoringKey } from "@/lib/scoring-progress";

type Handlers = {
  enabled: boolean;
  /** Sets the signed-in player's strokes on the active hole. */
  onSetStrokes: (strokes: number) => void;
  onBump: (delta: -1 | 1) => void;
  onNavigate: (delta: -1 | 1) => void;
  onConfirm: () => void;
  onJumpToUnscored: () => void;
};

/** Keyboard scoring for the card: digits, +/-, arrows, Enter, and "u". */
export function useScoringKeyboard({
  enabled,
  onSetStrokes,
  onBump,
  onNavigate,
  onConfirm,
  onJumpToUnscored,
}: Handlers) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const action = resolveScoringKey(e.key);
      if (!action) return;
      e.preventDefault();
      switch (action.type) {
        case "set":
          onSetStrokes(action.strokes);
          break;
        case "bump":
          onBump(action.delta);
          break;
        case "nav":
          onNavigate(action.delta);
          break;
        case "confirm":
          onConfirm();
          break;
        case "jumpUnscored":
          onJumpToUnscored();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onSetStrokes, onBump, onNavigate, onConfirm, onJumpToUnscored]);
}
