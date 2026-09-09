/**
 * What a colour's list is not showing.
 *
 * A colour arrives a page at a time, so for as long as [pageFill] is working
 * through Tan's two hundred and eighty-seven of them the table is holding part
 * of an answer. A thousand rows under a header reading `1000` is
 * indistinguishable from the whole of one, which is the one thing they must
 * not be — so the table says how far it has got, and the figure climbs as the
 * pages land. It goes away once the two numbers meet, and stands where it is
 * when a run ended early: the table was left, or nothing answered.
 *
 * In pages rather than items, because pages are what is actually known:
 * BrickLink states how many pages a list runs to, and the items on the ones
 * never fetched were never counted.
 */
import { ref, watchEffect } from 'vue'
import { PARAM_ENTITY, PARAM_EXPR, parseExpression } from 'header-content-layout'
import router from '@/router'
import { colorScope } from '../stores/bricklink/catalog-list-color-page'
import { colorScopeVersion, readColorScope } from './colorItemsFetch'

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
 * The caveat, or nothing at all — which is every table but this one, and this
 * one whenever the whole colour is stored.
 */
export const colorItemsNotice = ref('')

watchEffect(async () => {
  // Both read before anything is awaited, so both are tracked: the route
  // changes when a colour is opened, and the version when its pages land.
  const query = router.currentRoute.value.query
  void colorScopeVersion.value

  if (query[PARAM_ENTITY] !== 'colorItems') {
    colorItemsNotice.value = ''
    return
  }
  const expr = String(query[PARAM_EXPR] ?? '')
  const colorId = termValue(expr, 'colorid')
  if (!colorId) {
    colorItemsNotice.value = ''
    return
  }
  const scope = await readColorScope(colorScope(termValue(expr, 'type') ?? 'P', colorId))
  colorItemsNotice.value =
    scope && scope.pages > scope.fetchedPages
      ? `first ${scope.fetchedPages} of ${scope.pages} pages`
      : ''
})
