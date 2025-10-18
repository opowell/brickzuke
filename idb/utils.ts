export function onlyUnique<T>(value: T, index: number, array: T[]): boolean {
  return array.indexOf(value) === index
}

export function sum<T>(array: T[] = [], getValue: (x: T) => number): number {
  return array.reduce((accumulator, currentValue) => {
    return accumulator + getValue(currentValue)
  }, 0)
}

export const BOOLEAN_AS_NUMBER = {
  FALSE: 0,
  TRUE: 1,
}
