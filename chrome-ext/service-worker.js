console.log('Starting...')

const sendResponses = {}

/**
 * Make fetch calls for the client that bypass CORS restrictions.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('got message', message, sender, sendResponse)
  switch (message.type) {
    case 'json':
      fetch(message.url, message.options).then(async (response) => {
        console.log('response', message, response)
        const json = await response.json()
        console.log('json', json)
        sendResponse(json)
      })
      return true
    case 'text':
      fetch(message.url, message.options).then(async (response) => {
        console.log('response', message, response)
        const text = await response.text()
        console.log('text', text)
        sendResponse(text)
      })
      return true
    case 'scrape':
      handleScrapeRequest(message, sendResponse)
      return true
    default:
      console.warn('Unknown message type', message, message.type)
      return false
  }
})

async function handleScrapeRequest(message, sendResponse) {
  const url = message.url
  const tab = await chrome.tabs.create(
    {
      url,
      active: false
    }
  )
  sendResponses[tab.id] = sendResponse
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
  await chrome.storage.local.remove('scraperTabId')
  await chrome.storage.local.remove('scraperTabOriginalUrl')
  console.log('sent response and cleaned up')
})

console.log('Starting... DONE')
