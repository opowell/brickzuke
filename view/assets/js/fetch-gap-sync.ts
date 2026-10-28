/**
 * The pacing settings, carried to the extension that does the pacing.
 *
 * The gaps are the reader's to set and are kept where every other setting is,
 * in this page's storage — see [bricklinkGapMs] — but the queue that obeys
 * them is in the extension's service worker, the one place every request
 * passes through whichever tab or fill made it. So they are sent across on
 * the way in, again whenever one changes, and again when the extension's
 * content script arrives, in case it was not yet here to hear the first.
 */
import { watch } from 'vue'
import { bricklinkGapMs, fetchGaps, legoGapMs } from '@/appfr/settings'

/** The message's type, which the response listener knows to pass over. */
export const FETCH_GAPS_MESSAGE = 'fetchGaps'

let installed = false

function push() {
  document.dispatchEvent(
    new CustomEvent('bzClientToServer', {
      detail: {
        type: FETCH_GAPS_MESSAGE,
        gaps: fetchGaps()
      }
    })
  )
}

export function installFetchGapSync() {
  if (installed) {
    return
  }
  installed = true
  document.addEventListener('bzExtensionReady', push)
  watch([bricklinkGapMs, legoGapMs], push, {
    immediate: true 
  })
}
