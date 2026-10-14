/** Reads comma, semicolon or tab separated text, including quoted cells with line breaks. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = [',', ';', '\t'].map((candidate) => ({ candidate, count: firstLine.split(candidate).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]
  const separator = delimiter && delimiter.count > 0 ? delimiter.candidate : ','

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const endCell = () => { row.push(cell); cell = '' }
  const endRow = () => { endCell(); rows.push(row); row = [] }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell === '') quoted = true
    else if (char === separator) endCell()
    else if (char === '\n') endRow()
    else if (char === '\r') { if (text[index + 1] !== '\n') endRow() }
    else cell += char
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}
