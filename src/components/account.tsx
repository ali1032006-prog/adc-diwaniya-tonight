import { useState } from 'react';
import { SeatRing, type Seat } from './SeatRing';
import { EmptyState } from './EmptyState';
import { ErrorNote, Field, Skeleton, initials } from './ui';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction } from '../lib/useAsync';
import { completeProfile, openSeats, type TableRow } from '../lib/api';
import { hrefFor } from '../lib/router';

/** A table's seats in ring order, open ones as null, mine marked. */
export function ringSeats(t: TableRow, me: string | null): Seat[] {
  return Array.from({ length: t.seat_count }, (_, i) => {
    const s = t.seats?.find((x) => x.seat_no === i + 1);
    if (!s) return null;
    return { initials: initials(s.profile?.display_name ?? s.walk_in_name), mine: !!me && s.user_id === me };
  });
}

/** One table: ring plus its open-seat line in saffron (text, never colour alone). */
export function TableRing({ table, size = 96 }: { table: TableRow; size?: number }) {
  const { t, fmt } = usePrefs();
  const { userId } = useSession();
  const open = openSeats(table);
  return (
    <figure className="table-ring">
      <SeatRing game={table.game} seats={ringSeats(table, userId)} size={size} />
      <figcaption className="table-ring__cap">
        {table.label && (
          <span className="table-ring__label">
            <bdi>{table.label}</bdi>
          </span>
        )}
        <span className={open > 0 ? 'open-line' : 'full-line'}>{t.seatsOpen(open, fmt)}</span>
      </figcaption>
    </figure>
  );
}

/** Shown where an account is needed while sign-in waits on its method (ruling A). */
export function SignInGate() {
  const { c, t } = usePrefs();
  return (
    <EmptyState
      art={<SeatRing game="kout" seats={[{ initials: 'ض' }, null, null, { initials: 'م' }, null, null]} size={120} decorative />}
      title={c.gate.title}
      body={c.gate.body}
      actions={[{ label: t.welcome.lookAround, href: hrefFor('tonight'), primary: true }]}
    />
  );
}

/** S3 profile setup: name, area, birth date for the age gate, consent. */
export function ProfileSetup() {
  const { c, err } = usePrefs();
  const { refresh } = useSession();
  const act = useAction();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [birth, setBirth] = useState('');
  const [terms, setTerms] = useState(false);
  return (
    <section className="panel" aria-labelledby="setup-t">
      <h2 id="setup-t" className="panel__title panel__title--ink">
        {c.gate.profileTitle}
      </h2>
      <p className="muted">{c.gate.profileBody}</p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await completeProfile(name, area, birth, terms);
            await refresh();
          });
        }}
      >
        <Field label={c.profile.name}>
          <input className="input" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </Field>
        <Field label={c.profile.area} hint={c.profile.areaHint}>
          <input className="input" required maxLength={60} value={area} onChange={(e) => setArea(e.target.value)} />
        </Field>
        <Field label={c.profile.birth} hint={c.profile.tooYoung}>
          <input className="input" type="date" required value={birth} onChange={(e) => setBirth(e.target.value)} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
          <span>{c.profile.terms}</span>
        </label>
        {act.error != null && <ErrorNote text={err(act.error)} />}
        <button className="btn btn--primary" disabled={act.busy}>
          {c.profile.finish}
        </button>
      </form>
    </section>
  );
}

/** Wrap a signed-in-only area: shows the gate or the profile setup until the account is ready. */
export function NeedsAccount({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  if (status === 'ready') return <>{children}</>;
  if (status === 'loading') return <Skeleton />;
  if (status === 'needsProfile') return <ProfileSetup />;
  return <SignInGate />;
}
