/**
 * What order a table opens in.
 *
 * `setCategories` splices each category in by `score`, which `loadCategory`
 * sets to the item count, so the original category table is a league table
 * however it is reached — biggest first, never A-to-Z. Colours open the same
 * way, on the parts count: `setColors` leaves them in the store's own order,
 * which is not an ordering a source can be asked for and is no question
 * anyone asks of a colour guide. `setItemTypes` and `setItems` leave the
 * store's order too, and those open on the name.
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

/** A-to-Z: how every type with no count worth leading on opens. */
const byName: OpeningOrder = {
  sort: 'name',
  dir: 'asc'
}

const orders: Record<string, OpeningOrder> = {
  categories: {
    sort: 'items',
    dir: 'desc'
  },
  // `items` is the field a colour row carries for the count the colour guide
  // labels Parts, which is what the column is called and what this sorts.
  colors: {
    sort: 'items',
    dir: 'desc'
  },
  /*
   * The store directory and the two cross-sections, on the same argument as
   * the categories above: each of these leads with a count, and a table whose
   * first column is a number is a league table however it is reached.
   */
  regions: {
    sort: 'countries',
    dir: 'desc'
  },
  countries: {
    sort: 'stores',
    dir: 'desc'
  },
  stores: {
    sort: 'items',
    dir: 'desc'
  },
  itemVariants: {
    sort: 'sets',
    dir: 'desc'
  },
  // Newest first, which is the one order a list of years is ever read in.
  years: {
    sort: 'year',
    dir: 'desc'
  },
  /*
   * Cheapest first. Not a league table but the question a page of lots is
   * actually asked — and this one has to be said rather than left to the
   * fallback, a lot carrying a description and a seller but no `name` at all.
   * A sort naming a field the rows do not have is not a sort.
   */
  inventories: {
    sort: 'priceValue',
    dir: 'asc'
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
 *
 * The view is here for the same reason the sort is: brickzuke draws a list of
 * one type as a table, and its home screen is the cards view of every type —
 * which is one setting only while the defaults are one set. They are a set per
 * type, so each says what it means, and a URL naming a type but no view opens
 * as a table without anyone having to rewrite it afterwards.
 *
 * Saying it here rather than in {@link openedQuery} is what makes the view
 * someone picks stick: a value that differs from the default for the type in
 * force is a value the shell writes to the URL, so `cards` over a table is a
 * query that survives being read back.
 */
export function shellDefaultsFor(entity: string | null | undefined): ShellQueryDefaults {
  return {
    landing: 'home',
    entity: 'items',
    view: entity ? 'table' : 'cards',
    ...openingOrderFor(entity)
  }
}

/**
 * The query the URL should hold, given the type that was up before it.
 *
 * Two things the shell leaves to the host, and both are about arriving. A type
 * opens in its own order, and a type opens as a table — brickzuke drawing a
 * list of one type that way — so arriving at one is where each is said. What
 * someone picks while a type is up is theirs either way: a sort, and a view
 * too, which is why `cards` over a table is left standing here rather than
 * rewritten back on the next query change. A URL that names a type and no view
 * still opens as a table, from the defaults that type is read with — see
 * {@link shellDefaultsFor}.
 *
 * Naming no type is the third case, and the one that had nowhere to land. The
 * shell's Everything is a table across every type at once, which brickzuke has
 * no source for — pressing it from inside a table left `v=table` standing with
 * no type under it, and a screen reading "Nothing matches this query" over a
 * catalogue of two hundred thousand items. brickzuke's everything is the home
 * screen, which is the cards view, so clearing the type goes there.
 *
 * The same query back when there is nothing to say, so the caller can tell a
 * rewrite from a query already as it should be.
 */
export function openedQuery(query: ShellQuery, shownEntity: string | null): ShellQuery {
  if (!query.entity) {
    return query.view === 'cards'
      ? query
      : {
          ...query,
          view: 'cards',
          page: 1
        }
  }
  const arriving = query.entity !== shownEntity
  const order = arriving ? openingOrderFor(query.entity) : undefined
  const next: ShellQuery = {
    ...query,
    view: arriving ? 'table' : query.view,
    sort: order?.sort ?? query.sort,
    dir: order?.dir ?? query.dir
  }
  return next.view === query.view && next.sort === query.sort && next.dir === query.dir
    ? query
    : next
}
