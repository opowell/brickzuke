/**
 * Saying how much of a colour is on screen.
 *
 * A colour past the page cap is stored short and read back short for ever, so
 * a thousand rows under a header reading `1000` would claim to be a whole
 * answer. These pin when the caveat appears and — just as important — when it
 * does not, a caveat on a complete list being its own kind of wrong.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'
import { nextTick } from 'vue'
import { PARAM_ENTITY, PARAM_EXPR } from 'header-content-layout'
import router from '@/router'
import { colorItemsNotice } from '../colorItemsNotice'
import { put } from '../../../idb/db'
import { getDbConnection } from '../../../idb/idb'
import STORES from '../../../idb/stores'
import type { StoredColorScope } from '../../stores/bricklink/catalog-list-color-page'

beforeAll(async () => {
  const db = await getDbConnection()
  // Tan: fourteen thousand parts, stopped at the cap.
  await put<StoredColorScope>(db, STORES.COLOR_SCOPES, {
    scope: 'P-2',
    pages: 287,
    fetchedPages: 20
  })
  // Aqua: eighty-two parts, fetched whole.
  await put<StoredColorScope>(db, STORES.COLOR_SCOPES, {
    scope: 'P-41',
    pages: 2,
    fetchedPages: 2
  })
  db.close()
})

/** Puts the app where a press would, and lets the watcher catch up. */
async function open(query: Record<string, string>) {
  await router.replace({
    path: '/',
    query
  })
  // The notice is written by an async watcher, so a tick is not enough: it
  // reads IndexedDB before it can say anything.
  for (let i = 0; i < 20; i++) {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('the partial-colour caveat', () => {
  it('says how far a capped colour got', async () => {
    await open({
      [PARAM_ENTITY]: 'colorItems',
      [PARAM_EXPR]: 'colorid:"2" type:"P"'
    })
    expect(colorItemsNotice.value).toBe('first 20 of 287 pages')
  })

  it('says nothing about a colour fetched whole', async () => {
    await open({
      [PARAM_ENTITY]: 'colorItems',
      [PARAM_EXPR]: 'colorid:"41" type:"P"'
    })
    expect(colorItemsNotice.value).toBe('')
  })

  // Rows stored before any of this was recorded are cleared by the version
  // upgrade, so an unknown colour is one nobody has opened — not a partial one.
  it('says nothing about a colour with nothing recorded', async () => {
    await open({
      [PARAM_ENTITY]: 'colorItems',
      [PARAM_EXPR]: 'colorid:"9999" type:"P"'
    })
    expect(colorItemsNotice.value).toBe('')
  })

  it('says nothing on every other table', async () => {
    await open({
      [PARAM_ENTITY]: 'colors'
    })
    expect(colorItemsNotice.value).toBe('')
  })

  it('reads the parts and the sets of one colour apart', async () => {
    // `P-2` is capped; `S-2` was never fetched, and must not inherit its caveat.
    await open({
      [PARAM_ENTITY]: 'colorItems',
      [PARAM_EXPR]: 'colorid:"2" type:"S"'
    })
    expect(colorItemsNotice.value).toBe('')
  })
})
