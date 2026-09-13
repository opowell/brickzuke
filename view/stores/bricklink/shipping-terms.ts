/**
 * Reading what a seller charges to ship out of the prose they wrote about it.
 *
 * BrickLink never states a shipping cost as data. The store policy — see
 * [store-policy-page] — names the countries a seller ships to and the methods
 * they offer, and then the charges are in `sellerTermsShipping`: a free-text
 * HTML field every seller fills in their own language and their own way.
 * Instant-checkout bands exist behind that, but they are only ever shown at
 * a checkout, against a cart.
 *
 * So this is a heuristic and is documented as one. What it looks for is the
 * shape nearly every seller falls into when they write a rate: a line with a
 * money amount on it and, usually, a weight the amount applies up to —
 * `bis 1 kg: €6,61`, `up to 750g EUR 11.90`, `0-6 Ounces will be a flat fee
 * of $7.00`, `1-4 ounces $5.85 $1.50 $7.35` — under a heading that says where
 * to: `Zone 1: European Union`, `Shipping charges for orders in the U.S.`,
 * `Versandkosten Deutschland`. Amounts that are order values rather than
 * charges (`value under 50 EUR`, `ab 70 Euro`) are read as the bounds they
 * are, and a line that mentions free postage over a value is a nought.
 *
 * Every row carries the line it came off, verbatim, so what was guessed can be
 * checked against what was written. What this cannot read it leaves out
 * rather than guessing at — a rate with no currency sign, a sentence with a
 * price but no weight and no word for shipping — and a seller whose terms say
 * "please ask for a quote" yields nothing, which is the truth.
 */

/** One rate read off a seller's shipping terms. */
export interface ShippingCost {
  /**
   * Where the rate applies, as the seller wrote it — `EU countries`, `Rest of
   * World`, `Zone 0: Österreich (Austria)`. The heading the line sat under,
   * or the words the line itself led with. Absent where nothing said.
   */
  destination?: string
  /** What the line called the rate, where it named it — `DHL Paket`, `Medium Box`. */
  label?: string
  /** The heaviest order the rate covers, in grams. */
  maxWeight?: number
  /** The lightest order the rate starts at, in grams — `over 4000g`, `16+ oz`. */
  minWeight?: number
  /** The rate itself. Nought where the line says postage is free. */
  cost: number
  /** ISO code where the sign said one — `EUR`, `USD`, `GBP`, `CHF`. */
  currency?: string
  /** The dearest order the rate applies to, where the line bounds it by value. */
  maxValue?: number
  /** The order value the rate starts at — `ab 70 Euro`, `orders over $50`. */
  minValue?: number
  /** The line it was read off, as written. */
  source: string
}

/** What the parse can be told about the seller, to read a bare sign by. */
export interface TermsContext {
  /**
   * The currencies the seller accepts, ISO codes. A bare `$` is read as the
   * dollar they take where they take exactly one; otherwise as US dollars.
   */
  currencies?: string[]
}

/*
 * The HTML the terms arrive as, made into lines.
 *
 * The block tags become line breaks and the cells of a table become spaces,
 * because that is the shape the rates are written in: one rate per row or per
 * paragraph, a weight in one cell and a price in the next. Everything else
 * is text, entities decoded.
 */
const BREAKS = /<\s*(?:br\s*\/?|\/p|\/div|\/li|\/tr|\/h[1-6]|\/table|\/ul|\/ol)\s*>/gi
const CELLS = /<\s*\/t[dh]\s*>/gi
const TAGS = /<[^>]+>/g
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  euro: '€',
  pound: '£',
  ndash: '–',
  mdash: '—'
}

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

/**
 * The terms as text, one line per block, blank lines dropped.
 *
 * What the policy stores and what the parse reads: the HTML is the seller's
 * formatting and nothing else, and a rate is the same rate in a table cell or
 * a paragraph.
 */
