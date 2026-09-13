/**
 * Reading shipping rates out of the prose sellers write about them.
 *
 * The fixtures are real `policy.ajax` answers, trimmed to the shipping half:
 * the general terms are dropped and the list of countries cut short. Seven
 * sellers, chosen for writing their rates seven different ways — a German
 * bulk seller with weight bands per zone in English, an Austrian one with
 * zones and `bis 1 kg: €6,61`, two Americans in ounces (one in prose, one in
 * a cost/handling/total table), a Dutch seller in sentences, and a French
 * one in HTML tables — so that what passes here is the shape of the writing
 * and not one seller's habits.
 *
 * A heuristic is tested on what it gets right and on what it leaves alone,
 * and the second matters as much: every wrong rate is a wrong number beside
 * a seller's name.
 */
import { describe, it, expect } from 'vitest'
import { parseShippingCosts, termsText } from '../shipping-terms'
import type { ShippingCost } from '../shipping-terms'
import BUNTE from './fixtures/storePolicy-BunteSteinewelt.json'
import BERNIE from './fixtures/storePolicy-BernieR.json'
import BIGAS from './fixtures/storePolicy-bigasbricks.json'
import BRICKTROPOLIS from './fixtures/storePolicy-Brick_OnTheRed.json'
import MARVLIN from './fixtures/storePolicy-MarVLin.json'
import GARRETT from './fixtures/storePolicy-garrett19.json'
import MURAUER from './fixtures/storePolicy-murauer77.json'

function ratesOf(policy: { sellerTermsShipping: string; acceptedCurrencies: { code: string }[] }): ShippingCost[] {
  return parseShippingCosts(termsText(policy.sellerTermsShipping), {
    currencies: policy.acceptedCurrencies.map((currency) => currency.code)
  })
}

/** The rows without the line each came off, which is long and asserted separately. */
function bare(rates: ShippingCost[]): Omit<ShippingCost, 'source'>[] {
  return rates.map(({
    source: _source, ...rest 
  }) => rest)
}

describe('the terms as text', () => {
  it('breaks on block tags and nowhere else', () => {
    // The newlines in the source are the seller's editor wrapping a paragraph;
    // splitting on them put `up` and `to 1 kg: € 23,95` on different lines.
    expect(termsText('<p>up\n  to 1 kg: € 23,95</p><p>from 2 kg</p>')).toBe('up to 1 kg: € 23,95\nfrom 2 kg')
  })

  it('reads a table row as one line, cells apart', () => {
    expect(termsText('<tr><td>20g</td><td>1.99 €</td></tr><tr><td>100g</td><td>3.47 €</td></tr>')).toBe(
      '20g 1.99 €\n100g 3.47 €'
    )
  })

  it('decodes what the editor encoded', () => {
    expect(termsText('<p>5&nbsp;&euro; &amp; more &#8364;</p>')).toBe('5 € & more €')
  })
})

describe('weight bands under a heading', () => {
  it('reads German bands in English under zone headings', () => {
    const rates = ratesOf(BUNTE)
    // The EU block: three DHL bands and four DHL Express, all under the one
    // heading — the `DHL` and `DHL Express` lines between them are not
    // headings, naming no place.
    const eu = rates.filter((rate) => rate.destination === 'EU countries')
    expect(bare(eu)).toEqual([
      {
        destination: 'EU countries',
        maxWeight: 750,
        cost: 10.9,
        currency: 'EUR',
        maxValue: 50 
      },
      {
        destination: 'EU countries',
        maxWeight: 4000,
        cost: 19.9,
        currency: 'EUR' 
      },
      {
        destination: 'EU countries',
        maxWeight: 26000,
        cost: 23.8,
        currency: 'EUR' 
      },
      {
        destination: 'EU countries',
        maxWeight: 4000,
        cost: 34.9,
        currency: 'EUR' 
      },
      {
        destination: 'EU countries',
        maxWeight: 8000,
        cost: 49.9,
        currency: 'EUR' 
      },
      {
        destination: 'EU countries',
        maxWeight: 16000,
        cost: 74.9,
        currency: 'EUR' 
      },
      {
        destination: 'EU countries',
        maxWeight: 26000,
        cost: 84.9,
        currency: 'EUR' 
      }
    ])
  })

  it('reads the order value as a bound and not as the price', () => {
    const rate = ratesOf(BUNTE).find((one) => one.source.startsWith('10.90 EUR'))!
    // `10.90 EUR (incl. VAT) up to 750g of shopping cart weight and value
    // under 50 EUR` — two amounts, and the second is what the order may be
    // worth, not what the postage costs.
    expect(rate.cost).toBe(10.9)
    expect(rate.maxValue).toBe(50)
  })

  it('leaves the insurance and the handling fee alone', () => {
    const rates = ratesOf(BUNTE)
    // `+12 EUR for insurance above 999,99 EUR per 1000 EUR value` and `Below
    // €1.00 per lot: €0.30 per lot` are charges, and neither is the postage.
    expect(rates.some((rate) => rate.source.includes('insurance'))).toBe(false)
    expect(rates.some((rate) => rate.source.includes('per lot'))).toBe(false)
    expect(rates.some((rate) => rate.cost === 12)).toBe(false)
  })

  it('names the domestic rate by what the line called it', () => {
    const rate = ratesOf(BUNTE).find((one) => one.label === 'DHL Paket')!
    expect(rate.destination).toBe('Versandkosten Deutschland')
    expect(rate.cost).toBe(6.9)
  })

  it('reads Austrian bands with a comma for the point, under numbered zones', () => {
    const rates = ratesOf(BERNIE)
    expect(bare(rates.filter((rate) => rate.destination === 'Zone 0: Österreich (Austria)'))).toEqual([
      {
        destination: 'Zone 0: Österreich (Austria)',
        maxWeight: 1000,
        cost: 6.61,
        currency: 'EUR' 
      },
      {
        destination: 'Zone 0: Österreich (Austria)',
        maxWeight: 2000,
        cost: 7.61,
        currency: 'EUR' 
      },
      {
        destination: 'Zone 0: Österreich (Austria)',
        maxWeight: 4000,
        minWeight: 2000,
        cost: 11.8,
        currency: 'EUR' 
      }
    ])
  })

  it('keeps the whole of a zone heading, the places being what follows the colon', () => {
    const rates = ratesOf(BERNIE)
    const zone4 = rates.filter((rate) => rate.destination === 'Zone 4: Asia, South America, Middle America, Africa')
    expect(zone4.map((rate) => rate.cost)).toEqual([23.95, 29.5, 39.95, 70])
    // `from 1 to 2 kg (value up to 50 EUR): € 29.50` — a range written with a
    // word between, and a value bound in brackets.
    expect(zone4[1]).toMatchObject({
      minWeight: 1000,
      maxWeight: 2000,
      maxValue: 50 
    })
  })

  it('leaves a rate with no currency sign and a band on inquiry alone', () => {
    const rates = ratesOf(BERNIE)
    // `Small Orders which only need very flat packaging: 13,50` states no
    // currency, and `from 2-4 kg (141 oz): on inquiery` no price.
    expect(rates.some((rate) => rate.cost === 13.5)).toBe(false)
    expect(rates.some((rate) => rate.source.includes('inquiery'))).toBe(false)
  })
})

