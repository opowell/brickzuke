/**
 * The home screen, filled in while it is being looked at.
 *
 * Three of its cards are not in any bulk download and stood empty until
 * somebody went looking: the regions and the countries come off BrickLink's
 * store directory in one request, and the sellers come one country at a time —
 * see [storesFetch] for why there is no page that states them all. Nothing
 * asked for any of it on the way in, so the wall read `Stores` over nothing,
 * and a query across it narrowed a set that was not there: `region:"Americas"`
 * counted no sellers because no seller had ever been fetched.
 *
 * So this asks, in the background, while the home screen is up: the directory
 * first, then a country at a time, the biggest first. One request in flight at
 * a time and none at all while somebody is inside a table — the same manners
 * the rest of brickzuke fetches with, and the reason the loop stops on the way
 * out and picks up where it left off on the way back in.
 *
 * What a card says while that runs is the other half of this, and a count here
 * is either read or projected and never a blend of the two:
 *
 *   - nothing known yet — {@link LOADING}, because `0` is a claim brickzuke
 *     has not earned and the blank shown before it said nothing at all;
 *   - something known — the projection, written with a `~` in front of it
 *     wherever it appears: the sellers actually stored, plus what the
 *     directory says is waiting in the countries nobody has fetched. They are
 *     BrickLink's own numbers, which is why it lands close; they are its
 *     numbers about a list that moves under it, which is why it is not exact;
 *   - everything fetched — the count itself, unprefixed, and this steps aside.
 *
 * The years are here for the third reason a card is slow: no request, but a
 * pass over two hundred thousand items. Same three states, the middle one
 * being the years the pass has turned up so far.
 *
 * Two of the browse-filled types are deliberately not filled. An item's
 * pictures and a seller's lots are fetched per item and per seller — there is
 * no directory of either, and asking for every one of them is a request per
 * seller for as long as anyone leaves the screen open. Those cards go on
 * counting what has been read, which is the honest answer to a question nobody
 * can ask cheaply.
 */
import { ref } from 'vue'
import type { Country } from '../stores/bricklink/stores-page'
import { countriesFor, readStores, storesFor } from './storesFetch'
import { yearCount } from './catalogSource'
import { browsedCounts, refreshCounts } from './catalogCounts'

/**
 * What a card is headed with while its fill has nothing to project yet.
 *
 * One character, in the place the number goes, so the wall keeps its shape
 * between the label and the count — a card that grows a word and loses it
 * again moves everything below it twice.
 */
export const LOADING = '…'

/** The types this fills, by the key their cards are drawn under. */
export const FILLED = ['regions', 'countries', 'stores', 'years'] as const

/** A type being filled: its projection, where there is enough to project one. */
export interface Fill {
  /**
   * The population this type will have when the fill is done.
   *
   * Absent until the first thing lands, which is the difference between the
   * placeholder and the estimate. Shown with a `~` in front of it wherever it
   * is shown at all — see the note at the top on what it is made of.
   */
  estimate?: number
}

/**
 * The types with a fill in flight.
 *
 * A type in here is a type whose stored count is not the answer yet. One that
 * finishes is dropped rather than marked done: from then on the card shows the
 * count it would have shown with no fill at all, so there is one way to say
 * "this number is exact" and it is this map not mentioning the type.
 */
export const fills = ref<Record<string, Fill | undefined>>({})

/**
 * The countries whose sellers are stored.
 *
 * Which is the same thing `storesFor` reads to decide whether a country needs
 * fetching — rows under a country are a country somebody has asked about — so
 * the projection and the fetch agree on what is outstanding by construction.
 */
export const fetchedCountries = ref<ReadonlySet<string>>(new Set<string>())

/**
 * Bumped whenever a fill lands something, for the screen drawn from it.
 *
 * The counts are refs and redraw themselves; the cards' previews are read
 * once and held, so the home screen needs telling that the type under one of
 * them has grown.
 */
export const filled = ref(0)

/**
 * How many sellers the directory counts in countries nobody has fetched yet.
 *
 * The whole of the projection: what is stored is counted, what is not is taken
 * from the number BrickLink prints beside each country in the directory. Both
 * callers hand over the same two fields off rows of their own — the fill has
 * `Country` records, a narrowed card has the country table's rows.
 */
export function awaitedStores(countries: { code: string; stores: number }[]): number {
  const fetched = fetchedCountries.value
  return countries.reduce((waiting, country) => {
    if (fetched.has(country.code) || !Number.isFinite(country.stores)) {
      return waiting
    }
    return waiting + Math.max(country.stores, 0)
  }, 0)
}

/**
 * How many failures in a row mean nobody is answering.
 *
 * A country's page can fail on its own — the directory lists a country whose
 * page comes back empty, and `storesFor` waits out its deadline before saying
 * so — and that is one country to skip rather than a reason to stop. Three in
 * a row is the extension not being there, and going on would be two hundred
 * more waits for the same silence.
 */
const GIVE_UP = 3

/**
 * How long to wait between countries.
 *
 * These are somebody else's pages, fetched on nobody's explicit instruction —
 * the screen is simply open — and there are two hundred of them. A pause the
 * length of a page view is what keeps a background fill from reading as a
 * scrape: it costs a fill that runs while somebody browses nothing at all, and
 * the card is stating the projection the whole time either way.
 */
const BETWEEN_MS = 1_500

/**
 * Which run is the live one. Zero is none: the home screen has been left, and
 * every loop still in flight stops at its next look at this.
 */
let current = 0
let issued = 0

/** Countries asked about this session, answered or not, so none is asked twice. */
const attempted = new Set<string>()

