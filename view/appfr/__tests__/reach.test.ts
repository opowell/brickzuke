/**
 * The bite a query has on the types it cannot ask about directly.
 *
 * `region:"Europe"` is a question a country answers and a colour does not, and
 * appfr's rule for an unresolvable field is that it matches — so the wall used
 * to narrow its countries and leave every colour, category and year standing
 * beside them. What makes them answerable is the lot: one row of the store
 * inventories names the seller, the seller's country and region, the condition,
 * the colour, the item type and the item, so filtering the lots by the terms a
 * type cannot answer and reading the type off what survives is the join.
 *
 * The fixture is two sellers on two continents with one lot each, which is the
 * smallest thing that can tell a join from a filter: every colour and category
 * here is stored, so a card that still shows both is a card not joining.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getDbConnection } from '../../../idb/idb'
import { putAll } from '../../../idb/db'
import STORES from '../../../idb/stores'

vi.mock('../../../model', async () => {
  const {
    ref
  } = await import('vue')
  return {
    itemTypes: ref([]),
    processingCounts: ref(false),
    selectedCounts: ref({})
  }
})

/** How many times the fact table has been walked, counted at the source. */
const counter = vi.hoisted(() => ({
  walks: 0
}))

vi.mock('../catalogSource', async (importOriginal) => {
  const original = await importOriginal<typeof import('../catalogSource')>()
  return {
    ...original,
    eachLot: (visit: Parameters<typeof original.eachLot>[0]) => {
      counter.walks++
      return original.eachLot(visit)
    }
  }
})

const {
  previewFor
} = await import('../catalogPreviews')

// The lots are read through the item page's store as well as the seller's, so
// the fact table needs somewhere to read from even when that half is empty.
beforeAll(async () => {
  setActivePinia(createPinia())
  const db = await getDbConnection()
  await putAll(db, STORES.COLORS, [
    {
      id: 3,
      name: 'Tan'
    },
    {
      id: 5,
      name: 'Chartreuse'
    }
  ])
  await putAll(db, STORES.BRICK_LINK_COLORS, [
    {
      colorId: '2',
      bzColorId: 3,
      'Color Name': 'Tan',
      Parts: '900'
    },
    {
      colorId: '77',
      bzColorId: 5,
      'Color Name': 'Chartreuse',
      Parts: '12'
    }
  ])
  await putAll(db, STORES.CATEGORIES, [
    {
      id: 1
    },
    {
      id: 2
    }
  ])
  await putAll(db, STORES.BRICK_LINK_CATEGORIES, [
    {
      categoryId: '5',
      bzCategoryId: 1,
      catType: 'P',
      'Category Name': 'Brick',
      items: 4_000
    },
    {
      categoryId: '7',
      bzCategoryId: 2,
      catType: 'P',
      'Category Name': 'Plate',
      items: 1_500
    }
  ])
  // Two types, of which the lots below reach only one — a set is catalogued
  // here and nobody on the fixture has one for sale.
  await putAll(db, STORES.ITEM_TYPES, [
    {
      id: 7,
      name: 'Part'
    },
    {
      id: 8,
      name: 'Set'
    }
  ])
  await putAll(db, STORES.BRICK_LINK_ITEM_TYPES, [
    {
      itemTypeId: 'P',
      bzItemTypeId: 7,
      'Item Type Name': 'Part'
    },
    {
      itemTypeId: 'S',
      bzItemTypeId: 8,
      'Item Type Name': 'Set'
    }
  ])
  // The two items the lots below are of, each in its own category and year.
  await putAll(db, STORES.BRICK_LINK_ITEMS, [
    {
      id: 'P-3001',
      bzItemId: 10,
      itemType: 'P',
      Name: 'Brick 2 x 4',
      Number: '3001',
      categoryId: '5',
      'Category ID': '5',
      'Year Released': '1978'
    },
    {
      id: 'P-3020',
      bzItemId: 11,
      itemType: 'P',
      Name: 'Plate 2 x 4',
      Number: '3020',
      categoryId: '7',
      'Category ID': '7',
      'Year Released': '1995'
    }
  ])
  // A lot names a seller and nothing more; the region comes off the directory,
  // seller to country to region, which is why both of those are stored too.
  await putAll(db, STORES.STORE_COUNTRIES, [
    {
      countryCode: 'DE',
      countryName: 'Germany',
      regionId: 'Europe',
      groupState: 'N',
      image: '',
      storeCount: 1
    },
    {
      countryCode: 'US',
      countryName: 'United States',
      regionId: 'Americas',
      groupState: 'N',
      image: '',
      storeCount: 1
    }
  ])
  await putAll(db, STORES.BRICK_LINK_STORES, [
    {
      id: 'berlinbricks',
      name: 'Berlin Bricks',
      countryID: 'DE'
    },
    {
      id: 'texasbricks',
      name: 'Texas Bricks',
      countryID: 'US'
    }
  ])
  await putAll(db, STORES.STORE_LOTS, [
    {
      id: 'lot-de',
      store: 'berlinbricks',
      record: 'P-3001',
      itemType: 'P',
      itemNumber: '3001',
      colorId: '2',
      condition: 'N',
      quantity: 4,
      price: 0.1,
      displayPrice: 'EUR 0.10'
    },
    {
      id: 'lot-us',
      store: 'texasbricks',
      record: 'P-3020',
      itemType: 'P',
      itemNumber: '3020',
      colorId: '77',
      condition: 'U',
      quantity: 2,
      price: 0.2,
      displayPrice: 'US $0.20'
    }
  ])
  db.close()
})

