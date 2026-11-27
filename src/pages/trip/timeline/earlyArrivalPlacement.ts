export function earlyArrivalPlacement(index: number, firstLegVisible: boolean, prevIsAuto: boolean): 'leg' | 'stop' {
  // The anchor branch returns before the after-row leg block, so the next stop has no leg row.
  return (index === 0 && !firstLegVisible) || (index > 0 && prevIsAuto) ? 'stop' : 'leg'
}
