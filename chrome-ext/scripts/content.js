console.log('content script')

document.addEventListener('bzClientToServer', async function (event) {
  const response = await chrome.runtime.sendMessage(event.detail)
  console.log('response', response)
  document.dispatchEvent(
    new CustomEvent('bzServerToClient', {
      detail: {
        request: event.detail,
        response,
      },
    }),
  )
})
