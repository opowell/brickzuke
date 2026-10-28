import { PoliteQueue, hostOf, retryAfterMs } from './lib/polite-queue.js'

console.log('Starting...')

const sendResponses = {}

/**
 * The gap the app asks for between one request to a site and the next, in
 * milliseconds — see `fetchGaps` in the app's settings, which pushes them here
 * as they change. Kept in extension storage as well, so a request made before
 * the app has said anything is still paced as it last asked.
 */
const DEFAULT_GAPS = {
  'bricklink.com': 1_500,
  'lego.com': 2_000,
}
let gaps = { ...DEFAULT_GAPS }

/**
 * The first pause after BrickLink's bot check, a 429 or a 503 — doubled for
 * each one after it until a real answer, up to ten minutes. The same thirty
 * seconds the app waits before asking again (`BOT_CHECK_BACKOFF_MS`).
 */
const BACKOFF_MS = 30_000
const MAX_BACKOFF_MS = 10 * 60_000

/**
 * Every request the app makes waits its turn here: one at a time to a site,
 * a gap after each with a third of it again at random so they do not land on
 * a beat, and a pause when the site pushes back. Cached answers never reach
 * the extension, so only real requests are paced.
 */
const queue = new PoliteQueue({
  policy: (site) => {
    const gap = gaps[site] ?? DEFAULT_GAPS[site] ?? 1_000
    return {
      maxActive: 1,
      minGapMs: gap,
      jitterMs: Math.round(gap / 3),
      backoffMs: BACKOFF_MS,
      maxBackoffMs: MAX_BACKOFF_MS,
    }
  },
})

chrome.storage.local.get('fetchGaps').then(({ fetchGaps }) => {
  if (fetchGaps) {
    gaps = { ...DEFAULT_GAPS, ...fetchGaps }
    queue.configure({})
  }
})

/**
 * The site a URL belongs to, which is what is paced: www., store. and v2.
 * are all BrickLink, behind one firewall that counts them together.
 */
function siteOf(url) {
  return hostOf(url).split('.').slice(-2).join('.')
}

/**
 * Whether the site answered with something other than the page: too many
 * requests, unavailable, or BrickLink's bot check — the script its firewall
 * sends in place of a page, or the bare 202 it answers with when it will not
 * answer at all. The app tells the same check apart with `isChallenge`.
 */
function pushedBack(response, text) {
  if (response.status === 429 || response.status === 503) {
    return true
  }
  if (response.status === 202 && text === '') {
    return true
  }
  return text.length < 20_000 && (text.includes('awsWafCookieDomainList') || text.includes('gokuProps'))
}

/**
 * A service worker with nothing to do is stopped after half a minute, and a
 * stopped worker forgets its queue. Asking the extension API anything counts
 * as something to do, so while requests are waiting it asks.
 */
let keepAlive
function stayAwake() {
  if (keepAlive) {
    return
  }
  keepAlive = setInterval(() => {
    if (queue.pending() === 0) {
      clearInterval(keepAlive)
      keepAlive = undefined
      return
    }
    chrome.runtime.getPlatformInfo()
  }, 20_000)
}

/**
 * The same read asked for while one is still waiting or running is answered
 * by that one, rather than sent again: a fill that gives up on a request
 * stuck behind a pause asks again, and the site should not be asked twice.
 * A write — `write` set by the app's `sendOnce` — is always its own.
 */
const waitingFor = new Map()

async function fetchPolitely(message, sendResponse) {
  const key = message.write ? undefined : [message.type, message.url, message.options?.body ?? ''].join('#')
  if (key !== undefined) {
    const waiting = waitingFor.get(key)
    if (waiting) {
      waiting.push(sendResponse)
      return
    }
    waitingFor.set(key, [sendResponse])
  }
  const site = siteOf(message.url)
  let answer
  try {
    stayAwake()
    answer = await queue.run(
      site,
      async () => {
        const response = await fetch(message.url, message.options)
        const text = await response.text()
        // Inside the turn, so the pause is in force before the next request can start.
        if (pushedBack(response, text)) {
          const ms = queue.backoff(site, retryAfterMs(response.headers.get('Retry-After')))
          console.warn('pushed back by', site, response.status, '— pausing for', ms, 'ms')
        } else {
          queue.succeed(site)
        }
        if (message.type !== 'json') {
          return text
        }
        try {
          return JSON.parse(text)
        } catch {
          // Not JSON — a sign-in page, say. The app reads no answer as a failure.
          return undefined
        }
      },
      { priority: message.priority ?? 0 },
    )
  } catch (e) {
    console.warn('fetch failed', message.url, e)
  }
  const callers = key === undefined ? [sendResponse] : waitingFor.get(key)
  waitingFor.delete(key)
  for (const respond of callers) {
    respond(answer)
  }
}

