// send-ping: turns one new inbox item into a Web Push on each of its owner's devices.
// Called only by the database (private.inbox_push_hook via pg_net) with the shared secret in
// x-push-secret; verify_jwt is off because the caller is the database, not a user.
// Quiet hours (Kuwait time) mute the push; the Inbox item stays either way (ADC-RES-49 s.8).
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET') ?? '';
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'https://adc-diwaniya-tonight.pages.dev',
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Same allow-list as private.push_endpoint_ok in the database: only the browsers' push services.
const PUSH_HOST =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

type Lang = 'ar' | 'en';
const GAME: Record<Lang, Record<string, string>> = {
  ar: { kout: 'كوت', baloot: 'بلوت', tarneeb: 'طرنيب', trix: 'تركس' },
  en: { kout: 'Kout', baloot: 'Baloot', tarneeb: 'Tarneeb', trix: 'Trix' },
};
const TEXT: Record<Lang, Record<string, (d: string, extra: string) => [string, string]>> = {
  ar: {
    need_one: (d, g) => [`ينقصهم واحد في ${d}`, `طاولة ${g} تحتاج لاعباً الليلة. اطلب المقعد.`],
    request: (d) => [`طلب مقعد جديد`, `أحدهم يطلب مقعداً في ${d}.`],
    auto_approved: (d) => [`وصل أحد الروّاد`, `قُبل طلب أحد الروّاد تلقائياً في ${d}.`],
    cancelled: (d) => [`أُلغي طلب`, `ألغى أحدهم طلبه في ${d}.`],
    approved: (d) => [`قُبل طلبك`, `${d} بانتظارك. افتح الصفحة لترى الموقع.`],
    declined: (d) => [`لم يُقبل طلبك`, `اعتذر المضيف في ${d} هذه المرة.`],
    no_show: (d) => [`سُجّل غياب`, `سجّل مضيف ${d} أنك لم تحضر.`],
    announcement: (d, b) => [`إعلان من ${d}`, b],
    message: (d) => [`رسالة جديدة`, `وصلتك رسالة عن ${d}. افتح الرسائل لتقرأها.`],
  },
  en: {
    need_one: (d, g) => [`One short at ${d}`, `The ${g} table needs a player tonight. Ask for the seat.`],
    request: (d) => [`New seat request`, `Someone asked for a seat at ${d}.`],
    auto_approved: (d) => [`A regular is coming`, `A regular was approved automatically at ${d}.`],
    cancelled: (d) => [`A request was cancelled`, `Someone cancelled at ${d}.`],
    approved: (d) => [`You're in`, `${d} expects you. Open the page for the location.`],
    declined: (d) => [`Not this time`, `The host at ${d} declined this time.`],
    no_show: (d) => [`No-show marked`, `The host at ${d} marked you as not coming.`],
    announcement: (d, b) => [`From ${d}`, b],
    message: (d) => [`New message`, `You have a message about ${d}. Open Messages to read it.`],
  },
};

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`rest ${r.status}`);
  return r.status === 204 ? null : r.json();
}

/** Is "now" inside quiet hours start..end (Kuwait time, may wrap past midnight)? */
export function inQuietHours(start: string | null, end: string | null, now = new Date()): boolean {
  if (!start || !end) return false;
  const kw = new Date(now.getTime() + 3 * 3600_000);
  const m = kw.getUTCHours() * 60 + kw.getUTCMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const s = toMin(start), e = toMin(end);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

function target(kind: string, diwaniya: string | null): string {
  if (kind === 'request' || kind === 'auto_approved' || kind === 'cancelled') return '/#/diwaniya';
  if (kind === 'message') return '/#/messages';
  return diwaniya && UUID.test(diwaniya) ? `/#/d/${diwaniya}` : '/#/inbox';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!sameSecret(req.headers.get('x-push-secret') ?? '', HOOK_SECRET)) return new Response('forbidden', { status: 403 });
  let id = '';
  try {
    id = String((await req.json())?.inbox_id ?? '');
  } catch {
    return new Response('bad request', { status: 400 });
  }
  if (!UUID.test(id)) return new Response('bad request', { status: 400 });

  try {
    const [item] = await rest(
      `inbox?id=eq.${id}&select=id,user_id,kind,body,diwaniya_id,pushed_at,diwaniya:diwaniyas(name),tbl:game_tables(game)`,
    );
    if (!item || item.pushed_at) return Response.json({ sent: 0, skipped: 'gone or done' });
    const [priv] = await rest(`profile_private?user_id=eq.${item.user_id}&select=lang,quiet_start,quiet_end`);
    const lang: Lang = priv?.lang === 'en' ? 'en' : 'ar';
    await rest(`inbox?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ pushed_at: new Date().toISOString() }) });
    if (inQuietHours(priv?.quiet_start ?? null, priv?.quiet_end ?? null)) return Response.json({ sent: 0, skipped: 'quiet hours' });

    const subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = await rest(
      `push_subscriptions?user_id=eq.${item.user_id}&select=id,endpoint,p256dh,auth`,
    );
    const name = item.diwaniya?.name ?? (lang === 'ar' ? 'ديوانيتنا' : 'Diwaniyatna');
    const make = TEXT[lang][item.kind];
    if (!make) return Response.json({ sent: 0, skipped: 'kind' });
    const extra = item.kind === 'announcement' ? String(item.body ?? '').slice(0, 300) : GAME[lang][item.tbl?.game ?? ''] ?? '';
    const [title, body] = make(name, extra);
    const payload = JSON.stringify({ title, body, url: target(item.kind, item.diwaniya_id), tag: `${item.kind}-${item.diwaniya_id ?? id}`, lang });

    let sent = 0;
    for (const s of subs) {
      if (!PUSH_HOST.test(s.endpoint)) continue;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 3600,
          urgency: item.kind === 'need_one' || item.kind === 'approved' ? 'high' : 'normal',
        });
        sent++;
        await rest(`push_subscriptions?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ last_ok_at: new Date().toISOString() }) });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // The browser dropped this subscription: forget the device.
        if (code === 404 || code === 410) await rest(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' });
        else console.error('push failed', code ?? 'error');
      }
    }
    return Response.json({ sent, devices: subs.length });
  } catch (e) {
    console.error('send-ping', (e as Error).message);
    return new Response('error', { status: 500 });
  }
});
