/**
 * The extension's queue, driven as the content script drives it: a message in,
 * an answer out through `sendResponse`, with `fetch` and the extension API
 * stubbed. What is asserted is what BrickLink would see — when each request
 * reaches it, and how many.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (message: object, sender: object, sendResponse: (r: unknown) => void) => boolean

let onMessage: Listener
let storage: Record<string, unknown>
let fetched: { url: string; at: number }[]
let answer: () => Response

beforeEach(async () => {
  vi.useFakeTimers({
    now: 0 
  })
  vi.resetModules()
  storage = {}
  fetched = []
  answer = () => new Response('<html>a page</html>')
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push({
      url,
      at: Date.now() 
    })
    return answer()
  })
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: (listener: Listener) => (onMessage = listener) 
      },
      getPlatformInfo: async () => ({})
    },
    storage: {
      local: {
        get: async (key: string) => ({
          [key]: storage[key] 
        }),
        set: async (values: object) => Object.assign(storage, values),
        remove: async () => {}
      }
    },
    tabs: {
      onUpdated: {
        addListener: () => {} 
      },
      create: async () => ({
        id: 1 
      }) 
    },
    scripting: {}
  })
  await import('../service-worker.js')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function ask(url: string, extra: object = {}) {
  return new Promise((resolve) => onMessage({
    type: 'text',
    url,
    options: {},
    ...extra 
  }, {}, resolve))
}

describe('the extension queue', () => {
  it('spaces requests to BrickLink by the gap, across its hosts', async () => {
    void ask('https://www.bricklink.com/a')
    void ask('https://store.bricklink.com/b')
    await vi.advanceTimersByTimeAsync(1_499)
    expect(fetched.map((f) => f.url)).toEqual(['https://www.bricklink.com/a'])
    await vi.advanceTimersByTimeAsync(1)
    expect(fetched).toEqual([
      {
        url: 'https://www.bricklink.com/a',
        at: 0 
      },
      {
        url: 'https://store.bricklink.com/b',
        at: 1_500 
      }
    ])
  })

  it('does not hold LEGO.com back for BrickLink', async () => {
    void ask('https://www.bricklink.com/a')
    void ask('https://www.lego.com/b')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetched.map((f) => f.at)).toEqual([0, 0])
  })

  it('takes the gaps the app sends, and keeps them', async () => {
    onMessage({
      type: 'fetchGaps',
      gaps: {
        'bricklink.com': 5_000 
      } 
    }, {}, () => {})
    expect(storage.fetchGaps).toEqual({
      'bricklink.com': 5_000,
      'lego.com': 2_000 
    })
    void ask('https://www.bricklink.com/a')
    void ask('https://www.bricklink.com/b')
    await vi.advanceTimersByTimeAsync(4_999)
    expect(fetched).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetched).toHaveLength(2)
  })

  it('answers a read asked twice with one request', async () => {
    void ask('https://www.bricklink.com/a')
    const first = ask('https://www.bricklink.com/b')
    const second = ask('https://www.bricklink.com/b')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fetched).toHaveLength(2)
    expect(await first).toBe('<html>a page</html>')
    expect(await second).toBe('<html>a page</html>')
  })

  it('sends a write every time, ahead of reads waiting', async () => {
    void ask('https://www.bricklink.com/a')
    void ask('https://www.bricklink.com/read')
    void ask('https://store.bricklink.com/add', {
      write: true,
      priority: 1 
    })
    void ask('https://store.bricklink.com/add', {
      write: true,
      priority: 1 
    })
    await vi.advanceTimersByTimeAsync(1_500)
    expect(fetched.map((f) => f.url)).toEqual(['https://www.bricklink.com/a', 'https://store.bricklink.com/add'])
    await vi.advanceTimersByTimeAsync(1_500)
    expect(fetched.map((f) => f.url)).toEqual([
      'https://www.bricklink.com/a',
      'https://store.bricklink.com/add',
      'https://store.bricklink.com/add'
    ])
  })

  it('pauses BrickLink when its bot check answers, and hands the check on', async () => {
    answer = () => new Response('<script>window.awsWafCookieDomainList = []</script>')
    const checked = ask('https://www.bricklink.com/a')
    void ask('https://www.bricklink.com/b')
    expect(await checked).toContain('awsWafCookieDomainList')
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetched).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetched).toHaveLength(2)
  })

  it('honours a Retry-After longer than its own pause', async () => {
    answer = () => new Response('', {
      status: 429,
      headers: {
        'Retry-After': '120' 
      } 
    })
    await ask('https://www.bricklink.com/a')
    void ask('https://www.bricklink.com/b')
    await vi.advanceTimersByTimeAsync(119_999)
    expect(fetched).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetched).toHaveLength(2)
  })

  it('answers nothing when JSON was asked for and none came', async () => {
    const answered = new Promise((resolve) =>
      onMessage({
        type: 'json',
        url: 'https://www.bricklink.com/a',
        options: {} 
      }, {}, resolve)
    )
    expect(await answered).toBeUndefined()
  })
})

describe('the copy of polite-queue in the extension', () => {
  it('is the version installed', () => {
    const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
    expect(read('../lib/polite-queue.js')).toBe(read('../../node_modules/polite-queue/dist/index.js'))
  })
})
