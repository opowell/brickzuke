export function formatInteger(x: number | undefined) {
  if (x === undefined) {
    return
  }
  if (x < 1000) {
    return x
  }
  if (x < 10000) {
    return (x / 1000).toFixed(1) + 'k'
  }
  if (x < 1000000) {
    return (x / 1000).toFixed(0) + 'k'
  }
  return (x / 1000000).toFixed(1) + 'm'
}

export function extractValueFromHtml(
  html: string,
  begin: string | string[],
  end: string | string[] = [],
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
): any {
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
export async function getStorageUsage() {
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
