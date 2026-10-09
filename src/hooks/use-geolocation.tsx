import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export type GeoPermission = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

const STORAGE_KEY = "dgd.geo.permission.hint";

function readHint(): GeoPermission | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

function writeHint(value: GeoPermission) {
  try {
    if (value === "granted" || value === "denied") localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function isSupported() {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

async function queryPermission(): Promise<GeoPermission> {
  if (!isSupported()) return "unsupported";
  try {
    // Permissions API isn't in all browsers (notably older Safari).
    const perms = (
      navigator as unknown as {
        permissions?: { query: (d: PermissionDescriptor) => Promise<PermissionStatus> };
      }
    ).permissions;
    if (!perms?.query) return "unknown";
    const status = await perms.query({ name: "geolocation" as PermissionName });
    writeHint(status.state as GeoPermission);
    return status.state as GeoPermission;
  } catch {
    return "unknown";
  }
}

/**
 * Reactive geolocation permission state. Listens for permission changes
 * (browser-supported) so the banner and consuming tools stay in sync.
 */
export function useGeolocationPermission() {
  const [state, setState] = useState<GeoPermission>("unknown");

  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (!cancelled && status) {
        writeHint(status.state as GeoPermission);
        setState(status.state as GeoPermission);
      }
    };
    (async () => {
      if (!isSupported()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      // Remembered decision from a previous visit — never re-ask.
      const hint = readHint();
      if (hint && !cancelled) setState(hint);
      const perms = (
        navigator as unknown as {
          permissions?: { query: (d: PermissionDescriptor) => Promise<PermissionStatus> };
        }
      ).permissions;
      if (!perms?.query) {
        if (!cancelled && !hint) setState("unknown");
        return;
      }
      try {
        status = await perms.query({ name: "geolocation" as PermissionName });
        if (cancelled) return;
        writeHint(status.state as GeoPermission);
        setState(status.state as GeoPermission);
        status.addEventListener?.("change", onChange);
      } catch {
        if (!cancelled) setState("unknown");
      }
    })();
    return () => {
      cancelled = true;
      status?.removeEventListener?.("change", onChange);
    };
  }, []);

  /** Triggers the native browser prompt (if not yet decided). */
  const request = useCallback(async (): Promise<GeoPermission> => {
    if (!isSupported()) {
      toast.error("Location isn't supported on this device");
      return "unsupported";
    }
    // Already allowed on this device — don't trigger another prompt.
    const current = state === "unknown" ? await queryPermission() : state;
    if (current === "granted") {
      writeHint("granted");
      setState("granted");
      return "granted";
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          writeHint("granted");
          setState("granted");
          resolve("granted");
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            writeHint("denied");
            setState("denied");
            toast.error("Location blocked", {
              description:
                "Enable it in your browser's site settings to use DG Dashboard's GPS tools.",
            });
            resolve("denied");
          } else {
            toast.error("Couldn't get your location", { description: err.message });
            resolve(state);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }, [state]);

  return { state, request, supported: state !== "unsupported" };
}

export async function getGeoPermissionSnapshot(): Promise<GeoPermission> {
  return queryPermission();
}