/** Starts the fill, or leaves the one already running alone. */
export function startHomeFill(): void {
  if (current) {
    return
  }
  const mine = (current = ++issued)
  void fillYears()
  void fillDirectory(mine)
}

/**
 * Stops it, for the way out of the home screen.
 *
 * The placeholders go with it: a card left reading `…` behind a loop that is
 * not running says something is coming when nothing is. What has been
 * projected stays — an estimate is still the best thing known about the type,
 * and the next visit resumes from the countries already stored.
 */
export function stopHomeFill(): void {
  current = 0
  for (const key of FILLED) {
    if (fills.value[key]?.estimate === undefined) {
      settle(key)
    }
  }
}

/** Marks a type as being filled, which is what draws the placeholder. */
function mark(key: string): void {
  fills.value = {
    ...fills.value,
    [key]: {}
  }
}

/** Drops a type's fill, which is what puts its own count back on the card. */
function settle(key: string): void {
  if (!fills.value[key]) {
    return
  }
  const rest = {
    ...fills.value
  }
  delete rest[key]
  fills.value = rest
}

/** Publishes a projection, which is what puts a `~` on the card. */
function project(key: string, estimate: number): void {
  fills.value = {
    ...fills.value,
    [key]: {
      estimate
    }
  }
}

/** One count, written straight rather than through a whole recount. */
function note(key: string, value: number): void {
  browsedCounts.value = {
    ...browsedCounts.value,
    [key]: value
  }
}

function landed(): void {
  filled.value++
}

/**
 * The directory: every region and every country, in one request.
 *
 * Both cards are whole the moment it lands — there is no more of either to
 * fetch — so they settle here, and the sellers carry on below.
 */
async function fillDirectory(mine: number): Promise<void> {
  mark('regions')
  mark('countries')
  mark('stores')
  let countries: Country[]
  try {
    countries = await countriesFor()
  } catch {
    // Nobody answered. The three cards go back to stating what is stored,
    // which is what they said before any of this and is still true.
    settle('regions')
    settle('countries')
    settle('stores')
    return
  }
  if (mine !== current) {
    return
  }
  // The one recount, and worth it here: the directory landing is the moment
  // three of these cards change at once, and `refreshCounts` is what reads
  // them all off what is stored. The loop below writes its own single number
  // rather than paying for this two hundred times over.
  await refreshCounts()
  settle('regions')
  settle('countries')
  landed()
  await fillStores(mine, countries)
}

/** The sellers, a country at a time. */
async function fillStores(mine: number, countries: Country[]): Promise<void> {
  const stored = await readStores()
  const fetched = new Set(stored.map((store) => store.countryID))
  fetchedCountries.value = fetched
  let sellers = stored.length
  note('stores', sellers)
  project('stores', sellers + awaitedStores(countries.map(asCode)))
  landed()

  // Biggest first: the projection is only as loose as the countries still
  // outstanding, so taking the largest of them out first is what settles the
  // number on the card fastest — and it is also the order somebody looking at
  // a wall of sellers would want them to arrive in.
  const order = countries
    .filter((country) => Number.isFinite(country.storeCount) && country.storeCount > 0)
    .sort((a, b) => b.storeCount - a.storeCount)
  let failures = 0
  let missed = 0
  for (const country of order) {
    if (mine !== current) {
      return
    }
    if (fetched.has(country.countryCode)) {
      continue
    }
    // Asked about already and still not stored: it failed earlier this
    // session, and it is not asked again — but it is still a country missing
    // from the count, which is what keeps the `~` on the card.
    if (attempted.has(country.countryCode)) {
      missed++
      continue
    }
    attempted.add(country.countryCode)
    try {
      sellers += (await storesFor(country.countryCode)).length
    } catch {
      missed++
      if (++failures >= GIVE_UP) {
        // The projection stands: it is the last true thing said about the
        // type, and it is a better answer than the handful of countries that
        // did come back.
        return
      }
      continue
    }
    failures = 0
    fetched.add(country.countryCode)
    fetchedCountries.value = new Set(fetched)
    note('stores', sellers)
    project('stores', sellers + awaitedStores(countries.map(asCode)))
    landed()
    await new Promise((resolve) => setTimeout(resolve, BETWEEN_MS))
  }
  // Only where every country came back. One that did not leaves the count
  // short by however many sellers were in it, and short is exactly what the
  // `~` is for.
  if (mine === current && !missed) {
    settle('stores')
    landed()
  }
}

/** A directory record, as the two fields the projection reads. */
function asCode(country: Country): { code: string; stores: number } {
  return {
    code: country.countryCode,
    stores: country.storeCount
  }
}

/**
 * The years, which cost no request and a pass over the whole catalogue.
 *
 * The intermediate value is the years the pass has turned up so far, and it is
 * a floor rather than a projection: the index runs by item id, so the years
 * arrive shuffled and the count climbs quickly and then crawls. Scaling it by
 * how much of the catalogue is left would overshoot every time — eighty-one
 * years do not keep appearing at the rate the first thousand items suggest —
 * so what the `~` promises here is "at least this many", which is the one
 * thing a partial pass honestly knows.
 */
async function fillYears(): Promise<void> {
  mark('years')
  try {
    // Against the fill's own mark rather than against which run this is: the
    // pass is held and shared, so a second visit to the home screen while it
    // is still going is handed the promise and never gets to register a
    // report of its own. What is asked here is whether anybody is still
    // waiting on the number, and that is what the mark says.
    const total = await yearCount((seen) => {
      if (seen && fills.value.years) {
        project('years', seen)
      }
    })
    note('years', total)
  } catch {
    // The pass failed; the card says what it said before.
  } finally {
    settle('years')
    landed()
  }
}
