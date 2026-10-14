import type { WorkspaceSettings } from '../../../shared/planner/model'
import { localToIso } from '../../../shared/planner/time'

/** Formats numbers, money and times the way the workspace's country expects. */
export function createFormat(settings: WorkspaceSettings) {
  const { locale, timeZone, currency } = settings
  const moneyFormat = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 })
  const wholeMoneyFormat = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const currencySymbol = moneyFormat.formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency

  return {
    settings,
    currencySymbol,
    money: (amount: number) => (Number.isInteger(amount) ? wholeMoneyFormat : moneyFormat).format(amount),
    number: (value: number) => new Intl.NumberFormat(locale).format(value),
    day: (iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone }),
    time: (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone }),
    dateTime: (iso: string) => `${new Date(iso).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone })}, ${new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone })}`,

    /** ISO instant -> value for <input type="datetime-local">, in the workspace timezone. */
    toInput(iso: string) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]))
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
    },

    /** <input type="datetime-local"> value, meant as workspace local time -> ISO string with that day's offset. */
    fromInput: (local: string) => localToIso(local, timeZone),
  }
}

export type Format = ReturnType<typeof createFormat>