/** What a card shows, as the names on it. */
async function labels(entity: string, expr: string): Promise<string[]> {
  return (await previewFor(entity, expr)).tiles.map((tile) => tile.label)
}

describe('a colour under a term a colour cannot answer', () => {
  it('is only the colours a seller in that region stocks', async () => {
    // Tan is the German seller's lot; Chartreuse is the Texan's. Without the
    // join `region:` resolves against nothing a colour carries and both stand.
    expect(await labels('colors', 'region:"Europe"')).toEqual(['Tan'])
  })

  it('is the other one on the other side of the world', async () => {
    expect(await labels('colors', 'region:"Americas"')).toEqual(['Chartreuse'])
  })

  it('counts what it reaches rather than the population', async () => {
    const preview = await previewFor('colors', 'region:"Europe"')
    expect(preview.count).toBe(1)
  })

  it('says the count is a floor, the lots being a fraction of the ones there are', async () => {
    // The `~` the store fill already uses for a projection: more lots reach
    // more colours, so a joined number is what is known and not what is so.
    expect((await previewFor('colors', 'region:"Europe"')).estimated).toBe(true)
  })

  it('leaves every colour standing when nothing is asked', async () => {
    // No term, no join: the card is the whole type, as it always was.
    expect((await labels('colors', '')).sort()).toEqual(['Chartreuse', 'Tan'])
  })

  it('leaves the count alone when the type can answer for itself', async () => {
    // `name:` is a colour's own field, so this is the ordinary filter and the
    // number is a tally rather than a floor.
    const preview = await previewFor('colors', 'name:"Tan"')
    expect(preview.tiles.map((tile) => tile.label)).toEqual(['Tan'])
    expect(preview.estimated).toBeUndefined()
  })
})

describe('a category under a term a category cannot answer', () => {
  it('is only the categories reachable through that region, item by item', async () => {
    // The hop a colour does not need: a lot names its record, and the
    // catalogue says which category that record is in. Brick is the German
    // seller's; Plate is the Texan's.
    expect(await labels('categories', 'region:"Europe"')).toEqual(['Brick (1)'])
  })

  it('follows the country as readily as the region', async () => {
    expect(await labels('categories', 'country:"US"')).toEqual(['Plate (2)'])
  })

  it('follows a term about the lot itself', async () => {
    // `condition:` is no more a category's field than `region:` is, and it
    // joins the same way: the used lot is the Texan's Plate.
    expect(await labels('categories', 'condition:"U"')).toEqual(['Plate (2)'])
  })
})

describe('the items card, which is a scan rather than a list', () => {
  it('is the items a seller in that region actually has', async () => {
    // The card that used to sit at the whole catalogue under a term no item
    // carries: it takes a different path from every other card, so the join
    // had to be applied inside it rather than around it.
    expect(await labels('items', 'region:"Europe"')).toEqual(['Brick 2 x 4'])
  })

  it('is the other one across the ocean', async () => {
    expect(await labels('items', 'region:"Americas"')).toEqual(['Plate 2 x 4'])
  })

  it('counts what it reaches, and says the number is a floor', async () => {
    const preview = await previewFor('items', 'region:"Europe"')
    expect(preview.count).toBe(1)
    expect(preview.estimated).toBe(true)
  })
})

describe('the types a lot speaks for directly', () => {
  it('narrows the item types to the ones on offer there', async () => {
    // Both lots are parts, and a set is catalogued that nobody stocks — so the
    // sets drop out and the card is the one type actually reachable.
    expect(await labels('itemTypes', 'region:"Europe"')).toEqual(['Part'])
  })

  it('narrows the countries to the ones with a seller in that region', async () => {
    expect(await labels('countries', 'region:"Americas"')).toEqual(['United States'])
  })
})

describe('a floor that has met its ceiling', () => {
  it('drops the `~` once the join reaches every record the type has', async () => {
    // Both lots are parts, and between them they are every colour the fixture
    // catalogues — so `type:"P"` reaches all of them and there is nothing left
    // for the next seller's lots to add. A number that cannot rise is not an
    // estimate, however it was arrived at.
    const preview = await previewFor('colors', 'type:"P"')
    expect((await labels('colors', 'type:"P"')).sort()).toEqual(['Chartreuse', 'Tan'])
    expect(preview.count).toBe(2)
    expect(preview.estimated).toBeUndefined()
  })

  it('keeps it where the join is still leaving records out', async () => {
    // The item types under the same region: a Set is catalogued that neither
    // seller stocks, so one of the two is reached and the count can still climb.
    const preview = await previewFor('itemTypes', 'region:"Europe"')
    expect(preview.count).toBe(1)
    expect(preview.estimated).toBe(true)
  })
})

describe('the walk behind the wall', () => {
  it('is one for every card that asks the same question of it', async () => {
    // Six cards, one term, one walk. The filter differs by type — what a year
    // cannot answer is not what a condition cannot answer — but a lot that
    // survives a filter says which colour, condition, type and item it is all
    // at once, so the types sharing a filter share the walk.
    //
    // A region nobody in the fixture sells from, so both caches are cold for it.
    counter.walks = 0
    await Promise.all(
      ['colors', 'categories', 'years', 'itemTypes', 'conditions', 'items'].map((entity) =>
        previewFor(entity, 'region:"Asia"')
      )
    )
    expect(counter.walks).toBe(1)
  })

  it('is none at all for a type that answers the query itself', async () => {
    // A country carries its own region, so there is nothing to join and nothing
    // to walk — the card filters its own rows as it always did.
    counter.walks = 0
    await previewFor('countries', 'region:"Africa"')
    expect(counter.walks).toBe(0)
  })
})
