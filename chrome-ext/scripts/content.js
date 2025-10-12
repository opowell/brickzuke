console.log('Starting...')
/**
 * Acts as an intermediary between the client and the server.
 * Forwards client requests to the server, and sends server responses back to the client.
 */
document.addEventListener('bzClientToServer', async function (event) {
  const response = await chrome.runtime.sendMessage(event.detail)
  // console.log('response', response)
  document.dispatchEvent(
    new CustomEvent('bzServerToClient', {
      detail: {
        request: event.detail,
        response,
      },
    }),
  )
})
console.log('Starting... DONE')
