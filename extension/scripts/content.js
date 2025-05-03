;(async () => {
  document.addEventListener('bzClientToServer', async function (e) {
    console.log('content script', e.detail)
    const response = await chrome.runtime.sendMessage(e.detail)
    document.dispatchEvent(
      new CustomEvent('bzServerToClient', {
        detail: {
          request: e.detail,
          response,
        },
      }),
    )
  })
})()
