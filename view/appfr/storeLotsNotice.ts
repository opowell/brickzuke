/**
 * What a seller's inventory is not showing.
 *
 * The sibling of [colorItemsNotice], and for the same reason: a store that
 * runs past the page cap is stored short and stays short, because
 * `storeLotsFor` takes stored rows as the answer. Three thousand rows under a
 * header reading `3000` is indistinguishable from the whole answer, which is
 * the one thing it must not be — so the table says how far it got.
 *
 * In lots rather than pages, unlike a colour's: the store front states its
 * total lot count on the first page it answers with, so the shortfall here is
 * known exactly rather than only in pages never asked for.
 */
import { ref, watchEffect } from 'vue'
import { PARAM_ENTITY, PARAM_EXPR, parseExpression } from 'header-content-layout'
import router from '@/router'
import { readStoreScope, storeScopeVersion } from './storeLotsFetch'

/** What a `field:"…"` term names, read straight off the expression. */
function termValue(expr: string, field: string): string | undefined {
  for (const group of parseExpression(expr)) {
    for (const term of group) {
      if (term.kind === 'field' && term.field === field && term.comparator === ':') {
        return term.value
      }
    }
  }
  return undefined
}

/**
 * The caveat, or nothing at all — which is every table but this one, this one
 * whenever an item rather than a seller is what is being asked about, and this
 * one whenever the whole store is stored.
 */
export const storeLotsNotice = ref('')

watchEffect(async () => {
  // Both read before anything is awaited, so both are tracked: the route
  // changes when a store is opened, and the version when its pages land.
  const query = router.currentRoute.value.query
  void storeScopeVersion.value

  if (query[PARAM_ENTITY] !== 'inventories') {
    storeLotsNotice.value = ''
    return
  }
  const expr = String(query[PARAM_EXPR] ?? '')
  const store = termValue(expr, 'store')
  // A record names an item, and then these rows are that item's lots off its
  // own page — one request, nothing capped, nothing to say.
  if (!store || termValue(expr, 'record')) {
    storeLotsNotice.value = ''
    return
  }
  const scope = await readStoreScope(store)
  storeLotsNotice.value =
    scope && scope.lots > scope.fetchedLots
      ? `first ${scope.fetchedLots.toLocaleString()} of ${scope.lots.toLocaleString()} lots`
      : ''
})
