import { WovenBand } from '../components/WovenBand';
import { TopMenu } from '../components/TopMenu';

/** A top-level tab screen: app bar with title (and one optional action), the menu button, woven band, body. */
export function Screen({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <header className="appbar">
        <h1 className="appbar__title">{title}</h1>
        {action}
        <TopMenu />
      </header>
      <WovenBand className="appbar__band" />
      <div className="screen__body">{children}</div>
    </>
  );
}
