// Detour whisker: the little route-line-with-spur drawing on every rail card.
//
// One component for the drawing (#160) — it used to be a bespoke inline <svg>
// per card with hardcoded geometry, N copies of the same subtree. The spur's
// length now MEANS something: it scales with the detour's share of the day's
// budget (proportional up to the cap), so a heavier detour visibly leans
// further off the route. Warn (amber) styling stays a class swap, decided
// here from the same predicate the card's fact strip uses (#163: round-half-up).

/** Warn predicate shared with the fact strip (#163): display-rounding math. */
export function whiskIsHeavy(detourMin: number, budgetMin: number): boolean {
  return Math.round(detourMin) > budgetMin
}

/**
 * Spur tip's y in the 54×20 viewBox: 14 sits ON the route, 3 is the max lean.
 * Share-of-budget drives it — a detour using half the day's budget leans half
 * as far as the cap. Pure so the geometry is unit-pinnable (#160).
 */
export function whiskTipY(detourMin: number, budgetMin: number): number {
  if (whiskIsHeavy(detourMin, budgetMin)) return 3
  const share = budgetMin > 0 ? Math.min(1, Math.max(0, detourMin / budgetMin)) : 1
  return Math.round(14 - 11 * share)
}

export function DetourWhisk({ detourMin, budgetMin }: { detourMin: number; budgetMin: number }) {
  const heavy = whiskIsHeavy(detourMin, budgetMin)
  const cy = whiskTipY(detourMin, budgetMin)
  return (
    <svg className="poi-whisk" width={54} height={20} viewBox="0 0 54 20" aria-hidden>
      <path className="poi-whisk-route" d="M1 14h52" />
      <path
        className={heavy ? 'poi-whisk-spur poi-whisk-spur--heavy' : 'poi-whisk-spur'}
        d={`M32 14 L45 ${cy}`}
      />
      <circle
        className={heavy ? 'poi-whisk-pin poi-whisk-pin--heavy' : 'poi-whisk-pin'}
        cx={45}
        cy={cy}
        r={3}
      />
    </svg>
  )
}
