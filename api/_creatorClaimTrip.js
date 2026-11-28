// Map the parsed Trip (src/lib/tripImport.ts) to its content columns.
// Keep the same fields as tripToRow. Database code makes all identity, access,
// timestamp and origin fields. No member, publication or invite state crosses.
import { isRecord } from './_creatorClaim.js'

const modes = ['car', 'rental', 'motorcycle', 'train', 'bus', 'flight', 'taxi', 'mixed']
const styles = ['relaxed', 'balanced', 'packed', 'adventure', 'luxury', 'budget', 'family', 'spiritual', 'food-focused', 'creator']
const stayStyles = ['budget', 'comfort', 'luxury']

function requireField(ok, field) {
  if (!ok) throw new Error(`Invalid trip ${field}. Check the imported trip file.`)
}

const validText = v => typeof v === 'string' && !!v.trim()
const finite = v => typeof v === 'number' && Number.isFinite(v)
const optional = (v, test) => v == null || test(v)
const listOf = (v, test) => Array.isArray(v) && v.every(test)
const coords = p => isRecord(p) && finite(p.lat) && finite(p.lng)
  && p.lat !== 0 && p.lng !== 0 && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value)
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value
}
const validDay = (d, i) => isRecord(d) && validText(d.id) && d.index === i
  && listOf(d.stops, s => isRecord(s) && validText(s.id) && validText(s.title) && validText(s.category)
    && validText(s.locationName) && coords(s) && finite(s.visitMinutes) && s.visitMinutes >= 0
    && finite(s.entryFeeInrPerPerson) && s.entryFeeInrPerPerson >= 0
    && finite(s.transportCostInrTotal) && s.transportCostInrTotal >= 0
    && Number.isSafeInteger(s.orderInDay) && s.orderInDay > 0)

export function normalizeSeedTrip(raw) {
  requireField(isRecord(raw), 'object')
  const { name, startLocation, destinations, startDate, endDate, travellers, transportMode, travelStyle, budgetPerPersonInr } = raw
  requireField(validText(name) && name.length <= 120, 'name')
  requireField(validText(startLocation), 'start place')
  requireField(listOf(destinations, validText), 'destinations')
  requireField(optional(raw.startLocationCoords, coords), 'start coordinates')
  requireField(optional(raw.destinationCoords, v => listOf(v, c => c === null || coords(c)) && v.length === destinations.length), 'destination coordinates')
  requireField(isoDate(startDate) && isoDate(endDate) && startDate <= endDate, 'dates')
  requireField(Number.isSafeInteger(travellers) && travellers >= 1 && travellers <= 2147483647, 'traveller count')
  requireField(modes.includes(transportMode) && styles.includes(travelStyle), 'transport or travel style')
  requireField(finite(budgetPerPersonInr) && budgetPerPersonInr >= 0 && Math.round(budgetPerPersonInr) <= 2147483647, 'budget')
  requireField(Array.isArray(raw.days) && raw.days.length > 0 && raw.days.every(validDay), 'days')
  const dayCount = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1
  requireField(dayCount === raw.days.length, 'date range')
  requireField(listOf(raw.expenses, e => isRecord(e) && validText(e.id) && validText(e.label)
    && finite(e.amountInr) && e.amountInr > 0), 'expenses')
  requireField(listOf(raw.fixedCommitments, c => isRecord(c) && validText(c.id) && validText(c.title)
    && Number.isInteger(c.dayIndex) && c.dayIndex >= 0 && c.dayIndex < raw.days.length
    && typeof c.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.time)), 'fixed commitments')
  requireField(validText(raw.coverEmoji), 'cover')
  requireField(optional(raw.coverImageUrl, v => typeof v === 'string'), 'cover image')
  requireField(optional(raw.stayStyle, v => stayStyles.includes(v)), 'stay style')
  requireField(optional(raw.driverCount, v => v === 2 || v === 3 || v === 1), 'driver count')
  requireField(optional(raw.driveAfterDinnerMin, v => finite(v) && v >= 1 && v <= 480), 'drive after dinner time')
  requireField(optional(raw.fuelEconomyKmL, v => finite(v) && v > 0)
    && optional(raw.fuelPricePerL, v => finite(v) && v > 0), 'fuel')
  requireField(optional(raw.tankL, v => finite(v) && v >= 5 && v <= 300), 'tank')
  requireField(optional(raw.rentPerDayInr, v => finite(v) && v >= 0 && v <= 100000), 'rental budget')
  requireField(optional(raw.vehicleProfile, v => isRecord(v) && ['car', 'motorcycle', 'ev'].includes(v.vehicleType)
    && ['petrol', 'diesel', 'electric', 'cng'].includes(v.fuelType)
    && finite(v.capacity) && v.capacity > 0 && finite(v.economy) && v.economy > 0), 'vehicle profile')
  requireField([raw.roundTrip, raw.hasVulnerable, raw.localTrain, raw.drivesPart].every(v => optional(v, x => typeof x === 'boolean')), 'trip preferences')
  requireField(optional(raw.flights, v => listOf(v, f => isRecord(f) && validText(f.id)
    && validText(f.fromAirport) && validText(f.toAirport)
    && Number.isInteger(f.dayIndex) && f.dayIndex >= 0 && f.dayIndex < raw.days.length)), 'flights')
  return {
    name: name.trim(),
    start_location: startLocation,
    start_location_coords: raw.startLocationCoords ?? null,
    destinations,
    destination_coords: raw.destinationCoords ?? null,
    start_date: startDate,
    end_date: endDate,
    travellers,
    transport_mode: transportMode,
    travel_style: travelStyle,
    budget_per_person_inr: Math.round(budgetPerPersonInr),
    fixed_commitments: raw.fixedCommitments,
    days: raw.days,
    expenses: raw.expenses,
    cover_emoji: raw.coverEmoji,
    cover_image_url: raw.coverImageUrl ?? null,
    fuel_economy_km_per_l: raw.fuelEconomyKmL ?? null,
    fuel_price_per_l: raw.fuelPricePerL ?? null,
    round_trip: raw.roundTrip ?? null,
    stay_style: raw.stayStyle ?? null,
    driver_count: raw.driverCount === 2 || raw.driverCount === 3 ? raw.driverCount : null,
    has_vulnerable: raw.hasVulnerable === true,
    drive_after_dinner_min: raw.driveAfterDinnerMin == null ? null : Math.round(raw.driveAfterDinnerMin),
    vehicle_profile: raw.vehicleProfile ?? null,
    tank_l: raw.tankL ?? null,
    rent_per_day_inr: raw.rentPerDayInr ?? null,
    local_train: raw.localTrain ?? null,
    drives_part: raw.drivesPart ?? null,
    flights: raw.flights ?? [],
  }
}
