/**
 * What a press on the home screen means.
 *
 * A tile is a record drawn brickzuke's own way, so a press on one is the press
 * on its row — which appfr 0.21.0 made a narrowing rather than a departure. The
 * wall stays the wall and takes one more term, and the card headings have to
 * agree with that: a card reading `Countries 29` that opened all forty of them
 * contradicts the number it was pressed by.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import {PARAM_ENTITY,
  PARAM_EXPR,
  formatExpression,
  parseExpression} from 'header-content-layout'
import router from '@/router'
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

const {
  previewFor
} = await import('../catalogPreviews')
const {
  openType
} = await import('../catalogSchema')

beforeAll(async () => {
  const db = await getDbConnection()
  await putAll(db, STORES.CATEGORIES, [
    {
      id: 1
    }
  ])
  await putAll(db, STORES.BRICK_LINK_CATEGORIES, [
    {
      categoryId: '5',
      bzCategoryId: 1,
      catType: 'P',
      'Category Name': 'Brick',
      items: 4_000
    }
  ])
  await putAll(db, STORES.BRICK_LINK_ITEMS, [
    {
      id: 'P-3001',
      bzItemId: 10,
      itemType: 'P',
      Name: 'Brick 2 x 4',
      Number: '3001',
      categoryId: '5',
      'Category ID': '5',
      image: 'https://img.example/3001.png'
    }
  ])
  db.close()
})

/**
 * Where the app ended up, as the two query parts a press can move.
 *
 * The expression is read back through the parser rather than compared as text:
 * a term is quoted where it has to be and bare where it does not, so the same
 * narrowing is written `category:"5"` by the press that makes it and
 * `category:5` by the rewrite that carries it into a type. Two spellings of one
 * term, and it is the term these are about.
 */
function landed() {
  const query = router.currentRoute.value.query
  const expr = query[PARAM_EXPR]
  return {
    entity: query[PARAM_ENTITY],
    expr: typeof expr === 'string' ? formatExpression(parseExpression(expr)) : expr
  }
}

/** The home screen, under whatever query, before a press is made from it. */
async function onHome(expr = '') {
  await router.replace({
    path: '/',
    query: expr ? {
      [PARAM_EXPR]: expr
    } : {}
  })
  await flushPromises()
}

describe('pressing a record on the home screen', () => {
  it('narrows the wall to it rather than leaving for its table', async () => {
    await onHome()
    const preview = await previewFor('categories')
    const tile = preview.tiles[0]
    // The category's name with brickzuke's own key after it, as its table
    // states one.
    expect(tile.label).toBe('Brick (1)')
    tile.press?.()
    await flushPromises()
    // The term the shell itself would have written: `category` is the type's
    // scope, `5` is BrickLink's id for Brick, which is the row's own id.
    expect(landed().expr).toBe('category:5')
    // And still the home screen. Naming no type is what keeps the cards up —
    // see `openedQuery`, which sends every typeless query to them.
    expect(landed().entity).toBeUndefined()
  })

  it('keeps a record term on the way into a type', async () => {
    await onHome('category:"5"')
    openType('items')
    await flushPromises()
    // The press the card heading makes, from a wall already narrowed to Brick.
    // Dropping the term here is the card saying 4,000 and opening 199,000.
    expect(landed().entity).toBe('items')
    expect(landed().expr).toBe('category:5')
  })

  it('drops a question that was asked of another type', async () => {
    await onHome('name:"brick"')
    openType('countries')
    await flushPromises()
    // `name` is no type's scope, so this is a question about a value rather
    // than a reference to a record — and asked of the countries it finds
    // nothing. An expression belongs to the type it was written against.
    expect(landed().entity).toBe('countries')
    expect(landed().expr).toBeUndefined()
  })

  it('keeps the record and drops the question when both are in force', async () => {
    await onHome('category:"5" name:"brick"')
    openType('items')
    await flushPromises()
    expect(landed().expr).toBe('category:5')
  })
})
