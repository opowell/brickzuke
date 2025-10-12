console.log('background')

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('got message', message, sender, sendResponse)
  fetch(message.url, message.options).then(async (response) => {
    console.log('response', response)
    switch (message.responseType) {
      case 'json':
        const json = await response.json()
        console.log('json', json)
        sendResponse(json)
        break
      case 'text':
        const text = await response.text()
        console.log('text', text)
        sendResponse(text)
        break
    }
  })
  return true
})
