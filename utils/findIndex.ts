export function findIndex<T extends { score?: number }>(array: T[], itemToAdd: T): number {
  const score = itemToAdd.score
  if (score === undefined) {
    return array.length
  }
  let low = 0,
    high = array.length

  while (low < high) {
    const mid = low + high >>> 1
    if ((array[mid].score ?? 0) > score) low = mid + 1
    else high = mid
  }
  return low
}

