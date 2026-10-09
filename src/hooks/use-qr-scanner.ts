import { useEffect, useRef, useState } from "react";

/**
 * Camera QR scanner. Uses the native BarcodeDetector where available and
 * falls back to jsQR (loaded on demand) so iPhones and Firefox scan too.
 * Repeated reads of the same code are ignored for `repeatMs`.
 */
export function useQrScanner(
  onDetect: (value: string) => void,
  opts: { facingMode?: "environment" | "user"; repeatMs?: number; onError?: () => void } = {},
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(true);
  const cb = useRef(onDetect);
  cb.current = onDetect;
  const errCb = useRef(opts.onError);
  errCb.current = opts.onError;
  const facing = opts.facingMode ?? "environment";
  const repeatMs = opts.repeatMs ?? 2500;

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let cancelled = false;
    let lastValue = "";
    let lastAt = 0;

    (async () => {
      try {
        const Native = (window as any).BarcodeDetector;
        const native = Native ? new Native({ formats: ["qr_code"] }) : null;
        const jsQR = native ? null : (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        const video = videoRef.current;
        if (cancelled || !video) return;
        video.srcObject = stream;
        await video.play();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          let value: string | undefined;
          try {
            if (native) {
              value = (await native.detect(video))?.[0]?.rawValue;
            } else if (jsQR && ctx && video.videoWidth) {
              const w = Math.min(640, video.videoWidth);
              const h = Math.round((video.videoHeight / video.videoWidth) * w);
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              value = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data;
            }
          } catch {
            /* transient decode failure — keep scanning */
          }
          const now = Date.now();
          if (value && (value !== lastValue || now - lastAt > repeatMs)) {
            lastValue = value;
            lastAt = now;
            cb.current(value);
          }
          timer = window.setTimeout(() => void tick(), 120);
        };
        void tick();
      } catch {
        if (!cancelled) {
          errCb.current?.();
          setActive(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, facing, repeatMs]);

  return { videoRef, active, setActive, supported };
}
