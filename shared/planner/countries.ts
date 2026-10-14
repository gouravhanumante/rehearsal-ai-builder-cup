import type { WorkspaceSettings } from './model.js'

/** Currency, timezone and number format follow the country the business operates in. */
const countries: Record<string, Omit<WorkspaceSettings, 'country'> & { name: string }> = {
  IN: { name: 'India', currency: 'INR', timeZone: 'Asia/Kolkata', locale: 'en-IN' },
  US: { name: 'United States', currency: 'USD', timeZone: 'America/New_York', locale: 'en-US' },
  GB: { name: 'United Kingdom', currency: 'GBP', timeZone: 'Europe/London', locale: 'en-GB' },
  SG: { name: 'Singapore', currency: 'SGD', timeZone: 'Asia/Singapore', locale: 'en-SG' },
  JP: { name: 'Japan', currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP' },
  AE: { name: 'United Arab Emirates', currency: 'AED', timeZone: 'Asia/Dubai', locale: 'en-AE' },
}

export const supportedCountries = Object.entries(countries).map(([code, country]) => ({ code, name: country.name }))

export function settingsForCountry(code: string): WorkspaceSettings {
  const country = countries[code]
  if (!country) throw new Error(`Unsupported country: ${code}`)
  return { country: code, currency: country.currency, timeZone: country.timeZone, locale: country.locale }
}
