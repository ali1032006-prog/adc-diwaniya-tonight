import { describe, expect, it } from 'vitest';
import headersFile from '../public/_headers?raw';
import vercelRaw from '../vercel.json?raw';

// Hosting move to Vercel Hobby (Ali, 2026-11-18, ADC-TSK-36). vercel.json must carry the
// exact security headers the Cloudflare Pages _headers file sets, route /tv to the TV page,
// and use no paid feature (no functions, crons, regions or image optimisation).
type Rule = { source: string; headers?: { key: string; value: string }[]; destination?: string };
const cfg = JSON.parse(vercelRaw) as {
  framework: string; buildCommand: string; outputDirectory: string; installCommand: string;
  cleanUrls: boolean; rewrites: Rule[]; headers: Rule[]; [k: string]: unknown;
};

function pagesHeaders(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of headersFile.split('\n')) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

describe('vercel.json (Vercel Hobby hosting)', () => {
  it('builds the same Vite output as Pages', () => {
    expect(cfg.framework).toBe('vite');
    expect(cfg.buildCommand).toBe('npm run build');
    expect(cfg.outputDirectory).toBe('dist');
    expect(cfg.installCommand).toBe('npm ci');
  });

  it('sets every Pages security header with the identical value on every path', () => {
    const all = cfg.headers.find((h) => h.source === '/(.*)');
    expect(all).toBeTruthy();
    const got = Object.fromEntries(all!.headers!.map((h) => [h.key, h.value]));
    const want = pagesHeaders();
    expect(Object.keys(want).length).toBeGreaterThanOrEqual(7);
    expect(got).toEqual(want);
  });

  it('CSP still allows only our own origin, the Supabase project and OSM tiles', () => {
    const csp = pagesHeaders()['Content-Security-Policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/vercel|\*/);
  });

  it('serves /tv (and /tv/) from tv.html before the app fallback', () => {
    expect(cfg.cleanUrls).toBe(true);
    const srcs = cfg.rewrites.map((r) => r.source);
    const tv = cfg.rewrites.find((r) => r.source === '/tv');
    expect(tv?.destination).toBe('/tv.html');
    expect(cfg.rewrites.find((r) => r.source === '/tv/')?.destination).toBe('/tv.html');
    const last = cfg.rewrites[cfg.rewrites.length - 1];
    expect(last.destination).toBe('/index.html');
    expect(srcs.indexOf('/tv')).toBeLessThan(cfg.rewrites.length - 1);
    // The fallback must not swallow real files (assets, sw.js, tv-legacy.js, manifest).
    expect(last.source).toMatch(/\(\?!/);
  });

  it('uses no paid or server-side features', () => {
    for (const k of ['functions', 'crons', 'regions', 'images', 'fluid', 'public']) {
      expect(cfg).not.toHaveProperty(k);
    }
  });
});
