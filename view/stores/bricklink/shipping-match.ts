/**
 * Which of a seller's rates is the one for the country an order would go to.
 *
 * A rate read out of a seller's terms — see [shipping-terms] — says where it
 * applies in the seller's own words: `Zone 1: European Union`, `Rest of
 * World`, `Pour La France`, `Versandkosten für ÖSTERREICH`, or nothing at all.
 * The country an order would go to is a code — `DE` — so between the two is
 * a reading of the words, and this is it: a small geography of the places
 * sellers group their rates by, in the languages they write in, and a rule for
 * which of several headings that all cover a country is the one meant.
 *
 * The rule is that the most specific heading wins. A seller writing
 * `Deutschland`, `EU countries` and `Rest of World` means each to be read
 * against the ones before it, so a German order takes the first, a French one
 * the second, and everything else the third — whatever order they were
 * written in. So a heading naming the country itself (or `Domestic`, for the
 * seller's own) outranks a bloc (`EU`, `EFTA`, `Benelux`), which outranks a
 * continent (`Europe`, `Asia`), which outranks `Worldwide` or
 * `International`, which outranks a rate under no heading at all. A heading
 * that names the country after `except` rules it out.
 *
 * And the honest answer, once the rates for the country are known, is the
 * cheapest of them: an order's weight is unknown, so what is stated is the
 * lightest band, which is what a seller's "from" means too. A rate that only
 * starts at an order value is taken only where the order is known to reach
 * it, in the same currency; a rate that stops at one is dropped where the
 * order is known to exceed it. Like the parse, this is a heuristic and says
 * so: the rate it picks carries the line it was read off, for checking.
 */
import type { ShippingCost } from './shipping-terms'
import { words } from './shipping-terms'

/** A country as the matching needs it: BrickLink's code, and what else is known. */
export interface Place {
  /** BrickLink's own code — `DE`, `US`, `UK`. */
  code: string
  /** Its name as the directory has it, where the directory has been read. */
  name?: string
  /** The region BrickLink groups it under — `Europe`, `North America` — likewise. */
  region?: string
}

/** How closely a heading fits a country. Higher is closer; `NONE` is not at all. */
export const NONE = -1
/** A rate under no heading: applies wherever nothing more specific does. */
export const UNSAID = 0
/** `Worldwide`, `Rest of world`, `International`, `Abroad`. */
export const WORLD = 1
/** A continent — `Europe`, `Asia`, `South America`. */
export const CONTINENT = 2
/** A bloc — `EU`, `EFTA`, `Benelux`, `Scandinavia`. */
export const BLOC = 3
/** The country itself, by name, or `Domestic` for the seller's own. */
export const COUNTRY = 4

/** The member states of the European Union, by BrickLink's codes. */
export const EU = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
])

const EFTA = new Set(['CH', 'NO', 'IS', 'LI'])
const BENELUX = new Set(['BE', 'NL', 'LU'])
const NORDIC = new Set(['DK', 'SE', 'NO', 'FI', 'IS'])
const BALTIC = new Set(['EE', 'LV', 'LT'])

/**
 * Europe beyond the union, for when the directory has not said what region a
 * country is in. Not every microstate; the ones sellers post to.
 */
const EUROPE = new Set([
  ...EU, ...EFTA, 'UK', 'UA', 'RS', 'BA', 'ME', 'MK', 'AL', 'MD', 'BY', 'AD', 'MC', 'SM', 'VA', 'GI', 'FO',
  'TR', 'GE', 'AM', 'AZ', 'XK'
])
const NORTH_AMERICA = new Set(['US', 'CA', 'MX', 'GL', 'BM', 'PM'])
const OCEANIA = new Set(['AU', 'NZ', 'FJ', 'PG', 'WS', 'TO', 'VU', 'SB', 'NC', 'PF', 'CK', 'NU', 'KI', 'TV', 'NR', 'PW', 'FM', 'MH'])

/**
 * How a country is named in the languages sellers write their terms in.
 *
 * Not every country — the directory has two hundred — but the ones sellers
 * name a rate for, which are the ones they post to often enough to have
 * priced. A name in capitals of three letters or fewer is matched only as
 * capitals: `US` is a country and `us` is "contact us", and `EU` in lower
 * case is French for "had".
 */
