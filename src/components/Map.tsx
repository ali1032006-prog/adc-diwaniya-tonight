import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { MapPin, Minus, Plus, Crosshair, NavigationArrow } from '@phosphor-icons/react';
import { usePrefs } from '../lib/prefs';

// OpenStreetMap standard tiles (ADC-LOG-754 item 5). Usage policy checked 2026-11-18
// (https://operations.osmfoundation.org/policies/tiles/): https URL below, visible attribution,
// the browser's own User-Agent, a Referer on every tile (our site-wide Referrer-Policy is
// no-referrer, so each <img> asks for strict-origin-when-cross-origin: the origin only), browser
// caching untouched, and only the tiles the viewport shows: no prefetch, no offline copies.
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';
const TILE = 256;
export const KUWAIT_CENTER = { lat: 29.3375, lng: 47.98 };
/** Same box as the diwaniya_pins_in_kuwait check in the database. */
export const KUWAIT_BOUNDS = { minLat: 28.45, maxLat: 30.15, minLng: 46.5, maxLng: 48.6 };

export interface LatLng {
  lat: number;
  lng: number;
}

/** Web Mercator: a point to world pixels at zoom z. */
export function project(p: LatLng, z: number): { x: number; y: number } {
  const s = TILE * 2 ** z;
  const sin = Math.sin((p.lat * Math.PI) / 180);
  return { x: ((p.lng + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
}

/** World pixels at zoom z back to a point, rounded to the 5 decimals the database keeps (about 1 m). */
export function unproject(x: number, y: number, z: number): LatLng {
  const s = TILE * 2 ** z;
  const lng = (x / s) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / s;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}

export function inKuwait(p: LatLng): boolean {
  const b = KUWAIT_BOUNDS;
  return p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
}

/** Tiles covering a w x h viewport centred on `center` (no look-ahead: the policy forbids prefetch). */
export function tilesFor(center: LatLng, z: number, w: number, h: number) {
  const c = project(center, z);
  const left = c.x - w / 2;
  const top = c.y - h / 2;
  const n = 2 ** z;
  const out: { key: string; src: string; x: number; y: number }[] = [];
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + h - 1) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w - 1) / TILE); tx++) {
      const wx = ((tx % n) + n) % n;
      out.push({
        key: `${z}/${tx}/${ty}`,
        src: TILE_URL.replace('{z}', String(z)).replace('{x}', String(wx)).replace('{y}', String(ty)),
        x: tx * TILE - left,
        y: ty * TILE - top,
      });
    }
  }
  return out;
}

/** Google Maps link for a pin: Maps URLs need no key and open the app on phones. */
export function googleMapsUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(1, Math.round(el.getBoundingClientRect().width)) || fallback);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return { ref, w };
}

function Tiles({ center, zoom, w, h, shift }: { center: LatLng; zoom: number; w: number; h: number; shift: { x: number; y: number } }) {
  return (
    <div className="map__tiles" style={{ transform: `translate3d(${shift.x}px, ${shift.y}px, 0)` }}>
      {tilesFor(center, zoom, w, h).map((t) => (
        <img
          key={t.key}
          className="map__tile"
          src={t.src}
          alt=""
          width={TILE}
          height={TILE}
          draggable={false}
          decoding="async"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ transform: `translate3d(${t.x}px, ${t.y}px, 0)` }}
        />
      ))}
    </div>
  );
}

function Attribution() {
  const { c } = usePrefs();
  return (
    <p className="map__credit">
      ©{' '}
      <a href={OSM_COPYRIGHT} target="_blank" rel="noopener noreferrer">
        {c.map.osm}
      </a>
    </p>
  );
}

/**
 * S9 location: the host taps the map to drop the pin, drags to look around, or uses his
 * location. Keyboard: arrows pan, +/- zoom, Enter drops the pin at the centre.
 */
