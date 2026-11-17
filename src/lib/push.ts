import { forgetPushSubscription, savePushSubscription } from './api';

/**
 * Web Push for the pings (ADC-RES-49 s.8): a VAPID subscription from the browser's own push
 * service, saved through save_push_subscription. On iPhone and iPad it works only once the app is
 * on the Home Screen and opened from there, and the permission prompt must follow a tap.
 */
export type PushState =
  | 'unsupported' // this browser has no Push API
  | 'needs-install' // iPhone/iPad in Safari: add to Home Screen first
  | 'denied' // the person said no; only the browser settings can undo it
  | 'off' // supported, not subscribed here
  | 'on'; // this device gets pings

export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

export function isIOS(ua: string = navigator.userAgent, touch = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0): boolean {
  // iPadOS 13+ reports itself as a Mac; the touch points give it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** base64url (VAPID public key) -> bytes for applicationServerKey. */
export function urlBase64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function bytesToUrlBase64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  let s = '';
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** Call from a tap: asks permission, subscribes, saves the device. Returns the new state. */
export async function turnOnPings(): Promise<PushState> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (!VAPID_PUBLIC_KEY) throw new Error('push key missing');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) return 'unsupported';
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC_KEY) }));
  await savePushSubscription(sub.endpoint, bytesToUrlBase64(sub.getKey('p256dh')), bytesToUrlBase64(sub.getKey('auth')));
  return 'on';
}

export async function turnOffPings(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await forgetPushSubscription(sub.endpoint);
    await sub.unsubscribe();
  }
  return 'off';
}