export function termsText(html: string | null | undefined): string {
  // Whitespace first: a newline in the HTML source is the seller's editor
  // wrapping a paragraph, and only a block tag is a line.
  const flat = String(html ?? '').replace(/\s+/g, ' ')
  return decode(flat.replace(BREAKS, '\n').replace(CELLS, ' ').replace(TAGS, ' '))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/*
 * The tokens a rate is made of.
 *
 * A number as sellers write one — `6,61`, `10.90`, `13`, and the Dutch `0,-`
 * — and a currency sign either side of it. The sign is required: a bare
 * `13,50` on a line is as often a weight as a price, and a number this cannot
 * read is one it must not read.
 */
const NUMBER = String.raw`\d{1,4}(?:[.,]\d{1,2})?|\d{1,4},-`
const SIGN = String.raw`US ?\$|CA ?\$|AU ?\$|NZ ?\$|€|\$|£|EUR|USD|GBP|CHF|CAD|AUD|NZD|Euros?`
// Bounded by non-letters either side: read case-insensitively, `US $` is
// otherwise the tail of `plus $1.50`.
const AMOUNT = new RegExp(
  String.raw`(?<![\p{L}\d])(?:(${SIGN})\s?(${NUMBER})|(${NUMBER})\s?(${SIGN}))(?![\p{L}\d])`,
  'giu'
)

const WEIGHT = new RegExp(
  String.raw`(\d+(?:[.,]\d+)?)\s*(\+)?\s*(?:(?:[-–—]|to|bis|à|tot)\s*(\d+(?:[.,]\d+)?)\s*)?` +
    String.raw`(kg|kilos?|grams?|gramm|gr|g|ounces?|oz|pounds?|lbs?)\b`,
  'gi'
)

/** Grams per unit, the ounce and the pound rounded to what a scale would say. */
const GRAMS: Record<string, number> = {
  kg: 1000,
  kilo: 1000,
  kilos: 1000,
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  gramm: 1,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6
}

/**
 * A regular expression matching any of the words, whole. Case-insensitive
 * unless the flags say otherwise — `US` is a place only as capitals.
 *
 * Not `\b`, which in JavaScript knows only ASCII letters — `\büber\b` never
 * matches, there being no boundary it can see beside a `ü` — but the same
 * idea spelt in Unicode: nothing letter-like on either side.
 */
export function words(list: string[], flags = 'giu'): RegExp {
  return new RegExp(String.raw`(?<![\p{L}\d])(?:${list.join('|')})(?![\p{L}\d])`, flags)
}

/** The words that turn a number into a floor rather than a ceiling. */
const FROM = words([
  'over', 'above', 'more than', 'from', 'ab', 'über', 'ueber', 'à partir de', 'a partir de', 'vanaf', 'boven',
  'plus de', 'minimum', 'min\\.?', 'mindestens', 'au-dessus', 'au dessus', 'oltre', 'superiore', 'desde',
  'más de', 'starting at', 'starts at'
])

/** And the words that make it a ceiling — the default, so these only outrank a floor word. */
const UP_TO = words([
  'up to', 'upto', 'under', 'below', 'less than', 'unter', 'bis', 'bis zu', 'maximum', 'max\\.?', 'maximal',
  "jusqu'à", "jusqu'a", 'tot', 'tot en met', 'onder', 'hasta', 'fino a', 'until', 'within', 'not exceeding'
])

/** The words that say a number bounds an order's value, not its weight. */
const VALUE = words([
  'value', 'worth', 'order', 'orders', 'subtotal', 'total', 'purchase', 'Warenwert', 'Bestellwert', 'Einkauf',
  'Einkaufswert', 'Bestellung', 'Warenkorbwert', 'waarde', 'orderwaarde', 'bestelwaarde', 'orderbedrag',
  'bestelbedrag', 'bestelling', 'achat', 'commande', 'valeur', 'valore', 'ordine', 'pedido', 'valor',
  'min(?:imum)?\\.?', 'max(?:imum)?\\.?', 'mindest'
])

/** The words that make an amount an extra on top of the postage, not the postage. */
const SURCHARGE = /(?:(?<![\p{L}\d])(?:plus|zzgl\.?|zuzüglich|zusätzlich|additional|extra|supplément|supplement|toeslag)|\+)\s*$/iu

/** A line that says postage costs nothing, usually over some value. */
const FREE = words([
  'free', 'kostenlos', 'kostenfrei', 'gratis', 'gratuit', 'offert', 'offerts', 'portofrei', 'versandkostenfrei'
])

/** What a line has to mention to be read as a rate when it names no weight. */
const SHIPPING = words([
  'ship', 'ships', 'shipping', 'shipped', 'postage', 'post', 'versand', 'versandkosten', 'porto', 'verzending',
  'verzendkosten', 'verzenden', 'frais', 'port', 'envoi', 'colis', 'paket', 'pakket', 'parcel', 'letter',
  'brief', 'lettre', 'mail', 'packet', 'package', 'box', 'envelope', 'padded', 'delivery', 'livraison',
  'spedizione', 'envío', 'envio', 'correo', 'flat fee', 'flat rate', 's&h'
])

/** What a line has to mention to be left alone: a charge that is not the postage. */
const NOT_POSTAGE = words([
  'insurance', 'versicherung', 'assurance', 'verzekering', 'assicurazione', 'seguro', 'handling fee',
  'handling fees', 'bearbeitungsgebühr', 'fee per lot', 'per lot', 'pro lot'
])

/*
 * The names of places, for telling a heading from any other short line.
 *
 * Two lists because case matters for the short ones: `EU`, `UK` and `US` are
 * destinations only as capitals, `us` being in "contact us". The long list is
 * read either way. Not every country — the directory has two hundred — but
 * the ones sellers group their rates by, in the languages they write in.
 */
const PLACES = words(
  [
    'world', 'worldwide', 'weltweit', 'international', 'internationaal', 'rest of', 'overseas', 'abroad', 'ausland',
    'europe', 'europa', 'european', 'europäische', 'europese', 'domestic', 'inland', 'inländisch', 'binnenland',
    'national', 'usa', 'u\\.s\\.a?\\.?', 'united states', 'canada', 'kanada', 'united kingdom', 'great britain',
    'australia', 'australien', 'new zealand', 'asia', 'asien', 'africa', 'afrika', 'america', 'amerika',
    'oceania', 'middle east', 'österreich', 'oesterreich', 'austria', 'autriche', 'deutschland', 'germany',
    'allemagne', 'nederland', 'netherlands', 'holland', 'belgi[eë]', 'belgium', 'belgique', 'france',
    'frankreich', 'schweiz', 'switzerland', 'suisse', 'italy', 'italia', 'italien', 'italie', 'españa',
    'spain', 'spanien', 'espagne', 'portugal', 'poland', 'polska', 'polen', 'pologne', 'sweden', 'schweden',
    'sverige', 'norway', 'norwegen', 'norge', 'denmark', 'dänemark', 'danmark', 'finland', 'ireland',
    'irland', 'japan', 'china', 'korea', 'singapore', 'hong kong', 'taiwan', 'mexico', 'brazil', 'brasil',
    'argentina', 'chile', 'india', 'russia', 'ukraine', 'czech', 'slovakia', 'hungary', 'romania',
    'bulgaria', 'greece', 'croatia', 'slovenia', 'luxembourg', 'luxemburg', 'liechtenstein', 'efta',
    'scandinavia', 'benelux', 'zone \\d+'
  ]
)
const SHORT_PLACES = /(?<![\p{L}\d])(?:EU|UK|USA?|US\/CA)(?![\p{L}\d])/u

/** Whether a regular expression built with the `g` flag matches, without the flag's memory of where it last did. */
function has(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0
  return pattern.test(text)
}

function isPlace(text: string): boolean {
  return has(PLACES, text) || SHORT_PLACES.test(text)
}

/** Whether the words before a number make it a floor: the nearest qualifier wins. */
function isFloor(before: string): boolean {
  const floor = lastIndexOf(FROM, before)
  const ceiling = lastIndexOf(UP_TO, before)
  return floor !== -1 && floor > ceiling
}

function lastIndexOf(pattern: RegExp, text: string): number {
  let at = -1
  for (const hit of text.matchAll(pattern)) {
    at = hit.index ?? at
  }
  return at
}

/**
 * The longest a line can be and still be read as a heading over the rates
 * below it — a colon at the end of a sentence is not a heading.
 */
const HEADING_MAX = 60

/** As far around an amount as the words that qualify it are looked for. */
const WINDOW = 28

function toNumber(text: string): number {
  return Number(text.replace(',-', '').replace(',', '.'))
}

function toGrams(text: string, unit: string): number {
  return Math.round(toNumber(text) * GRAMS[unit.toLowerCase()])
}

/**
 * The ISO code a sign stands for, read by the seller's own currencies where it
 * is only a dollar.
 *
 * Also what the sign in front of a converted price means — `US $` off
 * `US $0.13` is USD — which is how a rate's currency and an order's are told
 * to be the same one.
 */
export function currencyOf(sign: string, context: TermsContext = {}): string {
  const bare = sign.replace(/\s/g, '').toUpperCase()
  if (bare === '€' || bare.startsWith('EURO')) {
    return 'EUR'
  }
  if (bare === '£') {
    return 'GBP'
  }
  if (bare === '$') {
    const dollars = (context.currencies ?? []).filter((code) => ['USD', 'CAD', 'AUD', 'NZD'].includes(code))
    return dollars.length === 1 ? dollars[0] : 'USD'
  }
  if (bare.endsWith('$')) {
    return bare.slice(0, 2) + 'D'
  }
  return bare
}

interface Amount {
  at: number
  end: number
  value: number
  currency: string
  /** Whether the words around it say it bounds the order's value rather than prices the postage. */
  threshold: boolean
  /** For a threshold: whether it is a floor (`over`, `ab`) rather than a ceiling. */
  from: boolean
  /** Whether it is charged on top — `plus $1.50`, `+12 EUR for insurance`. */
  surcharge: boolean
}

interface Weight {
  at: number
  end: number
  min?: number
  max?: number
}

function amountsOf(line: string, context: TermsContext): Amount[] {
  const hits = [...line.matchAll(AMOUNT)]
  return hits.map((hit, index) => {
    const sign = hit[1] ?? hit[4]
    const number = hit[2] ?? hit[3]
    const at = hit.index ?? 0
    const end = at + hit[0].length
    // The words around it, but not past the amounts either side: `maximum
    // waarde van € 25,- betaald u € 3,-` says the 25 is a value and the 3 is
    // not, and a window that ran back over the 25 would read both as values.
    const previous = index ? (hits[index - 1].index ?? 0) + hits[index - 1][0].length : 0
    const next = index + 1 < hits.length ? (hits[index + 1].index ?? line.length) : line.length
    const before = line.slice(Math.max(previous, at - WINDOW), at)
    const after = line.slice(end, Math.min(next, end + WINDOW))
    return {
      at,
      end,
      value: toNumber(number),
      currency: currencyOf(sign, context),
      threshold: has(VALUE, before) || has(VALUE, after),
      from: isFloor(before),
      surcharge: SURCHARGE.test(before)
    }
  })
}

function weightsOf(line: string): Weight[] {
  const out: Weight[] = []
  for (const hit of line.matchAll(WEIGHT)) {
    const [, first, plus, second, unit] = hit
    const at = hit.index ?? 0
    const before = line.slice(Math.max(0, at - WINDOW), at)
    const weight: Weight = {
      at,
      end: at + hit[0].length
    }
    if (second !== undefined) {
      // A range: `0-6 Ounces`, `from 2-4 kg`. Nought is no floor at all.
      const low = toGrams(first, unit)
      weight.max = toGrams(second, unit)
      if (low > 0) {
        weight.min = low
      }
    } else if (plus || isFloor(before)) {
      weight.min = toGrams(first, unit)
    } else {
      weight.max = toGrams(first, unit)
    }
    out.push(weight)
  }
  return out
}

/** The text before the first token on a line, trimmed of what punctuates it. */
function leadOf(line: string, firstAt: number): string {
  let lead = line.slice(0, firstAt).trim()
  // `USA: The minimum order value is currently 200 Euro` — the name is what
  // stands before the colon, not the sentence after it.
  const colon = lead.indexOf(':')
  if (colon !== -1) {
    lead = lead.slice(0, colon)
  }
  return lead.replace(/[\s:\-–—,;]+$/u, '').trim()
}

/**
 * Whether a line with nothing priced on it is a heading over the rates below.
 *
 * Either it ends in a colon, as a heading over a list does, or it is short
 * and names a place — `Rest of World`, `Pour La France`. An aside in
 * parentheses is neither, whatever place it mentions.
 */
function isHeading(line: string): boolean {
  if (line.length > HEADING_MAX) {
    return false
  }
  if (/:\s*$/.test(line) || /^zone\s*\d/iu.test(line)) {
    return true
  }
  return (line.includes(':') || line.length <= 50) && !line.startsWith('(') && isPlace(line)
}

/**
 * What a heading names: the whole of it, or what stands before its colon
 * where that is the place — `Shipping within EUROPE : as "letter"` is
 * Europe. A zone keeps what follows its colon, that being the places it is.
 */
function destinationOf(heading: string): string {
  const colon = heading.indexOf(':')
  if (colon !== -1 && !/^zone\s*\d/iu.test(heading)) {
    const before = heading.slice(0, colon).trim()
    if (isPlace(before)) {
      return before
    }
  }
  return heading.replace(/\s*:\s*$/, '').trim()
}

/** Whether the lead of a rate line names where to, rather than what by. */
function isDestination(lead: string): boolean {
  return lead.length > 0 && lead.length <= 40 && isPlace(lead)
}

/**
 * The words a rate line leads with that say nothing about what the rate is
 * for — `bis`, `up to`, `from 2 to` — so a label is what is left after them.
 */
const QUALIFIERS = words([
  'up', 'to', 'bis', 'von', 'from', 'over', 'above', 'under', 'unter', "jusqu'à", "jusqu'a", 'tot', 'vanaf', 'ab',
  'über', 'max\\.?', 'min\\.?', 'maximum', 'minimum', 'poids', 'weight', 'gewicht', 'and', 'und', 'en', 'et',
  'the', 'der', 'die', 'das', 'for', 'für', 'voor', 'pour', 'of', 'at', 'is', 'are', 'ist', 'sind', 'starts',
  'start', 'starting', 'costs', 'cost', 'kostet', 'kosten', 'bedraagt', 'coûte', 'will', 'be', 'a', 'flat',
  'fee', 'rate'
])

function labelOf(lead: string): string | undefined {
  const words = lead.replace(QUALIFIERS, ' ').replace(/[\s:\-–—,;()]+/gu, ' ').trim()
  if (!/\p{L}{2}/u.test(words)) {
    return undefined
  }
  return lead.length <= 40 ? lead : undefined
}

/**
 * The rates in a seller's shipping terms, as far as they can be read.
 *
 * `terms` is the text form — see [termsText] — and comes back as the rows
 * described at the top of this file. Nothing is thrown: terms this cannot
 * read are an empty answer.
 */
export function parseShippingCosts(terms: string, context: TermsContext = {}): ShippingCost[] {
  const out: ShippingCost[] = []
  let destination: string | undefined
  for (const line of terms.split('\n')) {
    const amounts = amountsOf(line, context)
    if (!amounts.length) {
      if (isHeading(line)) {
        destination = destinationOf(line)
      }
      continue
    }
    const weights = weightsOf(line)
    const thresholds = amounts.filter((amount) => amount.threshold && !amount.surcharge)
    const charges = amounts.filter((amount) => !amount.threshold && !amount.surcharge)
    const free = has(FREE, line)
    if (!charges.length && !free) {
      // Only order values on the line — a minimum order, a discount over a
      // value — and nothing said about being free above it.
      continue
    }
    if (has(NOT_POSTAGE, line) && !weights.length) {
      continue
    }
    if (!weights.length && !free && !has(SHIPPING, line)) {
      continue
    }

    const firstAt = Math.min(...amounts.map((amount) => amount.at), ...weights.map((weight) => weight.at))
    const lead = leadOf(line, firstAt)
    let label: string | undefined
    if (isDestination(lead)) {
      destination = lead
    } else {
      label = labelOf(lead)
    }

    const bounds: Pick<ShippingCost, 'minValue' | 'maxValue'> = {}
    for (const threshold of thresholds) {
      if (threshold.from) {
        bounds.minValue = threshold.value
      } else {
        bounds.maxValue = threshold.value
      }
    }

    const row = (charge: Amount | undefined, weight: Weight | undefined): ShippingCost => ({
      ...(destination ? {
        destination 
      } : {}),
      ...(label ? {
        label 
      } : {}),
      ...(weight?.max !== undefined ? {
        maxWeight: weight.max 
      } : {}),
      ...(weight?.min !== undefined ? {
        minWeight: weight.min 
      } : {}),
      cost: charge ? charge.value : 0,
      ...(charge ? {
        currency: charge.currency 
      } : thresholds[0] ? {
        currency: thresholds[0].currency 
      } : {}),
      ...bounds,
      source: line
    })

    if (charges.length > 1 && charges.length === weights.length) {
      // A table written across: `0-8 oz $13 8-16 oz $15 16-32 oz $20`. Each
      // weight is priced by the amount that follows it.
      weights.forEach((weight, index) => out.push(row(charges[index], weight)))
      continue
    }
    // One rate on the line. Where several amounts survive — `$5.85 $1.50
    // $7.35`, a cost, a handling charge and their total — the biggest is the
    // one the buyer pays, whether or not the seller added them up.
    const charge = charges.length
      ? charges.reduce((most, one) => (one.value > most.value ? one : most))
      : undefined
    if (charge === undefined && !free) {
      continue
    }
    out.push(row(charge, weights[0]))
  }
  return out
}