const NAMES: Record<string, string[]> = {
  US: ['united states', 'u\\.s\\.a?\\.?', 'usa', 'US', 'estados unidos', 'vereinigte staaten', 'états-unis', 'etats-unis'],
  CA: ['canada', 'kanada'],
  MX: ['mexico', 'méxico', 'mexiko', 'mexique'],
  UK: ['united kingdom', 'great britain', 'britain', 'england', 'UK', 'GB', 'u\\.k\\.', 'großbritannien',
    'grossbritannien', 'royaume-uni', 'verenigd koninkrijk', 'regno unito', 'reino unido'],
  IE: ['ireland', 'irland', 'irlande', 'éire', 'ierland'],
  DE: ['germany', 'deutschland', 'allemagne', 'duitsland', 'germania', 'alemania', 'BRD'],
  AT: ['austria', 'österreich', 'oesterreich', 'autriche', 'oostenrijk'],
  CH: ['switzerland', 'schweiz', 'suisse', 'svizzera', 'zwitserland', 'suiza'],
  FR: ['france', 'frankreich', 'frankrijk', 'francia'],
  IT: ['italy', 'italien', 'italie', 'italia', 'italië'],
  ES: ['spain', 'spanien', 'espagne', 'españa', 'espana', 'spanje'],
  PT: ['portugal'],
  NL: ['netherlands', 'the netherlands', 'nederland', 'holland', 'niederlande', 'pays-bas', 'países bajos'],
  BE: ['belgium', 'belgien', 'belgique', 'belgië', 'belgie', 'bélgica'],
  LU: ['luxembourg', 'luxemburg'],
  DK: ['denmark', 'dänemark', 'danmark', 'danemark', 'denemarken'],
  SE: ['sweden', 'schweden', 'sverige', 'suède', 'zweden'],
  NO: ['norway', 'norwegen', 'norge', 'norvège', 'noorwegen'],
  FI: ['finland', 'finnland', 'suomi', 'finlande'],
  IS: ['iceland', 'islande', 'ijsland'],
  PL: ['poland', 'polen', 'polska', 'pologne'],
  CZ: ['czech republic', 'czechia', 'czech', 'tschechien', 'république tchèque', 'tsjechië'],
  SK: ['slovakia', 'slowakei', 'slovensko', 'slovaquie'],
  HU: ['hungary', 'ungarn', 'hongrie', 'magyarország'],
  RO: ['romania', 'rumänien', 'roumanie'],
  BG: ['bulgaria', 'bulgarien'],
  GR: ['greece', 'griechenland', 'grèce', 'hellas'],
  HR: ['croatia', 'kroatien', 'hrvatska', 'croatie'],
  SI: ['slovenia', 'slowenien', 'slovenija', 'slovénie'],
  EE: ['estonia', 'estland'],
  LV: ['latvia', 'lettland'],
  LT: ['lithuania', 'litauen'],
  MT: ['malta'],
  CY: ['cyprus', 'zypern'],
  LI: ['liechtenstein'],
  UA: ['ukraine'],
  RU: ['russia', 'russland', 'russie'],
  TR: ['turkey', 'türkiye', 'türkei', 'turquie'],
  IL: ['israel'],
  AE: ['united arab emirates', 'UAE', 'dubai'],
  JP: ['japan', 'japon'],
  CN: ['china'],
  KR: ['south korea', 'korea', 'südkorea'],
  HK: ['hong kong', 'hongkong', 'HK'],
  TW: ['taiwan'],
  SG: ['singapore', 'singapur'],
  IN: ['india', 'indien'],
  AU: ['australia', 'australien', 'australie'],
  NZ: ['new zealand', 'neuseeland'],
  ZA: ['south africa', 'südafrika'],
  BR: ['brazil', 'brasil', 'brasilien'],
  AR: ['argentina', 'argentinien'],
  CL: ['chile']
}

/** The seller's own country, whatever it is. */
const DOMESTIC = words(['domestic', 'inland', 'inländisch', 'binnenland', 'binnenlands', 'national', 'nationale'])

/** Everyone else's. */
const INTERNATIONAL = words([
  'international', 'internationaal', 'abroad', 'overseas', 'ausland', 'étranger', 'etranger', 'buitenland',
  'estero', 'extranjero', 'außerhalb', 'ausserhalb'
])

/** Everyone. `rest of` on its own is not here: `Rest of Europe` is Europe. */
const WORLDWIDE = words([
  'world', 'worldwide', 'world wide', 'weltweit', 'welt', 'wereld', 'monde', 'mundo', 'everywhere',
  'überall', 'other countries', 'all other', 'alle anderen', 'restliche', 'übrige', 'sonstige', 'autres pays',
  'overige', 'resto del mundo', 'reste du monde'
])

/** A group of countries sellers price as one, and the words they call it by. */
interface Group {
  of: RegExp[]
  has: (to: Place) => boolean
}

