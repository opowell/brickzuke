console.log('Starting...')

/**
 * Make fetch calls for the client that bypass CORS restrictions.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('got message', message, sender, sendResponse)
  switch (message.responseType) {
    case 'json':
      fetch(message.url, message.options).then(async (response) => {
        console.log('response', message, response)
        const json = await response.json()
        console.log('json', json)
        sendResponse(json)
      })
      return true
      break
    case 'text':
      fetch(message.url, message.options).then(async (response) => {
        console.log('response', message, response)
        const text = await response.text()
        console.log('text', text)
        sendResponse(text)
      })
      return true
      break
    case 'scrape':
      console.log('SCRAPE', message.url)
      const url = message.url
      chrome.tabs.create(
        {
          url,
          active: false
        },
        async tab => {
          await chrome.storage.local.set({ key: 'scraperTabId', value: tab.id })
          await chrome.storage.local.set({ key: 'scraperTabOriginalUrl', value: url })
        }
      )
  }
})

async function getLocalStorage(key) {
  return await chrome.storage.local.get(key)[key]
}

chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  console.log('updated', tabId, tab.url, tab)
  if (changeInfo.status !== 'complete') return
  if (!tab.url) return

  const isScraperPage = await getLocalStorage('scraperTabId') === tabId + ''

  if (!isScraperPage) {
    return
  }
  console.log('updated', tab)
  // chrome.tabs.sendMessage(tabId, messages)
})

console.log('Starting... DONE')
