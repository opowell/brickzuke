/**
 * Telling which of a seller's rates is the one for a country.
 *
 * The same seven sellers the parse is pinned against, asked the question the
 * parse cannot answer: what would each of them charge to post to Germany, to
 * Austria, to Switzerland, to Ohio? Every seller groups their rates by a
 * different geography — zones, blocs, continents, `Rest of World`, or no
 * heading at all — and a wrong reading here is a wrong figure beside a
 * seller's total, which is the number somebody compares sellers by.
 */
import { describe, it, expect } from 'vitest'
import { parseShippingCosts, termsText } from '../shipping-terms'
import type { ShippingCost } from '../shipping-terms'
import {BLOC,
  CONTINENT,
  COUNTRY,
  NONE,
  UNSAID,
  WORLD,
  destinationFit,
  postageTo,
  ratesTo} from '../shipping-match'
import type { Place } from '../shipping-match'
import BUNTE from './fixtures/storePolicy-BunteSteinewelt.json'
import BERNIE from './fixtures/storePolicy-BernieR.json'
import BIGAS from './fixtures/storePolicy-bigasbricks.json'
import BRICKTROPOLIS from './fixtures/storePolicy-Brick_OnTheRed.json'
import MARVLIN from './fixtures/storePolicy-MarVLin.json'
import GARRETT from './fixtures/storePolicy-garrett19.json'
import MURAUER from './fixtures/storePolicy-murauer77.json'

interface Fixture {
  sellerTermsShipping: string
  acceptedCurrencies: { code: string }[]
  shipCountries: { id: string }[]
}

/**
 * The seller's terms, posting everywhere unless told otherwise: the fixtures'
 * lists of countries are cut short at five, and read as they stand nearly
 * every seller would refuse nearly every order.
 */
function termsOf(policy: Fixture, listed = false) {
  return {
    shipsTo: listed ? policy.shipCountries.map((country) => country.id) : [],
    rates: parseShippingCosts(termsText(policy.sellerTermsShipping), {
      currencies: policy.acceptedCurrencies.map((currency) => currency.code)
    })
  }
}

const DE: Place = {
  code: 'DE',
  name: 'Germany',
  region: 'Europe'
}
const AT: Place = {
  code: 'AT',
  name: 'Austria',
  region: 'Europe'
}
const CH: Place = {
  code: 'CH',
  name: 'Switzerland',
  region: 'Europe'
}
const UK: Place = {
  code: 'UK',
  name: 'United Kingdom',
  region: 'Europe'
}
const FR: Place = {
  code: 'FR',
  name: 'France',
  region: 'Europe'
}
const NL: Place = {
  code: 'NL',
  name: 'Netherlands',
  region: 'Europe'
}
const US: Place = {
  code: 'US',
  name: 'USA',
  region: 'North America'
}
const CA: Place = {
  code: 'CA',
  name: 'Canada',
  region: 'North America'
}
const JP: Place = {
  code: 'JP',
  name: 'Japan',
  region: 'Asia'
}
const AU: Place = {
  code: 'AU',
  name: 'Australia',
  region: 'Oceania'
}
const BR: Place = {
  code: 'BR',
  name: 'Brazil',
  region: 'South America'
}

/** The rate as a short line: where, up to what weight, what it costs. */
function brief(rate: ShippingCost | undefined): unknown[] | undefined {
  return rate && [rate.destination, rate.maxWeight, rate.cost, rate.currency]
}

