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

export function askMessage(request: { greeting: string; what: string; to: string; by: string; unit: string; from: string }) {
  return [
    `${request.greeting},`,
    '',
    `Can you deliver ${request.what} to ${request.to} by ${request.by}?`,
    `Please reply with how many you can send, your price per ${request.unit}, and when they would arrive.`,
    '',
    'Thanks,',
    request.from,
  ].join('\n')
}
