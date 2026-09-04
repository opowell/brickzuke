/**
 * What order a table opens in, the way the original opens it.
 *
 * `setCategories` splices each category in by `score`, which `loadCategory`
 * sets to the item count, so the original category table is a league table
 * however it is reached — biggest first, never A-to-Z. `setColors`,
 * `setItemTypes` and `setItems` impose no order at all: they show the store's
 * own, which is not an ordering a source can be asked for, so those open on
 * the name instead.
 *
 * The shell has one sort for the whole query and no per-type direction. It
 * carries whichever sort is up across a change of type where the new type
 * offers that sort, and falls back to the type's first declared sort where it
 * does not — neither of which is "how this table opens". So the host says it:
 * ItemsShell applies this on arrival, and hands the shell the same answer as
 * the fallback for a URL that names no sort.
 */
import type { ShellQuery, ShellQueryDefaults, SortDirection } from 'header-content-layout'

export interface OpeningOrder {
  sort: string
  dir: SortDirection
}

/** A-to-Z: how every type the original leaves in store order opens. */
const byName: OpeningOrder = {
  sort: 'name',
  dir: 'asc'
}

const orders: Record<string, OpeningOrder> = {
  categories: {
    sort: 'items',
    dir: 'desc'
  }
}

/** How the named type opens — the home screen included, which is by name. */
export function openingOrderFor(entity: string | null | undefined): OpeningOrder {
  return (entity && orders[entity]) || byName
}

/**
 * The shell's query defaults while that type is the one in the URL. `landing`
 * and `entity` are brickzuke's own: the empty URL is the home screen, and the
 * type the query panel configures from there is the items table.
 */
export function shellDefaultsFor(entity: string | null | undefined): ShellQueryDefaults {
  return {
    landing: 'home',
    entity: 'items',
    ...openingOrderFor(entity)
  }
}

/**
 * The query the URL should hold, given the type that was up before it.
 *
 * Two things the shell leaves to the host. A type opens in its own order, and
 * arriving at one is where that is said — the sort someone picks while a type
 * is up is theirs, and only arriving somewhere new sets one. And brickzuke
 * draws a list as a table: that cannot go in `defaults`, because the home
 * screen *is* the `cards` view with no type selected, so one setting would
 * serve as both the landing view and the list view and pinning it to `table`
 * would cost the summary.
 *
 * The same query back when there is nothing to say, so the caller can tell a
 * rewrite from a query already as it should be.
 */
export function openedQuery(query: ShellQuery, shownEntity: string | null): ShellQuery {
  if (!query.entity) {
    return query
  }
  const order = query.entity === shownEntity ? undefined : openingOrderFor(query.entity)
  const next: ShellQuery = {
    ...query,
    view: 'table',
    sort: order?.sort ?? query.sort,
    dir: order?.dir ?? query.dir
  }
  return next.view === query.view && next.sort === query.sort && next.dir === query.dir
    ? query
    : next
}
