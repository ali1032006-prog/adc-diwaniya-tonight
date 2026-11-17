import { EmptyState } from '../components/EmptyState';
import { SeatRing } from '../components/SeatRing';
import { DallahArt, ScoreSheetArt } from '../components/Art';
import { WovenBand } from '../components/WovenBand';
import { hrefFor } from '../lib/router';
import { usePrefs } from '../lib/prefs';

function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <header className="appbar">
        <h1 className="appbar__title">{title}</h1>
      </header>
      <WovenBand className="appbar__band" />
      <div className="screen__body">{children}</div>
    </>
  );
}

export function Tonight() {
  const { t } = usePrefs();
  return (
    <Screen title={t.tonight.title}>
      <EmptyState
        art={<SeatRing game="kout" seats={[null, null, null, null, null, null]} size={132} decorative />}
        title={t.tonight.emptyTitle}
        body={t.tonight.emptyBody}
        actions={[
          { label: t.tonight.follow, href: hrefFor('tonight'), primary: true },
          { label: t.tonight.openYours, href: hrefFor('diwaniya') },
        ]}
      />
    </Screen>
  );
}

export function Diwaniya() {
  const { t } = usePrefs();
  return (
    <Screen title={t.diwaniya.title}>
      <EmptyState
        art={<SeatRing game="baloot" seats={[{ initials: 'ع' }, null, { initials: 'م' }, null]} size={132} decorative />}
        title={t.diwaniya.emptyTitle}
        body={t.diwaniya.emptyBody}
        actions={[{ label: t.diwaniya.open, href: hrefFor('diwaniya'), primary: true }]}
      />
    </Screen>
  );
}

export function League() {
  const { t } = usePrefs();
  return (
    <Screen title={t.league.title}>
      <EmptyState
        art={<ScoreSheetArt />}
        title={t.league.emptyTitle}
        body={t.league.emptyBody}
        actions={[{ label: t.league.score, href: hrefFor('league'), primary: true }]}
      />
    </Screen>
  );
}

export function Inbox() {
  const { t } = usePrefs();
  return (
    <Screen title={t.inbox.title}>
      <EmptyState
        art={<DallahArt />}
        title={t.inbox.emptyTitle}
        body={t.inbox.emptyBody}
        actions={[{ label: t.inbox.enable, href: hrefFor('me'), primary: true }]}
      />
    </Screen>
  );
}

export { Screen };
