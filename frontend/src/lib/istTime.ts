const timeZone = 'Asia/Kolkata'

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone })
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
}

export function formatDateTime(iso: string) {
  return `${formatDay(iso)}, ${formatTime(iso)}`
}

/** ISO instant -> value for <input type="datetime-local">, read as India time. */
export function toIstInput(iso: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** <input type="datetime-local"> value, meant as India time -> ISO string with offset. */
export function fromIstInput(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  const iso = `${local}:00+05:30`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}
