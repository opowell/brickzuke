/**
 * BrickLink asking this browser to prove it is a person.
 *
 * Its AWS firewall now and then answers the extension's fetches with a script
 * that sets a cookie and reloads — see [isChallenge]. The extension cannot run
 * it, and brickzuke does not try to get round it: the check is BrickLink's to
 * make, and the answer to it is somebody opening a BrickLink page in this
 * browser, which runs the script and sets the cookie for every fetch after.
 *
 * So what this holds is the fact, for two readers. The screen says so, with
 * the page to open — see [ItemsShell]. And a fill that runs into it pauses
 * rather than counting seller after seller as a failure: it waits, asks again
 * once in a long while, and carries on from where it was once an answer comes
 * back — see [throughBotCheck]. A real answer clears it.
 */
import { ref } from 'vue'

export interface BotCheck {
  /** The page that was answered with the check — the one worth opening. */
  url: string
  at: number
}

export const botCheck = ref<BotCheck | undefined>(undefined)

/**
 * How long a fill waits before asking again. Long, because every ask while
 * the check stands is another request the firewall counts against us.
 */
export const BOT_CHECK_BACKOFF_MS = 30_000

/** Said by a wait that gave up because the answer was the check. */
export const BOT_CHECK_MESSAGE =
  'BrickLink asked this browser to prove it is a person. Open any BrickLink page in this browser, and fetching carries on.'

export function noteBotCheck(url: string): void {
  botCheck.value = {
    url,
    at: Date.now()
  }
}

export function noteAnswer(): void {
  if (botCheck.value) {
    botCheck.value = undefined
  }
}

/** Whether the check came back since `since` — a wait's cue to stop waiting. */
export function checkedSince(since: number): boolean {
  return botCheck.value !== undefined && botCheck.value.at >= since
}

/**
 * Asks, and while the answer is the check, waits and asks again — for as long
 * as `live` says somebody still wants the answer. Any other failure is thrown
 * as it was.
 */
export async function throughBotCheck<T>(
  ask: () => Promise<T>,
  live: () => boolean,
  backoffMs = BOT_CHECK_BACKOFF_MS
): Promise<T> {
  for (;;) {
    try {
      return await ask()
    } catch (thrown) {
      if (!botCheck.value || !live()) {
        throw thrown
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
      if (!live()) {
        throw thrown
      }
    }
  }
}