export function MapPicker({ value, onChange }: { value: LatLng | null; onChange: (p: LatLng) => void }) {
  const { c } = usePrefs();
  const { ref, w } = useWidth<HTMLDivElement>();
  const h = 240;
  const [center, setCenter] = useState<LatLng>(value ?? KUWAIT_CENTER);
  const [zoom, setZoom] = useState(value ? 16 : 11);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const [locErr, setLocErr] = useState('');
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);

  const pick = (p: LatLng) => {
    if (!inKuwait(p)) {
      setLocErr(c.map.outside);
      return;
    }
    setLocErr('');
    onChange(p);
  };
  const panBy = (dx: number, dy: number) => {
    const cp = project(center, zoom);
    setCenter(unproject(cp.x - dx, cp.y - dy, zoom));
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    if (d.moved) setShift({ x: dx, y: dy });
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) {
      panBy(e.clientX - d.x, e.clientY - d.y);
      setShift({ x: 0, y: 0 });
      return;
    }
    const box = e.currentTarget.getBoundingClientRect();
    const cp = project(center, zoom);
    pick(unproject(cp.x - w / 2 + (e.clientX - box.left), cp.y - h / 2 + (e.clientY - box.top), zoom));
  };

  const pinAt = value ? project(value, zoom) : null;
  const cp = project(center, zoom);

  return (
    <div className="map-picker">
      <div
        ref={ref}
        className="map map--picker"
        style={{ height: h }}
        tabIndex={0}
        role="application"
        aria-roledescription={c.map.roleDesc}
        aria-label={c.map.pickerLabel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          drag.current = null;
          setShift({ x: 0, y: 0 });
        }}
        onKeyDown={(e) => {
          const step = 64;
          if (e.key === 'ArrowLeft') panBy(step, 0);
          else if (e.key === 'ArrowRight') panBy(-step, 0);
          else if (e.key === 'ArrowUp') panBy(0, step);
          else if (e.key === 'ArrowDown') panBy(0, -step);
          else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(18, z + 1));
          else if (e.key === '-') setZoom((z) => Math.max(8, z - 1));
          else if (e.key === 'Enter') pick(center);
          else return;
          e.preventDefault();
        }}
      >
        <Tiles center={center} zoom={zoom} w={w} h={h} shift={shift} />
        {pinAt && (
          <span
            className="map__pin"
            aria-hidden="true"
            style={{ transform: `translate3d(${pinAt.x - cp.x + w / 2 + shift.x}px, ${pinAt.y - cp.y + h / 2 + shift.y}px, 0)` }}
          >
            <MapPin size={36} weight="fill" />
          </span>
        )}
        <span className="map__cross" aria-hidden="true" />
        <div className="map__zoom">
          <button type="button" className="map__btn" aria-label={c.map.zoomIn} onClick={() => setZoom((z) => Math.min(18, z + 1))}>
            <Plus size={18} aria-hidden="true" />
          </button>
          <button type="button" className="map__btn" aria-label={c.map.zoomOut} onClick={() => setZoom((z) => Math.max(8, z - 1))}>
            <Minus size={18} aria-hidden="true" />
          </button>
        </div>
        <Attribution />
      </div>
      <p className="muted small">{c.map.hint}</p>
      <div className="row">
        <button
          type="button"
          className="btn btn--quiet btn--small"
          disabled={busy}
          onClick={() => {
            if (!('geolocation' in navigator)) {
              setLocErr(c.map.noLocation);
              return;
            }
            setBusy(true);
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setBusy(false);
                const p = { lat: Math.round(pos.coords.latitude * 1e5) / 1e5, lng: Math.round(pos.coords.longitude * 1e5) / 1e5 };
                if (!inKuwait(p)) {
                  setLocErr(c.map.outside);
                  return;
                }
                setCenter(p);
                setZoom(17);
                pick(p);
              },
              () => {
                setBusy(false);
                setLocErr(c.map.noLocation);
              },
              { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
            );
          }}
        >
          <NavigationArrow size={18} aria-hidden="true" />
          {c.map.useMine}
        </button>
        <button type="button" className="btn btn--text btn--small" onClick={() => pick(center)}>
          <Crosshair size={18} aria-hidden="true" />
          {c.map.pinCentre}
        </button>
      </div>
      {locErr && (
        <p className="field__hint field__hint--error" role="alert">
          {locErr}
        </p>
      )}
      <p className="small" aria-live="polite">
        {value ? c.map.pinned : c.map.notPinned}
      </p>
    </div>
  );
}

/** S6 for approved guests: a small map with the pin and an 'Open in Google Maps' link. */
export function MapView({ at }: { at: LatLng }) {
  const { c } = usePrefs();
  const { ref, w } = useWidth<HTMLDivElement>();
  const h = 168;
  const zoom = 16;
  return (
    <div ref={ref} className="map map--view" style={{ height: h }} role="img" aria-label={c.map.viewLabel}>
      <Tiles center={at} zoom={zoom} w={w} h={h} shift={{ x: 0, y: 0 }} />
      <span className="map__pin" aria-hidden="true" style={{ transform: `translate3d(${w / 2}px, ${h / 2}px, 0)` }}>
        <MapPin size={36} weight="fill" />
      </span>
      <Attribution />
    </div>
  );
}
