import { useSyncExternalStore } from "react";

/**
 * Global state for the docked messenger window.
 *
 * DGIM runs two ways, like Facebook and Messenger: a popup window docked over
 * the app, and a standalone messenger app at /dgim. This tiny store lets any
 * surface open the popup without prop plumbing or a provider.
 */
export type MessengerWindowState = {
  open: boolean;
  minimized: boolean;
  conv: string | null;
};

let state: MessengerWindowState = { open: false, minimized: false, conv: null };
const listeners = new Set<() => void>();

function set(next: Partial<MessengerWindowState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Open the popup messenger, optionally jumping straight to a conversation. */
export function openMessenger(conv?: string | null) {
  set({ open: true, minimized: false, conv: conv ?? state.conv ?? null });
}

export function closeMessenger() {
  set({ open: false, minimized: false });
}

export function minimizeMessenger() {
  set({ minimized: true });
}

export function toggleMessenger() {
  if (!state.open || state.minimized) openMessenger();
  else minimizeMessenger();
}

export function useMessengerWindow(): MessengerWindowState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Pop the standalone messenger app out into its own browser window. */
export function openMessengerApp(conv?: string | null) {
  const url = conv ? `/dgim?conv=${encodeURIComponent(conv)}` : "/dgim";
  window.open(url, "dgim", "width=1080,height=760,noopener");
  closeMessenger();
}
