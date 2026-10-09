// Client-side push subscription manager.
import { supabase } from "@/integrations/supabase/client";
import { getVapidPublicKey, savePushSubscription, removePushSubscription } from "./push.functions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("SW register failed", err);
    return null;
  }
}

export async function getPushPermissionState(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported())
    return { ok: false, error: "Push notifications aren't supported on this device." };
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Sign in first." };
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
  if (!reg) return { ok: false, error: "Service worker unavailable." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "Notification permission denied." };
  const publicKey = await getVapidPublicKey();
  if (!publicKey) return { ok: false, error: "Push server not configured." };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = urlBase64ToUint8Array(publicKey);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key.buffer.slice(
        key.byteOffset,
        key.byteOffset + key.byteLength,
      ) as ArrayBuffer,
    });
  }
  const json = sub.toJSON();
  const res = await savePushSubscription({
    data: {
      endpoint: sub.endpoint,
      p256dh: (json.keys as { p256dh?: string } | undefined)?.p256dh || "",
      auth: (json.keys as { auth?: string } | undefined)?.auth || "",
      userAgent: navigator.userAgent,
    },
  });
  return res;
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean }> {
  if (!isPushSupported()) return { ok: true };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await removePushSubscription({ data: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }
  return { ok: true };
}

export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}
