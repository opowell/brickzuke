/**
 * The sellers' lots behind a table read through them, fetched while it is up.
 *
 * The items table under `country:"AT" type:S` is the sets some Austrian seller
 * has a lot of — and brickzuke can only say which from the lots it holds, see
 * [reach]. Opened with a handful of those stored it was one set, the one whose
 * page somebody had happened to read. [reachFill] is what goes and gets more of
 * them for the narrowed home screen, and a table under the same query needs
 * exactly the same lots: so the table runs the same fill, in the same manners,
 * and reads itself again as they land.
 *
 * Only where the table is read through the lots at all — a term the type cannot
 * answer itself, see [joinedThroughLots]. `type:S` on the items table is a
 * question of the item and fetches nothing.
 *
 * And the tables that are about sellers rather than lots take the fill that
 * gets theirs — see [fillFor]: the lots table under a seller's place or a lot's
 * colour, the sellers of a region, the shipping terms of a country's sellers.
 * Each is what the table would show if every page it could be drawn from had
 * been read.
 *
 * **The re-read is whole or not at all.** The shell keeps the rows on screen
 * until a new read states some, and a scan states them as it finds them: read
 * again as it stood, every landing dropped the table to its first row found and
 * built it back up. So a read set off by a landing is held until it closes and
 * handed over in one — see [held] — and the next one waits for it: a scan that
 * outlasts the gap between landings would otherwise be cancelled by the next
 * one every time, and the table never move.
 */
import { onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { parseExpression } from 'header-content-layout'
import type { DataSource, EntitySchema, QuerySink, ShellRow } from 'header-content-layout'
import { catalogSchema } from './catalogSchema'
import { inventoryFields } from './catalogRows'
import { joinedThroughLots, namesLots } from './reach'
import { lotsLanded, startReachFill, stopReachFill } from './reachFill'
import { sellersLanded, startSellerFill, stopSellerFill } from './sellerFill'
import type { SellerFill } from './sellerFill'
import { catalogLanded, startCatalogFill, stopCatalogFill } from './catalogFill'
import type { CatalogFill } from './catalogFill'
import { backgroundTurn } from './yieldToInput'

/**
 * How long lots are left to gather before the table reads them. A seller's
 * page lands every glance or so; a read of the items table is a pass over the
 * whole catalogue, and one per page would be most of what the screen did.
 */
const SETTLE_MS = 3_000

/**
 * How long a held read keeps its rows to itself before saying them anyway. A
 * table whose own fetch runs for minutes — a seller's inventory, page after
 * page — would otherwise say nothing new until it was done.
 */
const HOLD_MS = 10_000

/**
 * Runs the fill for the table the URL names, and hands back what the table's
 * source is made through: the source as it stands, or — once lots have landed
 * — one whose next read goes to the shell whole.
 *
 * `entityKey` is null on the home screen, which runs the fill itself; see
 * [HomeCards]. Watched after the render, so the home screen's own stop on the
 * way out has been made before this starts the table's.
 */
export function useTableReach(entityKey: Ref<string | null>, expr: Ref<string>) {
  const revision = ref(0)
  let seen = 0
  let onTable = false
  /** Lots have landed since the table last read. */
  let stale = false
  /** A held read is in flight. */
  let reading = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function settle() {
    if (timer || reading || !stale || !onTable) {
      return
    }
    timer = setTimeout(async () => {
      timer = undefined
      await backgroundTurn()
      if (!onTable || reading || !stale) {
        return
      }
      stale = false
      revision.value++
    }, SETTLE_MS)
  }

  function leave() {
    onTable = false
    stale = false
    clearTimeout(timer)
    timer = undefined
  }

  watch(
    [entityKey, expr],
    ([key, asked]) => {
      if (!key) {
        // The home screen, which runs its own fill of the lots — and fills the
        // directory itself, see [homeFill].
        leave()
        stopSellerFill()
        stopCatalogFill()
        return
      }
      const entity = catalogSchema.value.entities.find((type) => type.key === key)
      const kind = fillFor(key, asked, entity)
      // One fill at a time, whichever it is: they share one queue of requests.
      if (kind !== 'lots') {
        stopReachFill()
      }
      if (kind !== 'directory' && kind !== 'policies') {
        stopSellerFill()
      }
      if (kind !== 'lines' && kind !== 'pictures') {
        stopCatalogFill()
      }
      if (!kind) {
        // A table with nothing more to fetch is no reason to be fetching —
        // whichever screen set the run off.
        leave()
        return
      }
      onTable = true
      stale = false
      if (kind === 'lots') {
        // The whole of it, where the home screen stops once its cards settle:
        // a table's rows are every seller's lots — see [startReachFill].
        startReachFill(asked, true)
      } else if (kind === 'directory' || kind === 'policies') {
        startSellerFill(kind, asked)
      } else {
        startCatalogFill(kind, asked)
      }
    },
    {
      immediate: true,
      flush: 'post'
    }
  )

  watch([lotsLanded, sellersLanded, catalogLanded], () => {
    if (onTable) {
      stale = true
      settle()
    }
  })

  onUnmounted(() => {
    if (onTable) {
      stopReachFill()
    }
    stopSellerFill()
    stopCatalogFill()
    leave()
  })

  /**
   * The source to hand the shell. Reading `revision` is what makes a computed
   * over this hand it a new one when lots land, and only the first read of that
   * one is held: a page turned or a query changed after it is somebody asking,
   * and is shown as it comes.
   */
  function sourceFor(base: DataSource): DataSource {
    const landed = revision.value !== seen
    seen = revision.value
    const stream = base.stream
    if (!landed || !stream) {
      return base
    }
    let first = true
    return {
      ...base,
      stream(request, sink) {
        if (!first) {
          return stream.call(base, request, sink)
        }
        first = false
        reading = true
        const done = () => {
          if (reading) {
            reading = false
            settle()
          }
        }
        const cancel = stream.call(base, request, held(sink, done))
        return () => {
          done()
          cancel?.()
        }
      }
    }
  }

  return {
    revision,
    sourceFor
  }
}

/**
 * A sink that keeps what it is told until the read is over, and then says it
 * once — or, past [HOLD_MS], starts saying it as it comes. `done` is told when
 * it stops holding either way.
 */
export function held(sink: QuerySink, done: () => void, holdMs = HOLD_MS): QuerySink {
  let rows: ShellRow[] | undefined
  let total: number | undefined
  let holding = true
  const release = () => {
    if (!holding) {
      return
    }
    holding = false
    clearTimeout(timer)
    if (rows || total !== undefined) {
      sink.set({
        rows,
        total
      })
    }
    done()
  }
  const timer = setTimeout(release, holdMs)
  return {
    get open() {
      return sink.open
    },
    insert(found, at) {
      if (!holding) {
        sink.insert(found, at)
        return
      }
      const added = Array.isArray(found) ? found : [found]
      const page = [...(rows ?? [])]
      page.splice(at ?? page.length, 0, ...added)
      rows = page
      total = (total ?? 0) + added.length
    },
    set(update) {
      if (!holding) {
        sink.set(update)
        return
      }
      if (update.rows) {
        rows = update.rows
        total = update.rows.length
      }
      if (update.total !== undefined) {
        total = update.total
      }
    },
    close() {
      if (holding && !rows && total === undefined) {
        // Closed having found nothing: the table is empty now, which the rows
        // still on screen from the last read would contradict.
        rows = []
        total = 0
      }
      release()
      sink.close()
    },
    fail(error) {
      holding = false
      clearTimeout(timer)
      sink.fail(error)
      done()
    }
  }
}

/**
 * Which fill a table under this query needs, if any.
 *
 * - `lots`: a table read through the sellers' lots — see [joinedThroughLots] —
 *   and the lots table itself under anything but the one item or seller it
 *   fetches for on its own: `country:"AT"` there is every Austrian seller's.
 * - `directory`: the sellers or their provinces, anywhere wider than the one
 *   country the table fetches for on its own.
 * - `policies`: the shipping terms of every seller in scope, wherever the
 *   query names no one seller.
 *
 * - `lines`: the lines of sets' inventories — a named item's own pages, and
 *   otherwise every inventory not yet stored. See [catalogFill].
 * - `pictures`: every item's pictures, short of the one item the images table
 *   fetches for on its own.
 *
 * Un-narrowed, the lots table is every lot on BrickLink and the images every
 * item's pictures: fills of days rather than minutes, run at the same polite
 * pace for as long as the table is up.
 */
export function fillFor(
  key: string,
  expr: string,
  entity?: EntitySchema
): 'lots' | SellerFill | CatalogFill | undefined {
  const named = namedFields(expr)
  // First, though they are read through the lots as well: a seller's terms
  // are rows only once they are fetched, and the lots fill fetches none.
  if (key === 'shippingMethods' || key === 'shippingCosts') {
    return named.has('store') ? undefined : 'policies'
  }
  if (joinedThroughLots(key, expr, [], entity, CARRIED[key])) {
    return 'lots'
  }
  if (key === 'inventories') {
    return namesLots(expr) ? undefined : 'lots'
  }
  if (key === 'stores' || key === 'provinces') {
    return named.has('country') ? undefined : 'directory'
  }
  if (key === 'itemInventories' || key === 'itemVariants') {
    return 'lines'
  }
  if (key === 'images') {
    return namesLots(expr) ? undefined : 'pictures'
  }
  return undefined
}

/**
 * The fields a type's rows carry without drawing a column of. Asked without
 * the rows in hand, the schema alone made `region:"Europe"` a question for the
 * lots on the sellers table, and `part:` one on the item inventories.
 *
 * A line's are read off the one function that makes them, handed a line with
 * nothing in it, so the two cannot drift apart; a variant carries the same.
 * The rest mirror `toStoreRow` and `toImageRow` in the source.
 */
const LINE_FIELDS = Object.keys(
  inventoryFields({
    id: '',
    record: '',
    quantity: 0,
    itemVariant: {
      itemType: '',
      itemId: '',
      name: '',
      thumbnail: '',
      catType: '',
      catString: '',
      variantId: '',
      categoryName: ''
    }
  })
)
const CARRIED: Record<string, readonly string[]> = {
  stores: ['country', 'region', 'province'],
  provinces: ['country', 'region', 'province'],
  itemInventories: LINE_FIELDS,
  itemVariants: LINE_FIELDS,
  images: ['record', 'type', 'itemId', 'name', 'category', 'categoryName', 'year']
}

/** The fields a query asks for a value of — `country:"AT"` — rather than rules out. */
function namedFields(expr: string): Set<string> {
  const named = new Set<string>()
  for (const group of parseExpression(expr)) {
    for (const term of group) {
      if (term.kind === 'field' && term.comparator === ':' && !term.negated) {
        named.add(term.field)
      }
    }
  }
  return named
}
