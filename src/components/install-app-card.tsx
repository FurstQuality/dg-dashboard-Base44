import { useEffect, useState } from "react";
import { Smartphone, Share, Plus, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Add-to-home-screen card for the welcome page. DG Dashboard installs
 * straight from the browser (no APK download or app store needed), so we
 * either fire the browser's own install prompt or show the short manual
 * steps for iPhone/iPad.
 */
export function InstallAppCard() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showSteps, setShowSteps] = useState(false);


  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const ua = window.navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document));
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) {
      setShowSteps(true);
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPromptEvent(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold">Get the mobile app</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Install DG Dashboard on your phone's home screen — full screen, works on the course,
            and no app store download needed.
          </p>

          {installed ? (
            <div className="mt-3 inline-flex items-center gap-2 text-sm text-primary">
              <Check className="h-4 w-4" />
              Installed on this device
            </div>
          ) : (
            <>
              <Button className="mt-3" onClick={install}>
                <Download className="mr-2 h-4 w-4" />
                Download app
              </Button>

              {showSteps ? (
                isIos ? (
                  <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Share className="h-4 w-4 text-primary" />
                      Tap Share in Safari
                    </li>
                    <li className="flex items-center gap-2">
                      <Plus className="h-4 w-4 text-primary" />
                      Choose "Add to Home Screen"
                    </li>
                  </ol>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Your browser handles this from its own menu. On Android, open the browser menu
                    and tap "Install and create shortcut" (some browsers call it "Add to Home
                    screen"). On iPhone, use Share → Add to Home Screen in Safari.
                  </p>
                )
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

