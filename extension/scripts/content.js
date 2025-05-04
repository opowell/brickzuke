;(async () => {
  document.addEventListener('bzClientToServer', async function (e) {
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
