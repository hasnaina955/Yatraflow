import { DOCK_ITEMS, formatDockBadge, type DockItem } from "../../lib/mobileDock";

type Props = {
  active: string;
  onNavigate: (item: DockItem) => void;
  items?: readonly DockItem[];
  onCreate?: () => void;
  /** Pass lib/haptics tap() from the shell. This file makes no bridge call itself. */
  haptics?: { tap?: () => void };
};

function DockIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    trips: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9.5 21v-6h5v6",
    explore: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5z",
    alerts: "M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9M10 20a2.2 2.2 0 0 0 4 0",
    you: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5",
    create: "M12 5v14M5 12h14",
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.trips} />
    </svg>
  );
}

export default function MobileDock({ active, onNavigate, items = DOCK_ITEMS, onCreate, haptics }: Props) {
  const tap = () => haptics?.tap?.();
  return (
    <nav className="yf-mdock" aria-label="Primary">
      {items.map((item) => {
        if (item.key === "create") {
          return (
            <span className="yf-mdock-fabwrap" key={item.key}>
              <button type="button" className="yf-mdock-fab" aria-label={item.label}
                onClick={() => { tap(); (onCreate ?? (() => onNavigate(item)))(); }}>
                <DockIcon name="create" />
              </button>
            </span>
          );
        }
        const badge = formatDockBadge(item.badge);
        const on = active === item.key;
        return (
          <a key={item.key} href={item.href}
            className={`yf-mdock-tab${on ? " is-active" : ""}`}
            aria-current={on ? "page" : undefined}
            onClick={(e) => { e.preventDefault(); tap(); onNavigate(item); }}>
            <DockIcon name={item.key} />
            <span>{item.label}</span>
            {badge ? <span className="yf-mdock-badge" aria-label={`${item.badge} unread`}>{badge}</span> : null}
          </a>
        );
      })}
    </nav>
  );
}
