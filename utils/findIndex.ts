export function findIndex<T extends { score: number }>(array: T[], itemToAdd: T): number {
  let low = 0,
    high = array.length;

  while (low < high) {
    const mid = low + high >>> 1
    if (array[mid].score > itemToAdd.score) low = mid + 1
    else high = mid
  }
  return low
}

