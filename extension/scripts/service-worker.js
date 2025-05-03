chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  fetch(message.url, message.options).then(async (response) => {
    switch (message.type) {
      case 'json':
        const json = await response.json()
        sendResponse(json)
        break
      case 'text':
        const text = await response.text()
        sendResponse(text)
        break
    }
  })
  return true
})