describe('bands in ounces', () => {
  it('reads a flat fee per band, in grams', () => {
    const rates = ratesOf(BIGAS)
    const domestic = rates.filter((rate) => rate.destination?.includes('U.S.'))
    expect(bare(domestic)).toEqual([
      {
        destination: 'Shipping charges for orders in the U.S. are listed below',
        maxWeight: 170,
        cost: 7,
        currency: 'USD' 
      },
      {
        destination: 'Shipping charges for orders in the U.S. are listed below',
        minWeight: 198,
        maxWeight: 340,
        cost: 8,
        currency: 'USD' 
      },
      {
        destination: 'Shipping charges for orders in the U.S. are listed below',
        minWeight: 369,
        maxWeight: 453,
        cost: 9,
        currency: 'USD' 
      }
    ])
  })

  it('reads a country’s bands from a short line each, under the country', () => {
    const canada = ratesOf(BIGAS).filter((rate) => rate.destination === 'Canada')
    expect(canada.map((rate) => [rate.minWeight, rate.maxWeight, rate.cost])).toEqual([
      [undefined, 227, 13],
      [227, 454, 15],
      [454, 907, 20],
      [907, 1361, 24],
      [1361, 1814, 28]
    ])
    expect(ratesOf(BIGAS).filter((rate) => rate.destination === 'Rest of World').map((rate) => rate.cost)).toEqual([
      16, 22, 26, 34, 42
    ])
  })

  it('takes the total where a table states cost, handling and total', () => {
    const rates = ratesOf(BRICKTROPOLIS)
    // `1-4 ounces $5.85 $1.50 $7.35`: the buyer pays the last of the three.
    expect(rates.find((rate) => rate.source.includes('1-4 ounces'))!.cost).toBe(7.35)
    // And where the seller left the total off — `9 ounces $6.85 $1.50` —
    // the bigger figure, which is the postage.
    expect(rates.find((rate) => rate.source.includes('9 ounces'))!.cost).toBe(6.85)
  })

  it('leaves the packaging surcharge alone', () => {
    // `All orders will be charged actual postage plus $1.50` — an extra on
    // top, and read case-insensitively `US $` was the tail of `plus $`.
    expect(ratesOf(BRICKTROPOLIS).some((rate) => rate.cost === 1.5)).toBe(false)
  })

  it('names a rate with no band by what the row called it', () => {
    const boxes = ratesOf(BRICKTROPOLIS).filter((rate) => rate.maxWeight === undefined)
    expect(bare(boxes)).toEqual([
      {
        destination: 'United States First Class',
        label: 'Priority Mail Padded',
        cost: 12.25,
        currency: 'USD' 
      },
      {
        destination: 'United States First Class',
        label: 'Medium Box',
        cost: 21,
        currency: 'USD' 
      },
      {
        destination: 'United States First Class',
        label: 'Large Box',
        cost: 29,
        currency: 'USD' 
      }
    ])
  })
})

