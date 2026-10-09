import { satelliteStillUrl } from "@/lib/course-imagery";
import { Car, Compass, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Travel panel: address, coordinates and one-tap navigation links. */
export function CourseDirections({
  name,
  city,
  state,
  latitude,
  longitude,
  isEntrance = false,
}: {
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Coordinates are the mapped course entrance, not the directory pin. */
  isEntrance?: boolean;
}) {
  const place = [name, city, state].filter(Boolean).join(", ");
  const hasCoords = latitude != null && longitude != null;
  const coordQuery = hasCoords ? `${latitude},${longitude}` : encodeURIComponent(place);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 font-semibold">
          <Navigation className="h-4 w-4 text-primary" /> Getting there
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span>{place || "Location not recorded yet"}</span>
          </div>
          {hasCoords ? (
            <div className="flex items-start gap-2 text-muted-foreground">
              <Compass className="mt-0.5 h-4 w-4" />
              <span>
                {isEntrance ? "Course entrance · " : ""}
                {latitude!.toFixed(5)}, {longitude!.toFixed(5)}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add coordinates to this course to unlock turn-by-turn navigation and GPS distances.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${coordQuery}`}
              target="_blank"
              rel="noreferrer"
            >
              <Car className="mr-1 h-4 w-4" /> Google Maps
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={`https://maps.apple.com/?daddr=${coordQuery}`}
              target="_blank"
              rel="noreferrer"
            >
              Apple Maps
            </a>
          </Button>
          {hasCoords ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Open street map
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {hasCoords ? (
          <img
            src={satelliteStillUrl(latitude!, longitude!, { widthM: 1000, heightM: 650, px: 800 })}
            alt={`Satellite view of ${name}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full min-h-[220px] place-items-center p-6 text-center text-sm text-muted-foreground">
            No map preview until this course has coordinates.
          </div>
        )}
      </div>
    </div>
  );
}
