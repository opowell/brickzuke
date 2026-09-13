/**
 * Buying what is on a shopping list: which seller has each part, and what the
 * list costs from each of them.
 *
 * **What this does not do.** It does not minimise what the whole list costs.
 * Doing that means choosing a set of sellers such that the parts plus the
 * postage comes to as little as possible, and that is a set-cover problem: the
 * cheapest lot of every part, bought separately, is forty sellers and forty lots
 * of postage, which is nobody's cheapest order. So this answers the two
 * questions it can answer honestly and leaves the choosing to the reader —
 * `lines`, which is the cheapest single seller for each part on its own, and
 * `stores`, which is what the whole list would cost from one seller and how much
 * of it they could actually supply. A reader comparing sellers wants the second;
 * a reader wondering what a part goes for wants the first. Postage is shown
 * beside a seller's total rather than added into it, brickzuke holding a flat
 * figure per seller and not a quote.
 *
 * **Where the lots come from.** Not from here. The walk is passed in, because
 * the only thing that knows every lot brickzuke holds is `eachLot` in the view
 * layer — this session's item-page lots, then the stored ones off a cursor —
 * and the idb layer does not reach up into the view's. It also makes the
 * planning a pure fold over whatever it is handed, which is what lets it be
 * tested against a handful of made-up lots instead of a database.
 *
 * **Why one walk.** A seller runs to thousands of lots and the store of them has
 * no bound, so it is read with a cursor and read once: every wanted line is
 * matched against each lot as it goes past, and nothing is kept but the best
 * offer found so far. Walking it once per line would be a cursor over the whole
 * store per part on the list.
 */

/** One part somebody wants, as the planner reads it. */
export interface WantedLine {
  /** What identifies the line in the answer — the shop list item's id. */
  key: string
  /** BrickLink's own record for the part — `P-3001`. */
  record?: string
  /** Set instead where the part is one of somebody's own, which has no lots. */
  userItemId?: number
  name?: string
  /** BrickLink's colour id, or absent to take the part in any colour. */
  colorId?: string
  quantity: number
  /** The most to pay for one, in whatever currency the lots are shown in. */
  maxPrice?: number
  /** `N` or `U`, or absent for either. */
  condition?: string
}

/** One lot on offer, as little of it as the planning needs. */
export interface CandidateLot {
  record?: string
  colorId?: string
  condition?: string
  quantity?: number
  /** Per one, converted — the figure worth comparing across sellers. */
  price?: number
  store?: string
  storeName?: string
  country?: string
  countryName?: string
}

/** Every lot brickzuke holds, handed over one at a time. */
export type LotWalk = (visit: (lot: CandidateLot) => void) => Promise<unknown>

/** Why a line is not fully covered, where it is not. */
export type Shortfall =
  /** The part is one of somebody's own: no seller lists it, so none has it. */
  | 'own'
  /** Nothing on offer matches the part, the colour and the condition asked for. */
  | 'none'
  /** Lots exist but every one is dearer than the line's own limit. */
  | 'price'
  /** The cheapest seller who has it has fewer than were wanted. */
  | 'quantity'

/** What one line comes to: the seller to buy it from, and what it costs. */
export interface PlannedLine {
  key: string
  name?: string
  record?: string
  colorId?: string
  wanted: number
  /** How many of the wanted quantity the chosen lot covers. */
  covered: number
  /** How many it does not. Zero when the line is answered in full. */
  short: number
  shortfall?: Shortfall
  /** How many lots were eligible at all, across every seller. */
  offers: number
  store?: string
  storeName?: string
  country?: string
  countryName?: string
  /** Per one, from the chosen lot. */
  price?: number
  /** `price` times `covered` — what this line adds to the order. */
  cost?: number
}

/** What the whole list comes to from one seller. */
export interface PlannedStore {
  store: string
  storeName?: string
  country?: string
  countryName?: string
  /** How many of the list's lines this seller can supply at all. */
  lines: number
  /** How many of the wanted pieces, across those lines. */
  quantity: number
  /** How many of the list's lines they cannot supply in full. */
  short: number
  /** What the pieces they can supply cost here. */
  cost: number
}

export interface ShopPlan {
  lines: PlannedLine[]
  /** Every seller holding anything on the list, dearest last. */
  stores: PlannedStore[]
  /** What `lines` adds up to — the cheapest-per-part total, postage aside. */
  cost: number
  /** How many pieces the whole list could not find. */
  short: number
}

/** The best offer found for one line so far. */
interface Best {
  lot: CandidateLot
  price: number
  /** How many of the wanted quantity it covers. */
  covered: number
}

/**
 * Whether a lot is one of the offers for a line.
 *
 * Colour and condition narrow only when the line states them: a list asking for
 * a brick in no particular colour takes it in any, which is also what an
 * inventory line copied from a set without a colour means. A lot with no price
 * is no offer at all — the one thing a comparison cannot do without.
 */
function eligible(line: WantedLine, lot: CandidateLot): boolean {
  if (!line.record || lot.record !== line.record) {
    return false
  }
  if (typeof lot.price !== 'number' || !Number.isFinite(lot.price) || lot.price <= 0) {
    return false
  }
  if (!lot.store) {
    return false
  }
  if (line.colorId !== undefined && String(lot.colorId ?? '') !== String(line.colorId)) {
    return false
  }
  if (line.condition !== undefined && lot.condition !== line.condition) {
    return false
  }
  return true
}

