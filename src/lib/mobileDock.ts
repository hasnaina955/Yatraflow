/** Pure dock model. No DOM and no bridge calls, so the node suite can pin it. */

export type DockKey = "trips" | "explore" | "create" | "alerts" | "you";

export type DockItem = {
  key: DockKey;
  label: string;
  href: string;
  badge?: number;
};

/** Alerts is a panel, not a route. Its href is a marker the shell intercepts. */
export const DOCK_ITEMS: readonly DockItem[] = [
  { key: "trips", label: "Trips", href: "/" },
  { key: "explore", label: "Explore", href: "/explore" },
  { key: "create", label: "Plan a trip", href: "/new" },
  { key: "alerts", label: "Alerts", href: "#notifications" },
  { key: "you", label: "You", href: "/profile" },
];

/** A badge shows only for a real positive count. Ten or more reads as 9+. */
export function formatDockBadge(n: number | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  const v = Math.floor(n);
  return v > 9 ? "9+" : String(v);
}

/** Map a real app path to the dock slot that owns it. Query and hash are ignored. */
export function resolveDockActive(path: string): DockKey {
  const p = (path || "/").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (p === "/new" || p.startsWith("/created")) return "create";
  if (p === "/explore" || p.startsWith("/pub") || p.startsWith("/creator") || p === "/i") return "explore";
  if (p.startsWith("/creator-hub")) return "explore";
  if (p === "/profile" || p === "/purchases" || p === "/admin") return "you";
  return "trips";
}
