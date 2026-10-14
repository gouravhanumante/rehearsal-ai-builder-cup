/** A plain email address and nothing else, so a contact like "a@b.com?bcc=x@y.com" never becomes a link. */
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export function emailOf(contact: string | null | undefined) {
  const text = contact?.trim() ?? ''
  return EMAIL.test(text) ? text : null
}

export function mailtoLink(addresses: string[], subject: string, body: string) {
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  // Several suppliers go in BCC so they don't see each other.
  return addresses.length === 1 ? `mailto:${addresses[0]}?${query}` : `mailto:?bcc=${addresses.join(',')}&${query}`
}

export type AskItem = { what: string; to: string; by: string; unit: string }

/** One message per supplier, listing everything still missing that they can supply. */
export function askMessage(request: { greeting: string; items: AskItem[]; from: string }) {
  const { items } = request
  const units = new Set(items.map((item) => item.unit))
  const priceUnit = units.size === 1 ? items[0].unit : 'unit'
  const line = (item: AskItem) => `${item.what} to ${item.to} by ${item.by}`
  return [
    `${request.greeting},`,
    '',
    ...(items.length === 1
      ? [`Can you deliver ${line(items[0])}?`, `Please reply with how many you can send, your price per ${priceUnit}, and when they would arrive.`]
      : ['Can you deliver:', ...items.map((item) => `- ${line(item)}`), `Please reply for each with how many you can send, your price per ${priceUnit}, and when they would arrive.`]),
    '',
    'Thanks,',
    request.from,
  ].join('\n')
}