/**
 * Whether one offer beats another.
 *
 * Covering the whole line comes first and price second, which is the order
 * somebody buying actually weighs them: a lot with all four bricks at a penny
 * more is a better answer than a lot with three at the best price and a second
 * order for the fourth. Among lots that both cover it, or that both fall short,
 * the cheaper wins — and among equally cheap ones, the larger, so a line that
 * falls short falls as little short as it can.
 */
function better(candidate: Best, held: Best | undefined): boolean {
  if (!held) {
    return true
  }
  return (
    candidate.covered > held.covered ||
    (candidate.covered === held.covered && candidate.price < held.price)
  )
}

/** What one line's answer is, once the walk is done. */
function planLine(line: WantedLine, best: Best | undefined, offers: number): PlannedLine {
  const covered = best?.covered ?? 0
  const short = Math.max(0, line.quantity - covered)
  return {
    key: line.key,
    name: line.name,
    record: line.record,
    colorId: line.colorId,
    wanted: line.quantity,
    covered,
    short,
    shortfall: short === 0 ? undefined : shortfallFor(line, offers, covered),
    offers,
    store: best?.lot.store,
    storeName: best?.lot.storeName,
    country: best?.lot.country,
    countryName: best?.lot.countryName,
    price: best?.price,
    cost: best ? round(best.price * covered) : undefined
  }
}

/**
 * Why a line fell short, said as precisely as the walk can say it.
 *
 * The four cases are four different things for a reader to do about it: nothing
 * (an item of their own), fetch a seller's lots, raise their price limit, or
 * take fewer. `offers` is counted before the price limit is applied, which is
 * what lets `price` be told from `none`.
 */
function shortfallFor(line: WantedLine, offers: number, covered: number): Shortfall {
  if (!line.record) {
    return 'own'
  }
  if (covered > 0) {
    return 'quantity'
  }
  if (offers > 0) {
    return 'price'
  }
  return 'none'
}

/** Two decimal places, money being counted here and not measured. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The plan, from the wanted lines and one walk over every lot held.
 *
 * Lines naming a part of somebody's own are answered without looking: no seller
 * lists a part BrickLink has no id for, so there is nothing to match and the
 * line is reported as unbuyable rather than as missing.
 */
export async function planPurchase(lines: WantedLine[], walk: LotWalk): Promise<ShopPlan> {
  const best = new Map<string, Best>()
  /* Counted before the price limit is applied — see [shortfallFor]. */
  const offers = new Map<string, number>()
  /* Per seller, the cheapest they have of each line — see the note up top. */
  const perStore = new Map<string, { lot: CandidateLot; lines: Map<string, Best> }>()
  const buyable = lines.filter((line) => line.record)

  if (buyable.length) {
    await walk((lot) => {
      for (const line of buyable) {
        if (!eligible(line, lot)) {
          continue
        }
        offers.set(line.key, (offers.get(line.key) ?? 0) + 1)
        if (line.maxPrice !== undefined && lot.price! > line.maxPrice) {
          continue
        }
        const covered = Math.min(line.quantity, Math.max(0, lot.quantity ?? 0))
        if (covered <= 0) {
          continue
        }
        const candidate: Best = {
          lot,
          price: lot.price!,
          covered
        }
        if (better(candidate, best.get(line.key))) {
          best.set(line.key, candidate)
        }
        // The same comparison held per seller, which is what makes the
        // cross-seller table: what this list would cost from this one shop.
        const store = perStore.get(lot.store!) ?? {
          lot,
          lines: new Map<string, Best>()
        }
        if (better(candidate, store.lines.get(line.key))) {
          store.lines.set(line.key, candidate)
        }
        perStore.set(lot.store!, store)
      }
    })
  }

  const planned = lines.map((line) => planLine(line, best.get(line.key), offers.get(line.key) ?? 0))
  const wanted = new Map(lines.map((line) => [line.key, line.quantity]))

  const stores: PlannedStore[] = Array.from(perStore.entries())
    .map(([store, held]) => {
      let quantity = 0
      let cost = 0
      let short = 0
      for (const [key, offer] of held.lines) {
        quantity += offer.covered
        cost += offer.price * offer.covered
        if (offer.covered < (wanted.get(key) ?? 0)) {
          short++
        }
      }
      return {
        store,
        storeName: held.lot.storeName,
        country: held.lot.country,
        countryName: held.lot.countryName,
        // Every line this seller has anything of, and how many of those they
        // cannot fill — the two numbers that say how much of one order this
        // could be.
        lines: held.lines.size,
        quantity,
        short,
        cost: round(cost)
      }
    })
    // Most of the list first, and the cheapest of those that reach as far: the
    // seller worth looking at is the one who can fill the most of it.
    .sort((a, b) => b.lines - a.lines || a.cost - b.cost)

  return {
    lines: planned,
    stores,
    cost: round(planned.reduce((sum, line) => sum + (line.cost ?? 0), 0)),
    short: planned.reduce((sum, line) => sum + line.short, 0)
  }
}
