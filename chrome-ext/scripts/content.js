/**
 * Acts as an intermediary between the client and the server.
 * Forwards client requests to the server, and sends server responses back to the client.
 */
document.addEventListener('bzClientToServer', async function (event) {
  const response = await chrome.runtime.sendMessage(event.detail)
  console.log('response', response, event)
  const detail = {
    request: event.detail,
    response,
  }
  document.dispatchEvent(
    new CustomEvent('bzServerToClient', {
      // Firefox keeps an object a content script made out of the page's reach
      // until it is cloned into the page. Chrome has no `cloneInto`, and needs none.
      detail: typeof cloneInto === 'function' ? cloneInto(detail, document.defaultView) : detail,
    }),
  )
})
