/**
 * Reading a `catalogTree.asp` page.
 *
 * The tree is fetched one item type at a time, and it is the only page that
 * ever says which type a category is listed under. So what is worth pinning is
 * that it says it for a category that is already stored: the categories
 * download files them first, and a record it created is one this page has to
 * fill in rather than skip. Skipping it left most of the catalogue's
 * categories carrying an item count and no type, which is a category the item
 * types table cannot count.
 *
 * The markup is a reduction of the page rather than a capture of one — the
 * table the extractors key on, with the surrounding chrome dropped.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'
import catalogTreePage from '../catalog-tree-page'
import type { BrickLinkCategory } from '../catalog-download-page'
import { get, putAll } from '../../../../idb/db'
import { getDbConnection } from '../../../../idb/idb'
import STORES from '../../../../idb/stores'

function row(catType: string, catString: string, name: string, items: string) {
  return (
    `<A HREF='/catalogList.asp?catType=${catType}&catString=${catString}'>${name}</A> ` +
    `<span class="catalog-tree__category-count">(${items})</span><BR>`
  )
}

const PAGE =
  "<table class='bg-color--white catalog-list__category-list--internal " +
  "catalog-tree__category-list--internal'>" +
  row('P', '5', 'Brick', '4000') +
  row('P', '6', 'Plate', '1500') +
  '</table>'

async function stored(categoryId: string) {
  const db = await getDbConnection()
  const category = await get<BrickLinkCategory>(db, STORES.BRICK_LINK_CATEGORIES, categoryId)
  db.close()
  return category
}

beforeAll(async () => {
  const db = await getDbConnection()
  // Category 5 the way the download leaves it: a name and no type.
  await putAll(db, STORES.BRICK_LINK_CATEGORIES, [
    {
      categoryId: '5',
      bzCategoryId: 1,
      'Category Name': 'Brick'
    }
  ])
  db.close()
  await catalogTreePage.handlePageResponse({
    request: {
      url: 'https://www.bricklink.com/catalogTree.asp?itemType=P',
      call: 'x',
      type: 'x',
      options: {}
    },
    response: PAGE
  } as never)
})

describe('the catalogue tree', () => {
  it('types a category the download had already stored', async () => {
    const category = (await stored('5'))!
    expect(category.catType).toBe('P')
    expect(category.items).toBe(4_000)
    // Still the same brickzuke category: a second one for a record that is
    // already there would be a duplicate row in the categories table.
    expect(category.bzCategoryId).toBe(1)
  })

  it('types one it stores for the first time', async () => {
    const category = (await stored('6'))!
    expect(category.catType).toBe('P')
    expect(category.items).toBe(1_500)
    expect(category['Category Name']).toBe('Plate')
  })
})