describe('how closely a heading fits', () => {
  it('ranks the country over the bloc over the continent over the world over nothing', () => {
    expect(destinationFit('Deutschland', DE)).toBe(COUNTRY)
    expect(destinationFit('EU countries', DE)).toBe(BLOC)
    expect(destinationFit('Europe', DE)).toBe(CONTINENT)
    expect(destinationFit('Rest of World', DE)).toBe(WORLD)
    expect(destinationFit(undefined, DE)).toBe(UNSAID)
    expect(destinationFit('', DE)).toBe(UNSAID)
  })

  it('names a country in the languages sellers write in', () => {
    expect(destinationFit('Versandkosten für ÖSTERREICH', AT)).toBe(COUNTRY)
    expect(destinationFit('Pour La France', FR)).toBe(COUNTRY)
    expect(destinationFit('Shipping charges for orders in the U.S. are listed below', US)).toBe(COUNTRY)
    expect(destinationFit('United States First Class', US)).toBe(COUNTRY)
    expect(destinationFit('Japan / South Korea / HK / Singapore / Taiwan', JP)).toBe(COUNTRY)
    expect(destinationFit('UK + EFTA countries', UK)).toBe(COUNTRY)
    expect(destinationFit('Zone 3: USA (suspended!) , Canada', CA)).toBe(COUNTRY)
  })

  it('reads the directory name for a country off the list', () => {
    const fiji: Place = {
      code: 'FJ',
      name: 'Fiji',
      region: 'Oceania'
    }
    expect(destinationFit('Fiji and Samoa', fiji)).toBe(COUNTRY)
  })

  it('knows the short names only as capitals', () => {
    // `us` is "contact us" and `eu` is French: neither is a place.
    expect(destinationFit('Please contact us', US)).toBe(NONE)
    expect(destinationFit('Envoi vers les pays que nous avons eu', DE)).toBe(NONE)
    expect(destinationFit('US', US)).toBe(COUNTRY)
    expect(destinationFit('EU-Ausland', DE)).toBe(BLOC)
  })

  it('reads a bloc as its members', () => {
    expect(destinationFit('Zone 1: European Union', FR)).toBe(BLOC)
    expect(destinationFit('Zone 1: European Union', CH)).toBe(NONE)
    expect(destinationFit('UK + EFTA countries', CH)).toBe(BLOC)
    expect(destinationFit('UK + EFTA countries', DE)).toBe(NONE)
    expect(destinationFit('For European Union and Switzerland', CH)).toBe(COUNTRY)
    expect(destinationFit('For European Union and Switzerland', NL)).toBe(BLOC)
    expect(destinationFit('Benelux', NL)).toBe(BLOC)
  })

  it('reads a continent by the region the directory names, or by a list where it names none', () => {
    expect(destinationFit('Zone 2: Rest of Europe', CH)).toBe(CONTINENT)
    expect(destinationFit('Shipping within EUROPE', DE)).toBe(CONTINENT)
    expect(destinationFit('Zone 4: Asia, South America, Middle America, Africa', JP)).toBe(CONTINENT)
    expect(destinationFit('Zone 4: Asia, South America, Middle America, Africa', BR)).toBe(CONTINENT)
    expect(destinationFit('Zone 5: Australia, New Zealand, Oceania', AU)).toBe(COUNTRY)
    expect(destinationFit('Europe', {
      code: 'RS'
    })).toBe(CONTINENT)
    expect(destinationFit('Europe', {
      code: 'JP'
    })).toBe(NONE)
    expect(destinationFit('Asia', {
      code: 'JP'
    })).toBe(NONE)
  })

  it('reads the seller\'s own country as domestic, and everyone else as international', () => {
    expect(destinationFit('Domestic', DE, DE)).toBe(COUNTRY)
    expect(destinationFit('Inland', DE, DE)).toBe(COUNTRY)
    expect(destinationFit('Domestic', AT, DE)).toBe(NONE)
    expect(destinationFit('International', AT, DE)).toBe(WORLD)
    expect(destinationFit('International', DE, DE)).toBe(NONE)
    expect(destinationFit('Ausland', AT, DE)).toBe(WORLD)
    // Without the seller's country there is no telling domestic; international
    // is taken as read, an order being far more often to somewhere else.
    expect(destinationFit('Domestic', DE)).toBe(NONE)
    expect(destinationFit('International', DE)).toBe(WORLD)
  })

  it('reads the world as everyone, the seller\'s own country included', () => {
    expect(destinationFit('World Wide', DE, DE)).toBe(WORLD)
    expect(destinationFit('Rest of World', JP)).toBe(WORLD)
    expect(destinationFit('Alle anderen Länder', JP)).toBe(WORLD)
  })

  it('rules a country out where the heading excepts it', () => {
    expect(destinationFit('Europe except UK', UK)).toBe(NONE)
    expect(destinationFit('Europe except UK', DE)).toBe(CONTINENT)
    expect(destinationFit('Weltweit außer USA', US)).toBe(NONE)
    expect(destinationFit('Worldwide excluding EU', FR)).toBe(NONE)
    expect(destinationFit('Worldwide excluding EU', CH)).toBe(WORLD)
  })
})

