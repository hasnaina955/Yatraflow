export function earlyArrivalPlacement(index: number, firstLegVisible: boolean): 'leg' | 'stop' {
  return index === 0 && !firstLegVisible ? 'stop' : 'leg'
}
