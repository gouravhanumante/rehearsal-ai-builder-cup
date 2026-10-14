export const PAGE_SIZE = 25

/** One page of the items whose name matches the search. A page past the end falls back to the last page that has results. */
export function searchPage<T>(items: T[], nameOf: (item: T) => string, query: string, page: number, size = PAGE_SIZE) {
  const needle = query.trim().toLowerCase()
  const matches = needle ? items.filter((item) => nameOf(item).toLowerCase().includes(needle)) : items
  const pageCount = Math.max(1, Math.ceil(matches.length / size))
  const current = Math.min(Math.max(page, 0), pageCount - 1)
  return { items: matches.slice(current * size, (current + 1) * size), page: current, pageCount, total: matches.length }
}
