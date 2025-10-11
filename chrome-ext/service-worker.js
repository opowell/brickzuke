console.log('background')

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('got message', message, sender, sendResponse)
})
