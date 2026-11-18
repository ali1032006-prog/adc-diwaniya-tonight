// The end-of-night card (ADC-RES-54): drawn on a canvas on the phone itself, then handed to the
// phone's own share sheet (WhatsApp or any app) or saved as a picture. No WhatsApp API, no upload.
import type { NightCard, RulePack } from './api';
import type { Copy } from './copy';
import type { Fmt } from './i18n';

export const CARD_W = 1080;
export const CARD_H = 1350;
const C = {
  ground: '#15111a',
  surface: '#1e1824',
  raised: '#2a2231',
  ink: '#f4eee6',
  muted: '#bdb2c2',
  madder: '#c8402f',
  saffron: '#f0a93b',
  camel: '#b08a64',
};
const FONT = '"Readex Pro Variable", system-ui, sans-serif';

export interface CardText {
  rtl: boolean;
  name: string;
  meta: string;
  games: string;
  players: string;
  topTitle: string;
  top: string;
  topWins: string;
  resultsTitle: string;
  results: { pack: string; line: string }[];
  crownTitle: string;
  crown: string;
  me: string;
  brand: string;
}

/** Everything the card says, worked out apart from the drawing so it can be tested. */
export function cardText(card: NightCard, c: Copy, fmt: Fmt, lang: 'ar' | 'en', area: string, packs: Record<RulePack, string>): CardText {
  const date = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-KW' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kuwait' }).format(new Date(card.starts_at));
  const sep = lang === 'ar' ? '، ' : ', ';
  const best = card.top[0];
  return {
    rtl: lang === 'ar',
    name: card.name,
    meta: `${area} · ${date}`,
    games: c.tvroom.cardGames(card.games, fmt),
    players: card.players > 0 ? c.tvroom.cardPlayers(card.players, fmt) : '',
    topTitle: c.tvroom.cardTop,
    top: card.top.map((t) => t.name).join(sep),
    topWins: best ? c.tvroom.cardWins(best.wins, fmt) : '',
    resultsTitle: c.tvroom.cardResults,
    results: card.list.slice(0, 6).map((g) => ({
      pack: packs[g.rule_pack] ?? g.rule_pack,
      line: g.losers.length ? `${g.winners.join(sep)} ${c.tvroom.cardBeat} ${g.losers.join(sep)}` : g.winners.join(sep),
    })),
    crownTitle: c.tvroom.cardCrown,
    crown: card.crown.join(sep),
    me: card.me ? c.tvroom.cardMe(card.me.wins, card.me.played, fmt) : '',
    brand: lang === 'ar' ? 'ديوانيتنا' : 'Diwaniyatna',
  };
}

