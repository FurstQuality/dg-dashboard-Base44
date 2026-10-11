type Authorization = { authorizationUrl: string; state: string | null; provider: "google" | "lovable" };

/** Capture the popup during the click, then accept only its same-origin callback. */
export async function connectDirectCalendar(
  start: () => Promise<Authorization>,
  complete: (value: { code: string; state: string }) => Promise<unknown>,
): Promise<void> {
  const popup = window.open("about:blank", "dgd-google-calendar", "popup,width=520,height=680");
  if (!popup) throw new Error("Allow popups to connect Google Calendar.");
  try {
    const auth = await start();
    if (auth.provider !== "google" || !auth.state) throw new Error("Calendar connection settings changed. Please try again.");
    await new Promise<void>((resolve, reject) => {
      let completing = false;
      const cleanup = () => { window.removeEventListener("message", receive); clearInterval(closed); clearTimeout(timeout); };
      const receive = (event: MessageEvent) => {
        if (completing || event.source !== popup || event.origin !== window.location.origin || event.data?.type !== "dgd-google-calendar" || event.data?.state !== auth.state) return;
        if (event.data.error || typeof event.data.code !== "string" || !event.data.code) { cleanup(); reject(new Error("Google Calendar connection was cancelled.")); return; }
        completing = true;
        cleanup();
        complete({ code: event.data.code, state: auth.state! }).then(() => resolve(), reject);
      };
      const closed = setInterval(() => { if (popup.closed && !completing) { cleanup(); reject(new Error("Google Calendar connection was cancelled.")); } }, 500);
      const timeout = setTimeout(() => { cleanup(); reject(new Error("Calendar connection expired. Please try again.")); }, 10 * 60_000);
      window.addEventListener("message", receive);
      popup.location.href = auth.authorizationUrl;
    });
  } finally { popup.close(); }
}
