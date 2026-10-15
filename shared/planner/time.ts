function offsetMinutes(utcMs: number, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  return Math.round((asUtc - utcMs) / 60_000)
}

const offsetText = (minutes: number) => {
  const sign = minutes < 0 ? '-' : '+'
  const absolute = Math.abs(minutes)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

export function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** The calendar day (YYYY-MM-DD) an instant falls on in the given timezone. */
export function localDay(iso: string, timeZone: string) {
  const utcMs = Date.parse(iso)
  return new Date(utcMs + offsetMinutes(utcMs, timeZone) * 60_000).toISOString().slice(0, 10)
}

/** A wall-clock time like 2026-11-02T09:00 in the given timezone -> ISO string with that day's offset. */
export function localToIso(local: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::00)?$/.exec(local)
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute)
  // The offset depends on the date (daylight saving), so check it again at the resulting instant.
  let offset = offsetMinutes(wallClockAsUtc, timeZone)
  offset = offsetMinutes(wallClockAsUtc - offset * 60_000, timeZone)
  const iso = `${match[0].slice(0, 16)}:00${offsetText(offset)}`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}