/** Shorten a line with an ellipsis until it fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function band(ctx: CanvasRenderingContext2D, y: number) {
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, y, CARD_W, 18);
  for (let x = 0; x < CARD_W; x += 72) {
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.moveTo(x, y + 18);
    ctx.lineTo(x + 9, y);
    ctx.lineTo(x + 18, y + 18);
    ctx.closePath();
    ctx.moveTo(x + 18, y);
    ctx.lineTo(x + 27, y + 18);
    ctx.lineTo(x + 36, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.saffron;
    ctx.beginPath();
    ctx.moveTo(x + 54, y + 2);
    ctx.lineTo(x + 63, y + 9);
    ctx.lineTo(x + 54, y + 16);
    ctx.lineTo(x + 45, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.camel;
    ctx.fillRect(x + 37, y + 7, 6, 4);
  }
}

function crown(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = C.camel;
  ctx.beginPath();
  ctx.moveTo(x, y + 26 * s);
  ctx.lineTo(x + 4 * s, y + 4 * s);
  ctx.lineTo(x + 14 * s, y + 16 * s);
  ctx.lineTo(x + 20 * s, y);
  ctx.lineTo(x + 26 * s, y + 16 * s);
  ctx.lineTo(x + 36 * s, y + 4 * s);
  ctx.lineTo(x + 40 * s, y + 26 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x, y + 28 * s, 40 * s, 4 * s);
}

/** Draw the card and return it as a PNG. */
export async function drawNightCard(t: CardText, doc: Document = document): Promise<Blob> {
  const canvas = doc.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  try {
    await Promise.all([doc.fonts?.load(`700 64px ${FONT}`), doc.fonts?.load(`400 32px ${FONT}`)]);
  } catch {
    /* system font then */
  }
  const pad = 72;
  const inner = CARD_W - pad * 2;
  const start = t.rtl ? CARD_W - pad : pad;
  ctx.direction = t.rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  band(ctx, 0);
  band(ctx, CARD_H - 18);

  let y = 150;
  ctx.fillStyle = C.ink;
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText(fit(ctx, t.name, inner), start, y);
  y += 56;
  ctx.fillStyle = C.muted;
  ctx.font = `400 34px ${FONT}`;
  ctx.fillText(fit(ctx, t.meta, inner), start, y);

  // the night in two numbers
  y += 70;
  ctx.fillStyle = C.surface;
  roundRect(ctx, pad, y, inner, 150, 28);
  ctx.fill();
  ctx.fillStyle = C.saffron;
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText(fit(ctx, t.games, inner / 2 - 40), t.rtl ? start - 40 : start + 40, y + 98);
  if (t.players) {
    ctx.fillStyle = C.ink;
    ctx.font = `500 44px ${FONT}`;
    ctx.textAlign = 'end';
    ctx.fillText(fit(ctx, t.players, inner / 2 - 40), t.rtl ? pad + 40 : CARD_W - pad - 40, y + 94);
    ctx.textAlign = 'start';
  }
  y += 150;

  // star of the night
  if (t.top) {
    y += 60;
    ctx.fillStyle = C.madder;
    roundRect(ctx, pad, y, inner, 170, 28);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `500 32px ${FONT}`;
    ctx.fillText(t.topTitle, t.rtl ? start - 40 : start + 40, y + 56);
    ctx.font = `700 56px ${FONT}`;
    ctx.fillText(fit(ctx, t.top, inner - 300), t.rtl ? start - 40 : start + 40, y + 130);
    ctx.font = `700 40px ${FONT}`;
    ctx.textAlign = 'end';
    ctx.fillText(t.topWins, t.rtl ? pad + 40 : CARD_W - pad - 40, y + 128);
    ctx.textAlign = 'start';
    y += 170;
  }

  // results
  if (t.results.length) {
    y += 70;
    ctx.fillStyle = C.ink;
    ctx.font = `700 38px ${FONT}`;
    ctx.fillText(t.resultsTitle, start, y);
    for (const r of t.results) {
      y += 64;
      ctx.font = `500 30px ${FONT}`;
      const tag = r.pack;
      const tagW = ctx.measureText(tag).width + 32;
      ctx.fillStyle = C.raised;
      roundRect(ctx, t.rtl ? start - tagW : start, y - 38, tagW, 50, 14);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.fillText(tag, t.rtl ? start - 16 : start + 16, y - 3);
      ctx.font = `400 32px ${FONT}`;
      ctx.fillText(fit(ctx, r.line, inner - tagW - 24), t.rtl ? start - tagW - 24 : start + tagW + 24, y - 2);
    }
  }

  // footer: the month's crown, you, the brand
  const foot = CARD_H - 160;
  ctx.strokeStyle = C.raised;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, foot - 40);
  ctx.lineTo(CARD_W - pad, foot - 40);
  ctx.stroke();
  if (t.crown) {
    crown(ctx, t.rtl ? start - 56 : start, foot - 8, 1.4);
    ctx.fillStyle = C.camel;
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText(t.crownTitle, t.rtl ? start - 80 : start + 80, foot + 10);
    ctx.fillStyle = C.ink;
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText(fit(ctx, t.crown, inner - 420), t.rtl ? start - 80 : start + 80, foot + 54);
  }
  ctx.textAlign = 'end';
  ctx.fillStyle = C.saffron;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(t.brand, t.rtl ? pad : CARD_W - pad, foot + 20);
  if (t.me) {
    ctx.fillStyle = C.muted;
    ctx.font = `400 30px ${FONT}`;
    ctx.fillText(fit(ctx, t.me, 360), t.rtl ? pad : CARD_W - pad, foot + 62);
  }

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Hand the picture to the phone's share sheet when it takes files; otherwise save it.
 * Returns what happened, so the screen can say so. A cancelled share is not an error.
 */
export async function shareOrSave(blob: Blob, fileName: string, title: string, nav: Navigator = navigator, doc: Document = document): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([blob], `${fileName}.png`, { type: 'image/png' });
  const n = nav as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (typeof n.share === 'function' && typeof n.canShare === 'function' && n.canShare({ files: [file] })) {
    try {
      await n.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // anything else: fall through and save it instead
    }
  }
  saveBlob(blob, `${fileName}.png`, doc);
  return 'saved';
}

export function saveBlob(blob: Blob, name: string, doc: Document = document) {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