describe('the rates for a country', () => {
  it('takes the rates under the closest heading and no others', () => {
    const bernie = termsOf(BERNIE)
    expect(ratesTo(bernie.rates, AT, AT).map(brief)).toEqual([
      ['Zone 0: Österreich (Austria)', 1000, 6.61, 'EUR'],
      ['Zone 0: Österreich (Austria)', 2000, 7.61, 'EUR'],
      ['Zone 0: Österreich (Austria)', 4000, 11.8, 'EUR']
    ])
    expect(ratesTo(bernie.rates, DE, AT).map((rate) => rate.destination)).toEqual([
      'Zone 1: European Union',
      'Zone 1: European Union'
    ])
    expect(ratesTo(bernie.rates, CH, AT).map((rate) => rate.destination)).toEqual([
      'Zone 2: Rest of Europe',
      'Zone 2: Rest of Europe'
    ])
    expect(ratesTo(bernie.rates, CA, AT).map((rate) => rate.destination)).toEqual([
      'Zone 3: USA (suspended!) , Canada',
      'Zone 3: USA (suspended!) , Canada'
    ])
  })

  it('falls back to the rates under no heading', () => {
    const marvlin = termsOf(MARVLIN)
    expect(ratesTo(marvlin.rates, NL, NL)).toHaveLength(5)
  })

  it('has none where nothing fits', () => {
    const garrett = termsOf(GARRETT)
    expect(ratesTo(garrett.rates, US, FR)).toEqual([])
  })
})

describe('the postage a seller would charge', () => {
  it('is the cheapest rate to there, the order\'s weight being unknown', () => {
    expect(brief(rate(postageTo(termsOf(BERNIE), AT, AT)))).toEqual(['Zone 0: Österreich (Austria)', 1000, 6.61, 'EUR'])
    expect(brief(rate(postageTo(termsOf(BERNIE), DE, AT)))).toEqual(['Zone 1: European Union', 2000, 19.94, 'EUR'])
    expect(brief(rate(postageTo(termsOf(GARRETT), FR, FR)))).toEqual(['Pour La France', 20, 1.99, 'EUR'])
    expect(brief(rate(postageTo(termsOf(GARRETT), CH, FR)))).toEqual(['For European Union and Switzerland', 20, 4.99, 'EUR'])
    expect(brief(rate(postageTo(termsOf(BIGAS), CA, US)))).toEqual(['Canada', 227, 13, 'USD'])
    expect(brief(rate(postageTo(termsOf(BIGAS), JP, US)))).toEqual(['Rest of World', 227, 16, 'USD'])
  })

  it('says where the seller does not post to at all', () => {
    // Japan is not on the list: a rate under `Rest of World` would be a
    // figure for an order the seller will not take.
    expect(postageTo(termsOf(BRICKTROPOLIS, true), JP, US)).toEqual({
      kind: 'unshipped'
    })
    expect(postageTo(termsOf(BIGAS, true), AT, US).kind).toBe('rate')
    // Everywhere, having declared no list.
    expect(postageTo(termsOf(BUNTE), JP, DE).kind).toBe('rate')
  })

  it('says where no rate could be read for there', () => {
    expect(postageTo(termsOf(GARRETT), US, FR)).toEqual({
      kind: 'unread'
    })
    expect(postageTo({
      shipsTo: [],
      rates: []
    }, DE)).toEqual({
      kind: 'unread'
    })
  })

  it('leaves a rate that starts at an order value out until the order is known to reach it', () => {
    const murauer = termsOf(MURAUER)
    // Free over €70, else €5.99: without an order, the €5.99.
    expect(rate(postageTo(murauer, AT, AT))?.cost).toBe(5.99)
    expect(rate(postageTo(murauer, AT, AT, {
      value: 40,
      currency: 'EUR'
    }))?.cost).toBe(5.99)
    expect(rate(postageTo(murauer, AT, AT, {
      value: 90,
      currency: 'EUR'
    }))?.cost).toBe(0)
    // An order in another currency says nothing about whether it reaches €70.
    expect(rate(postageTo(murauer, AT, AT, {
      value: 90,
      currency: 'USD'
    }))?.cost).toBe(5.99)
  })

  it('drops a rate that stops at an order value once the order is past it', () => {
    const bunte = termsOf(BUNTE)
    // `up to 750g, order up to €50` is €10.90; over €50 the band starts at €19.90.
    expect(rate(postageTo(bunte, FR, DE))?.cost).toBe(10.9)
    expect(rate(postageTo(bunte, FR, DE, {
      value: 80,
      currency: 'EUR'
    }))?.cost).toBe(19.9)
  })
})

function rate(postage: ReturnType<typeof postageTo>): ShippingCost | undefined {
  return postage.kind === 'rate' ? postage.rate : undefined
}