/**
 * Make fetch calls for the client that bypass CORS restrictions.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('got message', message, sender, sendResponse)
  switch (message.type) {
    case 'json':
    case 'text':
      fetchPolitely(message, sendResponse)
      return true
    case 'scrape':
      handleScrapeRequest(message, sendResponse)
      return true
    case 'fetchGaps':
      gaps = { ...DEFAULT_GAPS, ...message.gaps }
      chrome.storage.local.set({ fetchGaps: gaps })
      queue.configure({})
      sendResponse(true)
      return false
    default:
      console.warn('Unknown message type', message, message.type)
      return false
  }
})

const releases = {}

async function handleScrapeRequest(message, sendResponse) {
  const url = message.url
  stayAwake()
  // The tab's load is the request, so the turn lasts until it is read.
  const release = await queue.acquire(siteOf(url), { priority: message.priority ?? 0 })
  const tab = await chrome.tabs.create(
    {
      url,
      active: false
    }
  )
  sendResponses[tab.id] = sendResponse
  releases[tab.id] = release
  // A tab that never finishes loading would hold the site's turn for good.
  setTimeout(() => {
    releases[tab.id]?.()
    delete releases[tab.id]
  }, 60_000)
  console.log('SCRAPE', message.url, tab, tab.id)
  await chrome.storage.local.set({
    scraperTabId: tab.id
  })
  await chrome.storage.local.set({
    scraperTabOriginalUrl: url
  })
  console.log('set tab id', tab.id, await chrome.storage.local.get())
}

async function getLocalStorage(key) {
  return (await chrome.storage.local.get(key))[key]
}

function parseColorsPage() {
  const elements = Array.from(document.querySelectorAll('.color-list-wide-viewport_hideMobileViewport__5OSVt tbody tr'))
  const objects = elements.map(row => {
    const child1 = row.children[1]
    const timelineParts = child1.children[2].innerText.replace('Timeline: ', '').split('–')
    return {
      colorCode: window.getComputedStyle(row.children[0]).getPropertyValue('--bl-castor-table-swatch-with-image-background-color'),
      colorName: child1.children[0].innerText,
      legoColorName: child1.children[1].innerText.replace('LEGO Color: ', '').split(' - ')[0],
      legoColorId: child1.children[1].innerText.split(' - ')[1],
      timeLine: {
        start: timelineParts[0],
        end: timelineParts[1],
      },
      partsCount: Number.parseInt(row.children[2].innerText.replaceAll(',', '')),
      setsCount: Number.parseInt(row.children[3].innerText.replaceAll(',', '')),
      wantedCount: Number.parseInt(row.children[4].innerText.replaceAll(',', '')),
      forSaleCount: Number.parseInt(row.children[5].innerText.replaceAll(',', '')),
      image: row.querySelector('img')?.src,
      colorId: row.children[7].innerText,
    }
  })
  console.log(elements, objects)
  return objects
}
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return
  if (!tab.url) return
  console.log('updated', tabId, tab.url, tab, await getLocalStorage('scraperTabId'))

  const isScraperPage = (await getLocalStorage('scraperTabId')) === tabId

  console.log(await getLocalStorage('scraperTabId'), tabId, isScraperPage)
  if (!isScraperPage) {
    return
  }
  const execute = await chrome.scripting.executeScript(
    {
      target: {
        tabId
      },
      func: parseColorsPage
    }
  )
  console.log('execute', execute[0].result, tabId, sendResponses[tabId])
  sendResponses[tabId](execute[0].result)
  delete sendResponses[tabId]
  releases[tabId]?.()
  delete releases[tabId]
  await chrome.storage.local.remove('scraperTabId')
  await chrome.storage.local.remove('scraperTabOriginalUrl')
  console.log('sent response and cleaned up')
})

console.log('Starting... DONE')
