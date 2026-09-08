/**
 * Putting the set's name on the header, where the query says its id.
 *
 * `record:"S-75884-1"` is the address of a set's parts, and it is the one
 * thing on that screen that says which set they are the parts of — every row
 * below is a brick. An id is a join key, so the header reads the term back
 * against the type that declares the field and shows what the record is
 * called. These pin the two halves of that: the type being declared while a
 * record is named, and the lookup that answers it.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { DataShell, PARAM_ENTITY, PARAM_EXPR, createMemoryAdapter } from 'header-content-layout'
import router from '@/router'

vi.mock('../../../model', async () => {
  const {
    ref
  } = await import('vue')
  return {
    filters: ref([]),
    search: ref(undefined),
    selectedItemType: ref(null),
    itemTypes: ref([]),
    processingCounts: ref(false),
    selectedCounts: ref(undefined),
  }
})

// The parts of the set are not what is being tested and are the one thing on
// this screen that reaches the network — the header's lookup is a read.
vi.mock('../inventoryFetch', () => ({
  hasInventory: () => true,
  inventoryFor: () => Promise.resolve([]),
  readInventory: () => Promise.resolve([]),
  fetchesInFlight: () => 0
}))

const {
  catalogSource
} = await import('../catalogSource')
const {
  catalogSchema
} = await import('../catalogSchema')
const {
  getDbConnection
} = await import('../../../idb/idb')
const stores = (await import('../../../idb/stores')).default

const RECORD = 'S-75884-1'
const NAME = '1968 Ford Mustang Fastback'

beforeAll(async () => {
  const db = await getDbConnection()
  await db.put(stores.BRICK_LINK_ITEMS.name, {
    id: RECORD,
    bzItemId: 7,
    Name: NAME,
    Number: '75884-1',
    itemType: 'S',
    image: 'https://img.example/75884.png',
    'Category ID': '1135',
    'Category Name': 'Speed Champions',
    weight: '1.5',
    'Year Released': '2019',
    Dimensions: ''
  })
  db.close()
})

/** The app where a press on a set's parts count would put it. */
async function openInventory() {
  await router.replace({
    path: '/',
    query: {
      [PARAM_ENTITY]: 'inventory',
      [PARAM_EXPR]: `record:"${RECORD}"`
    }
  })
}

describe('a record named in the query', () => {
  it('declares the type that says what a record is, while one is named', async () => {
    await openInventory()
    expect(catalogSchema.value.entities.map((entity) => entity.key)).toContain('itemRecords')
  })

  it('leaves it undeclared on the home screen, which is a card per type', async () => {
    await router.replace({
      path: '/'
    })
    expect(catalogSchema.value.entities.map((entity) => entity.key)).not.toContain('itemRecords')
  })

  it('answers the lookup with the one record, by its own id', async () => {
    await openInventory()
    const entity = catalogSchema.value.entities.find((one) => one.key === 'itemRecords')!
    const result = await catalogSource.query({
      query: {
        entity: 'itemRecords',
        view: 'table',
        sort: 'name',
        dir: 'asc',
        expr: `record:"${RECORD}"`,
        facets: {},
        page: 1
      },
      schema: catalogSchema.value,
      entity,
      limit: 25,
      offset: 0
    })
    expect(result.rows.map((row) => row.id)).toEqual([RECORD])
  })

  it('says what the set is called on the header', async () => {
    await openInventory()
    const shell = mount(DataShell, {
      props: {
        schema: catalogSchema.value,
        source: catalogSource,
        route: createMemoryAdapter(
          `?${PARAM_ENTITY}=inventory&v=table&${PARAM_EXPR}=` +
            encodeURIComponent(`record:"${RECORD}"`)
        ),
        defaults: {
          landing: 'entity',
          entity: 'inventory',
          view: 'table'
        }
      }
    })
    // The lookup is a read of IndexedDB, which settles on a task rather than
    // a microtask — ticks alone never see it come back.
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5))
      await nextTick()
    }
    // The whole term, not just the name in it: the shell states the id after
    // whatever it is handed, so a name that carries its own id reads doubled.
    expect(shell.text()).toContain(`record:${NAME} (${RECORD})`)
    expect(shell.text()).not.toContain(`(${RECORD}) (${RECORD})`)
  })
})
