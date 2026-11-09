import { Fragment } from 'react'
import { MapRoute } from '../mapcn/map'
import { ROUTE_PAINT, type DayRoadSlice } from '../../lib/mapStyles/routeTreatment'

/**
 * The all-days view with one day stressed. Other days sit behind at 2px and
 * 40%. The selected day paints last, at 5px over its casing.
 */
export function DayRouteLayers({ slices, dark, colorFor }: { slices: DayRoadSlice[]; dark: boolean; colorFor: (dayIndex: number) => string }) {
  return <>
    {slices.map(slice => slice.selected ? (
      <Fragment key={`all-day-${slice.dayIndex}`}>
        <MapRoute id={`yf-all-casing-${slice.dayIndex}`} coordinates={slice.coordinates} color={dark ? '#0B2545' : '#FFFFFF'} width={ROUTE_PAINT.selectedCasingWidth} opacity={dark ? 0.6 : 0.75} interactive={false} />
        <MapRoute id={`yf-all-day-${slice.dayIndex}`} coordinates={slice.coordinates} color={colorFor(slice.dayIndex)} width={ROUTE_PAINT.selectedWidth} opacity={0.95} />
      </Fragment>
    ) : (
      <MapRoute key={`all-day-${slice.dayIndex}`} id={`yf-all-day-${slice.dayIndex}`} coordinates={slice.coordinates} color={colorFor(slice.dayIndex)} width={ROUTE_PAINT.contextWidth} opacity={ROUTE_PAINT.contextOpacity} interactive={false} />
    ))}
  </>
}
