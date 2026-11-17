import { useState } from 'react';
import { SeatRing, type Seat } from './SeatRing';
import { EmptyState } from './EmptyState';
import { ErrorNote, Field, Skeleton, initials } from './ui';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction } from '../lib/useAsync';
import { completeProfile, openSeats, type TableRow } from '../lib/api';
import { currentFrom, href } from '../lib/router';
import { clearPendingRegister, isAdult, pendingRegister } from '../lib/auth';
import { BirthField, ConsentChecks } from './consent';

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

/** Shown where an account is needed: what it unlocks, then Sign in or New account (Google only). */
export function SignInGate() {
  const { c } = usePrefs();
  const from = currentFrom();
  return (
    <EmptyState
      art={<SeatRing game="kout" seats={[{ initials: 'ض' }, null, null, { initials: 'م' }, null, null]} size={120} decorative />}
      title={c.gate.title}
      body={c.gate.body}
      actions={[
        { label: c.gate.signIn, href: href.signin('signin', from), primary: true },
        { label: c.gate.register, href: href.signin('register', from) },
      ]}
    />
  );
}

/**
 * S3 profile setup: name and area, plus the age (18+, ruling B), the male confirmation (ruling C)
 * and the Terms. What the Register tab collected before Google is filled in; the server checks all of it.
 */
export function ProfileSetup() {
  const { c, err } = usePrefs();
  const { refresh } = useSession();
  const act = useAction();
  const [pending] = useState(() => pendingRegister());
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [birth, setBirth] = useState(pending?.birth ?? '');
  const [male, setMale] = useState(pending?.male ?? false);
  const [terms, setTerms] = useState(pending?.terms ?? false);
  const ready = name.trim() !== '' && area.trim() !== '' && isAdult(birth) && male && terms;
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
          if (!ready) return;
          void act.run(async () => {
            await completeProfile(name, area, birth, terms, male);
            clearPendingRegister();
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
        <BirthField value={birth} onChange={setBirth} />
        <ConsentChecks male={male} terms={terms} onMale={setMale} onTerms={setTerms} />
        {act.error != null && <ErrorNote text={err(act.error)} />}
        <button className="btn btn--primary" disabled={act.busy || !ready}>
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
