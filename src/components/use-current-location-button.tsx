import { useState } from "react";
import { toast } from "sonner";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";

export type LatLng = { lat: number; lng: number };

/**
 * Shared "Use current location" control for every directory that sorts or
 * filters by distance. Keeps the wording, error copy, and busy state identical
 * across courses, events, marketplace, and lost & found.
 */
export function UseCurrentLocationButton({
  onLocated,
  label = "Use current location",
  busyLabel = "Finding you…",
  className,
  size = "sm",
  variant = "outline",
}: {
  onLocated: (coords: LatLng) => void;
  label?: string;
  busyLabel?: string;
  className?: string;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "default" | "ghost";
}) {
  const [busy, setBusy] = useState(false);

  function request() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("This device can't share a location.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onLocated({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Using your current location.");
      },
      () => {
        setBusy(false);
        toast.error("We couldn't get your location", {
          description: "Allow location access for this app, or filter by state instead.",
        });
      },
      { timeout: 8000, maximumAge: 10 * 60_000 },
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={busy}
      onClick={request}
    >
      <LocateFixed className="mr-1.5 h-4 w-4" />
      {busy ? busyLabel : label}
    </Button>
  );
}
