import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOCK_ITEMS, formatDockBadge, resolveDockActive } from "../src/lib/mobileDock";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("dock model", () => {
  it("shows a badge only for a real positive count", () => {
    expect(formatDockBadge(undefined)).toBeNull();
    expect(formatDockBadge(0)).toBeNull();
    expect(formatDockBadge(-3)).toBeNull();
    expect(formatDockBadge(Number.NaN)).toBeNull();
    expect(formatDockBadge(4)).toBe("4");
    expect(formatDockBadge(12)).toBe("9+");
  });

  it("maps real app paths to the slot that owns them", () => {
    expect(resolveDockActive("/")).toBe("trips");
    expect(resolveDockActive("/trip/abc")).toBe("trips");
    expect(resolveDockActive("/new")).toBe("create");
    expect(resolveDockActive("/created/abc")).toBe("create");
    expect(resolveDockActive("/explore")).toBe("explore");
    expect(resolveDockActive("/pub/goa")).toBe("explore");
    expect(resolveDockActive("/creator-hub")).toBe("explore");
    expect(resolveDockActive("/profile")).toBe("you");
    expect(resolveDockActive("/purchases")).toBe("you");
    expect(resolveDockActive("/explore?x=1#y")).toBe("explore");
    expect(resolveDockActive("")).toBe("trips");
  });

  it("keeps five slots and one create slot", () => {
    expect(DOCK_ITEMS).toHaveLength(5);
    expect(DOCK_ITEMS.filter((i) => i.key === "create")).toHaveLength(1);
  });
});

describe("mobile dock source", () => {
  it("imports the shell section last", () => {
    const css = read("src/styles.css");
    const imports = css.match(/@import[^;]+;/g) ?? [];
    expect(imports.at(-1)).toContain("mobile-shell.css");
  });

  it("gives every token a fallback", () => {
    const css = read("src/styles/components/mobile-shell.css");
    for (const use of css.match(/var\(--[^)]*/g) ?? []) {
      expect(use).toContain(",");
    }
  });

  it("keeps the dock off wide screens and mirrors reduced motion", () => {
    const css = read("src/styles/components/mobile-shell.css");
    expect(css).toContain("(pointer: coarse)");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("rides the named motion tokens, not raw durations", () => {
    const css = read("src/styles/components/mobile-shell.css");
    expect(css).toContain("transition:color var(--motion-fast, ");
    expect(css).toContain("var(--motion-med, ");
    expect(css).toContain("var(--motion-slow, ");
    for (const line of css.split("\n")) {
      if (/transition:/.test(line)) expect(line).not.toMatch(/\d+(?:\.\d+)?(?:ms|s)\b/);
    }
  });

  it("makes no native bridge call in the component", () => {
    expect(read("src/components/mobile/MobileDock.tsx")).not.toContain("navigator.");
  });
});