describe('rates written as sentences', () => {
  it('reads a Dutch sentence with a weight, a value ceiling and a price', () => {
    const rates = ratesOf(MARVLIN)
    expect(bare(rates.slice(0, 4))).toEqual([
      {
        maxWeight: 50,
        cost: 3,
        currency: 'EUR',
        maxValue: 25 
      },
      {
        maxWeight: 10000,
        cost: 6,
        currency: 'EUR',
        maxValue: 50 
      },
      {
        maxWeight: 10000,
        cost: 8,
        currency: 'EUR',
        maxValue: 75 
      },
      // `MINIMUM waarde van € 75,- betaald u € 0,-`: free from there up.
      {
        maxWeight: 10000,
        cost: 0,
        currency: 'EUR',
        minValue: 75 
      }
    ])
  })

  it('reads free shipping over a value as a nought with a floor', () => {
    const rates = ratesOf(MARVLIN)
    expect(bare(rates.slice(4))).toEqual([{
      cost: 0,
      currency: 'EUR',
      minValue: 75 
    }])
    // And in German, on the same line as the heading that names where.
    const austria = ratesOf(MURAUER)[0]
    expect(austria).toMatchObject({
      destination: 'Versandkosten für ÖSTERREICH',
      cost: 0,
      minValue: 70 
    })
  })

  it('takes the place before a colon as where a heading is about', () => {
    const rates = ratesOf(MURAUER)
    // `Shipping within EUROPE : as "letter"; Airmail shipping`
    const europe = rates.filter((rate) => rate.destination === 'Shipping within EUROPE')
    expect(europe.map((rate) => [rate.maxWeight, rate.cost])).toEqual([
      [100, 6.9],
      [350, 8.9],
      [500, 10.9],
      [750, 11.9],
      [1000, 13.9]
    ])
  })

  it('reads a starting price under a country heading, the minimum order left as a bound', () => {
    const rates = ratesOf(MURAUER)
    const canada = rates.find((rate) => rate.destination === 'Canada')!
    // `The minimum order value is currently 100 Euro.` is on the line before
    // and prices nothing; `and starts at 23.50 Euro (for up to 1kg).` does.
    expect(canada).toMatchObject({
      cost: 23.5,
      maxWeight: 1000,
      currency: 'EUR' 
    })
    expect(canada.label).toBeUndefined()
    expect(rates.some((rate) => rate.cost === 100)).toBe(false)
  })
})

describe('rates in tables', () => {
  it('reads a French weight-and-price table under its heading', () => {
    const rates = ratesOf(GARRETT)
    expect(bare(rates.filter((rate) => rate.destination === 'Pour La France'))).toEqual([
      {
        destination: 'Pour La France',
        maxWeight: 20,
        cost: 1.99,
        currency: 'EUR' 
      },
      {
        destination: 'Pour La France',
        maxWeight: 100,
        cost: 3.47,
        currency: 'EUR' 
      },
      {
        destination: 'Pour La France',
        maxWeight: 250,
        cost: 5.68,
        currency: 'EUR' 
      },
      {
        destination: 'Pour La France',
        maxWeight: 500,
        cost: 7.71,
        currency: 'EUR' 
      },
      {
        destination: 'Pour La France',
        maxWeight: 1000,
        cost: 9.64,
        currency: 'EUR' 
      },
      {
        destination: 'Pour La France',
        maxWeight: 2000,
        cost: 11.56,
        currency: 'EUR' 
      }
    ])
    expect(rates.filter((rate) => rate.destination === 'For European Union and Switzerland').length).toBe(5)
  })
})

describe('what a line has to say to be read at all', () => {
  it('needs a currency sign', () => {
    expect(parseShippingCosts('up to 500g 13,50')).toEqual([])
  })

  it('needs a weight or a word for shipping beside a bare amount', () => {
    expect(parseShippingCosts('We charge $5.00 for gift wrapping')).toEqual([])
    expect(parseShippingCosts('Postage is $5.00')).toMatchObject([{
      cost: 5,
      currency: 'USD' 
    }])
  })

  it('reads a bare dollar as the one dollar the seller takes', () => {
    expect(parseShippingCosts('Postage is $5.00', {
      currencies: ['CAD'] 
    })[0].currency).toBe('CAD')
    expect(parseShippingCosts('Postage is $5.00', {
      currencies: ['CAD', 'USD'] 
    })[0].currency).toBe('USD')
    expect(parseShippingCosts('Postage is CA $5.00')[0].currency).toBe('CAD')
  })

  it('reads a floor where the band is open-ended', () => {
    expect(parseShippingCosts('over 4000g: 25 EUR')[0]).toMatchObject({
      minWeight: 4000,
      cost: 25 
    })
    expect(parseShippingCosts('64+ oz: $30')[0]).toMatchObject({
      minWeight: 1814,
      cost: 30 
    })
  })

  it('says nothing about terms that only ask for a quote', () => {
    expect(parseShippingCosts(termsText('<p>Please ask for a shipping quote.</p>'))).toEqual([])
    expect(parseShippingCosts('')).toEqual([])
  })
})
