// import * as math from 'mathjs'
// math.divide(
//     math.bignumber(actualPrice),

import type { Sort } from '@/stores/models'
import type { TableRow } from '../../../types/table'

//   math.bignumber(cheapP)
interface Breakpoint {
  start?: number
  end?: number
  suffix?: string
  decimalPlaces?: number
  modifier?: number
}

const defaultBreakpoints = [
  {
    start: 0,
    end: 1000,
  },
  {
    end: 10000,
    suffix: 'k',
    modifier: 0.001,
    decimalPlaces: 1,
  },
  {
    end: 1000000,
    modifier: 0.001,
    suffix: 'k',
  },
  {
    suffix: 'm',
    modifier: 0.000001,
    decimalPlaces: 1,
  },
]

export function formatInteger(x?: number, breakpoints: Breakpoint[] = defaultBreakpoints) {
  if (x === undefined) {
    return
  }
  if (isNaN(x)) {
    return x
  }
  for (let i = 0; i < breakpoints.length; i++) {
    const breakpoint = breakpoints[i]
    if (breakpoint.start && x < breakpoint.start) {
      continue
    }
    if (breakpoint.end && x >= breakpoint.end) {
      continue
    }
    let val: string | number = x
    if (breakpoint.modifier) {
      val = x * breakpoint.modifier
    }
    val = val.toFixed(breakpoint.decimalPlaces || 0)
    if (breakpoint.suffix) {
      val += breakpoint.suffix
    }
    return val
  }
}

/**
 * The matches for one `begin`/`end` pair, or — when more than one pair is
 * given — the matches of each pair nested inside the matches of the one before.
 */
export type HtmlMatches = (string | HtmlMatches)[]

// The callers each know how deep their own pairs go, and read the result at
// that depth; `any` is what lets them say so without a cast at every call.
export function extractValueFromHtml(
  html: string,
  begin: string | string[],
  end: string | string[] = [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let index = 0
  if (!Array.isArray(begin)) {
    begin = [begin]
  }
  if (!Array.isArray(end)) {
    end = [end]
  }
  let matches = []
  const curBegin = begin.shift()
  const curEnd = end.shift()
  if (!curBegin) {
    return []
  }
  while (index > -1) {
    index = html.indexOf(curBegin, index)
    if (index === -1) {
      break
    }
    let endIndex = undefined
    if (curEnd) {
      endIndex = html.indexOf(curEnd, index + curBegin.length)
      if (endIndex === -1) {
        break
      }
    }
    matches.push(html.substring(index + curBegin.length, endIndex))
    if (endIndex && curEnd) {
      index = endIndex + curEnd.length
    } else {
      index = -1
    }
  }
  if (begin.length > 0) {
    matches = matches.map((m) => extractValueFromHtml(m, [...begin], [...end]))
  }
  return matches
}

export function extractValuesFromHtml(
  html: string,
  begin: string | string[],
  end: string | string[] = [],
): string[] {
  let index = 0
  if (!Array.isArray(begin)) {
    begin = [begin]
  }
  if (!Array.isArray(end)) {
    end = [end]
  }
  const matches = []
  let curBegin = begin.shift()
  let curEnd = end.shift()
  while (index > -1) {
    if (curBegin === undefined || curBegin === null) {
      break
    }
    index = html.indexOf(curBegin, index)
    if (index === -1) {
      break
    }
    let endIndex = undefined
    if (curEnd) {
      endIndex = html.indexOf(curEnd, index + curBegin.length)
      if (endIndex === -1) {
        break
      }
    }
    matches.push(html.substring(index + curBegin.length, endIndex))
    if (endIndex && curEnd) {
      index = endIndex + curEnd.length
      curBegin = begin.shift()
      curEnd = end.shift()
    } else {
      index = -1
    }
  }
  return matches
}
export async function getStorageUsage(): Promise<void> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return
  }
  const quota = await navigator.storage.estimate()
  if (!quota.usage || !quota.quota) {
    return
  }
  const percentageUsed = (quota.usage / quota.quota) * 100
  const quotaInGB = (quota.quota / 1024 / 1024 / 1024).toFixed(2)
  const usageInGB = (quota.usage / 1024 / 1024 / 1024).toFixed(2)
  const remaining = Number.parseFloat(quotaInGB) - Number.parseFloat(usageInGB)
  console.log(`Quota: ${quotaInGB} GB`)
  console.log(`Usage: ${usageInGB} GB`)
  console.log(`Usage %: ${percentageUsed}`)
  console.log(`Remaining: ${remaining} GB`)
}
export function sortItems(items: TableRow[], sorts: Sort[]) {
  if (sorts.length === 0) {
    return
  }
  items.sort((a, b) => {
    for (let i = 0; i < sorts.length; i++) {
      const sort = sorts[i]
      if (a[sort.key] === b[sort.key]) {
        continue
      }
      if (sort.dir === 'a') {
        if (a[sort.key] > b[sort.key]) {
          return 1
        } else {
          return -1
        }
      } else {
        if (a[sort.key] > b[sort.key]) {
          return -1
        } else {
          return 1
        }
      }
    }
    return 1
  })
}
