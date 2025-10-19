export function onlyUnique<T>(value: T, index: number, array: T[]): boolean {
  return array.indexOf(value) === index
}

export function sum<T>(array: T[] = [], getValue: (x: T) => number | undefined): number {
  return array.reduce((accumulator, currentValue) => {
    const value = getValue(currentValue)
    if (value === undefined) {
      return accumulator
    }
    return accumulator + value
  }, 0)
}

export const BOOLEAN_AS_NUMBER = {
  FALSE: 0,
  TRUE: 1,
}