const BLOCS: Group[] = [
  {
    // `EU` only as capitals, `eu` being French for "had" — see [NAMES].
    of: [
      words([
        'european union', 'europäische union', 'europaeische union', 'union européenne', 'europese unie',
        'unione europea', 'unión europea', 'eurozone'
      ]),
      words(['EU'], 'gu')
    ],
    has: (to) => EU.has(to.code)
  },
  {
    of: [words(['efta', 'ewr', 'eea', 'eer'])],
    has: (to) => EFTA.has(to.code)
  },
  {
    of: [words(['benelux'])],
    has: (to) => BENELUX.has(to.code)
  },
  {
    of: [words(['scandinavia', 'skandinavien', 'scandinavie', 'nordic', 'nordics', 'nordisch'])],
    has: (to) => NORDIC.has(to.code)
  },
  {
    of: [words(['baltic', 'baltics', 'baltikum'])],
    has: (to) => BALTIC.has(to.code)
  }
]

/** Whether the region the directory names is one of these, however it spells it. */
function regionIs(to: Place, pattern: RegExp): boolean {
  return to.region !== undefined && pattern.test(to.region)
}

const CONTINENTS: Group[] = [
  {
    of: [words(['europe', 'europa', 'european', 'europäische', 'europäisches', 'europese', 'europeo', 'europea'])],
    has: (to) => regionIs(to, /europe/i) || (to.region === undefined && EUROPE.has(to.code))
  },
  {
    of: [words(['north america', 'nordamerika', 'amérique du nord', 'noord-amerika'])],
    has: (to) => regionIs(to, /north america/i) || (to.region === undefined && NORTH_AMERICA.has(to.code))
  },
  {
    of: [words([
      'south america', 'südamerika', 'latin america', 'lateinamerika', 'middle america', 'central america',
      'mittelamerika', 'zentralamerika', 'amérique du sud', 'caribbean', 'karibik', 'americas'
    ])],
    has: (to) => regionIs(to, /south america|central america|latin|caribbean|americas/i)
  },
  {
    of: [words(['asia', 'asien', 'asie', 'far east', 'fernost'])],
    has: (to) => regionIs(to, /asia/i)
  },
  {
    of: [words(['africa', 'afrika', 'afrique'])],
    has: (to) => regionIs(to, /africa/i)
  },
  {
    of: [words(['oceania', 'ozeanien', 'océanie', 'australasia', 'pacific', 'pazifik'])],
    has: (to) => regionIs(to, /oceania|australia|pacific/i) || (to.region === undefined && OCEANIA.has(to.code))
  },
  {
    of: [words(['middle east', 'naher osten', 'moyen-orient', 'midden-oosten'])],
    has: (to) => regionIs(to, /middle east/i)
  }
]

/** What comes after one of these is where the heading does not apply. */
const EXCEPT = /(?<![\p{L}\d])(?:except|excluding|excl\.?|außer|ausser|ohne|sauf|behalve|exclusief|eccetto|excepto|not|nicht|keine?)(?![\p{L}\d])/iu

/** Whether a regular expression built with the `g` flag matches, forgetting where it last did. */
function has(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0
  return pattern.test(text)
}

/** Whether the text calls a group by any of its names, and the country is in it. */
function inGroup(groups: Group[], text: string, to: Place): boolean {
  return groups.some((group) => group.has(to) && group.of.some((pattern) => has(pattern, text)))
}

/** The patterns that name a country, built once each and only for the countries asked about. */
const namePatterns = new Map<string, RegExp[]>()

