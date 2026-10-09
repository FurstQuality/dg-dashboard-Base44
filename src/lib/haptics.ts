/** Light haptic tap on devices that support it (Android/PWA). No-op elsewhere. */
export function hapticTap(pattern: number | number[] = 12): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* unsupported — silently skip */
  }
}