function patternsFor(place: Place): RegExp[] {
  const key = `${place.code}\n${place.name ?? ''}`
  let patterns = namePatterns.get(key)
  if (!patterns) {
    const names = NAMES[place.code] ?? []
    const loose = names.filter((name) => !/^[A-Z]{1,3}$/.test(name))
    const strict = names.filter((name) => /^[A-Z]{1,3}$/.test(name))
    // The directory's own name for it too, where the directory has been
    // read, which is how a country off the list is still found — though not
    // by a name so short it is a syllable of other words.
    if (place.name && place.name.length >= 4 && !loose.includes(place.name.toLowerCase())) {
      loose.push(place.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    }
    patterns = []
    if (loose.length) {
      patterns.push(words(loose))
    }
    if (strict.length) {
      patterns.push(words(strict, 'gu'))
    }
    namePatterns.set(key, patterns)
  }
  return patterns
}

function names(text: string, place: Place): boolean {
  return patternsFor(place).some((pattern) => has(pattern, text))
}

/**
 * How closely a rate's destination, as the seller wrote it, fits the country
 * an order would go to.
 *
 * `from` is the seller's own country, which is what `Domestic` means and what
 * `International` means the opposite of. A destination with nothing written
 * is `UNSAID`: the rate applies, but any heading at all outranks it.
 */
export function destinationFit(destination: string | undefined, to: Place, from?: Place): number {
  const text = (destination ?? '').trim()
  if (!text) {
    return UNSAID
  }
  // `Europe except UK`, `Weltweit außer USA`: the tail rules out, the head
  // rules in.
  const cut = EXCEPT.exec(text)
  const head = cut ? text.slice(0, cut.index) : text
  const tail = cut ? text.slice(cut.index + cut[0].length) : ''
  if (tail && (names(tail, to) || inGroup(BLOCS, tail, to))) {
    return NONE
  }
  if (names(head, to)) {
    return COUNTRY
  }
  const domestic = from !== undefined && from.code === to.code
  if (domestic && has(DOMESTIC, head)) {
    return COUNTRY
  }
  if (inGroup(BLOCS, head, to)) {
    return BLOC
  }
  // A bloc the country is not in is taken out before the continents are
  // looked for: `European Union` is not Europe, and a Swiss order is not
  // under Zone 1 for the word inside it.
  const rest = BLOCS.reduce(
    (text, bloc) => bloc.of.reduce((left, pattern) => left.replace(pattern, ' '), text),
    head
  )
  if (inGroup(CONTINENTS, rest, to)) {
    return CONTINENT
  }
  // Without the seller's country, `International` is taken as read: an order
  // is far more often to somewhere else than not.
  if (has(WORLDWIDE, rest) || (!domestic && has(INTERNATIONAL, rest))) {
    return WORLD
  }
  return NONE
}

/**
 * The rates that apply to a country: those under the closest-fitting heading
 * the seller wrote, and none where nothing fits.
 */
export function ratesTo(rates: ShippingCost[], to: Place, from?: Place): ShippingCost[] {
  let best = NONE
  let out: ShippingCost[] = []
  for (const rate of rates) {
    const fit = destinationFit(rate.destination, to, from)
    if (fit === NONE) {
      continue
    }
    if (fit > best) {
      best = fit
      out = [rate]
    } else if (fit === best) {
      out.push(rate)
    }
  }
  return out
}

/** What the order comes to, for the rates that turn on it. */
export interface OrderValue {
  value: number
  /** ISO code — the one the prices were converted into. */
  currency: string
}

/**
 * Whether a rate bounded by order value is one this order gets.
 *
 * Only a value in the rate's own currency can say. Without one, a rate that
 * starts at a value is left out — free postage over €70 is not the postage
 * on an order of unknown size — and a rate that stops at one is kept, the
 * smallest order fitting under it.
 */
function withinValue(rate: ShippingCost, order?: OrderValue): boolean {
  const known = order !== undefined && rate.currency !== undefined && order.currency === rate.currency
  if (rate.minValue !== undefined && !(known && order.value >= rate.minValue)) {
    return false
  }
  if (rate.maxValue !== undefined && known && order.value > rate.maxValue) {
    return false
  }
  return true
}

/** What a seller's terms say about posting to a country. */
export type Postage =
  /** A rate applies, and this is the cheapest that does. */
  | {
    kind: 'rate'
    rate: ShippingCost
  }
  /** The seller lists the countries they post to, and this is not one. */
  | {
    kind: 'unshipped'
  }
  /** The seller posts there, as far as is known, but no rate could be read for it. */
  | {
    kind: 'unread'
  }

/** As much of a seller's policy as the postage turns on. */
export interface ShippingTerms {
  /** The countries the seller posts to, by code — empty where they declared none, which means everywhere. */
  shipsTo: string[]
  rates: ShippingCost[]
}

/**
 * The postage a seller would charge to a country, as far as their terms say.
 *
 * The cheapest rate under the closest-fitting heading, the order's weight
 * being unknown — see the top of this file for why that is the honest
 * figure. `order` lets a rate that turns on the order's value be counted in
 * or out; without it such rates are left out.
 */
export function postageTo(terms: ShippingTerms, to: Place, from?: Place, order?: OrderValue): Postage {
  if (terms.shipsTo.length && !terms.shipsTo.includes(to.code)) {
    return {
      kind: 'unshipped'
    }
  }
  const fitting = ratesTo(terms.rates, to, from).filter((rate) => withinValue(rate, order))
  if (!fitting.length) {
    return {
      kind: 'unread'
    }
  }
  return {
    kind: 'rate',
    rate: fitting.reduce((least, rate) => (rate.cost < least.cost ? rate : least))
  }
}
