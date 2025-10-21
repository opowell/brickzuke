<script setup lang="ts">
import TableComponent from './TableComponent.vue'
import { getTableLabel } from '@/assets/js/getTableLabel.ts'
import TableCell from './TableCell.vue'
import type { SelectOption } from './header/TheViews.vue'
import { ref } from 'vue'
import { getDbConnection } from '../../idb/idb'
import stores from '../../idb/stores'
import { sum } from '../../idb/utils'
import { getAll, getAllFromIndex } from '../../idb/db'
import type { BrickLinkCategory, BrickLinkColor, BrickLinkItem, BrickLinkItemType, Category, Color, Item, ItemType } from '@/stores/bricklink/catalog-download-page'
import indices from '../../idb/indices'
import { filters, itemTypes, selectedItemType } from '../../model'
import type { IDBPDatabase } from 'idb'

async function loadCategory(db: IDBPDatabase, id: number) {
  const category: Category = {
    id
  }
  category.brickLinkCategories = await getAllFromIndex<BrickLinkCategory>(db, indices.BRICK_LINK_CATEGORIES_BY_CATEGORY_ID, category.id)
  category.items = sum<BrickLinkCategory>(category.brickLinkCategories, c => c.items)
  category.name = category.brickLinkCategories?.map((c: BrickLinkCategory) => c['Category Name']).join(', ')
  category.type = category.brickLinkCategories?.map((c: BrickLinkCategory) => c.type).join(', ')
  return category
}

async function setCategories(db: IDBPDatabase) {
  const categories = await getAll<Category>(db, stores.CATEGORIES)
  if (!categories) {
    return
  }
  for (let i = 0; i < categories.length; i++) {
    let category = categories[i]
    category = await loadCategory(db, category.id!)
    categories[i] = category
  }
  tableItems.value = categories
}
async function setColors(db: IDBPDatabase) {
  const colors = await getAll<Color>(db, stores.COLORS)
  if (!colors) {
    return
  }
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i]
    color.brickLinkColors = await getAllFromIndex<BrickLinkColor>(db, indices.BRICK_LINK_COLORS_BY_COLOR_ID, color.id)
    color.countItems = sum<BrickLinkColor>(color.brickLinkColors, c => Number.parseInt(c.Parts))
    color.image = color.brickLinkColors?.find((c: BrickLinkColor) => c.image)?.image
  }
  tableItems.value = colors
}
async function setItemTypes(db: IDBPDatabase) {
  const itemTypesData = await getAll<ItemType>(db, stores.ITEM_TYPES)
  if (!itemTypesData) {
    return
  }
  for (let i = 0; i < itemTypesData.length; i++) {
    const itemType = itemTypesData[i]
    itemType.brickLinkItemTypes = await getAllFromIndex<BrickLinkItemType>(db, indices.BRICK_LINK_ITEM_TYPES_BY_ITEM_TYPE_ID, itemType.id)
    itemType.countItems = sum<BrickLinkItemType>(itemType.brickLinkItemTypes, it => Number.parseInt(it.Items))
  }
  tableItems.value = itemTypesData
}

function findIndex<T extends { score: number }>(array: T[], itemToAdd: T): number {
  let low = 0,
    high = array.length;

  while (low < high) {
    const mid = low + high >>> 1
    if (array[mid].score < itemToAdd.score) low = mid + 1
    else high = mid
  }
  return low
}

async function setItems(db: IDBPDatabase) {
  console.log('Setting items with filters:', filters.value)
  const filteredCategories: number[] = filters.value.filter(f => f.key === 'category').map(f => Number(f.value))
  if (filteredCategories.length > 0) {
    const items: Item[] = []
    tableItems.value = []
    for (let i = 0; i < filteredCategories.length; i++) {
      const categoryId = filteredCategories[i]
      try {
        console.log('Loading category for ID:', categoryId)
        let count = 0
        const brickLinkCategories = await getAllFromIndex<BrickLinkCategory>(db, indices.BRICK_LINK_CATEGORIES_BY_CATEGORY_ID, categoryId)
        if (!brickLinkCategories) {
          console.log('No BrickLink categories for category ID:', categoryId)
          continue
        }
        for (let j = 0; j < brickLinkCategories.length; j++) {
          const blCategory = brickLinkCategories[j]
          console.log('BrickLink Category:', blCategory['Category Name'])
          while (true) {
            const tx = db.transaction(stores.BRICK_LINK_ITEMS.name)
            console.log(tx)
            const store = tx.objectStore(stores.BRICK_LINK_ITEMS.name)
            console.log(store)
            const dbIndex = store.index(indices.BRICK_LINK_ITEMS_BY_BRICK_LINK_CATEGORY_ID.name)
            console.log(dbIndex)
            const cursor = await dbIndex.openCursor(IDBKeyRange.only(blCategory.categoryId))
            if (!cursor) {
              console.log('No more items for BL category:', blCategory)
              break
            }
            if (count > 0) {
              console.log('Advancing cursor by', count)
              await cursor.advance(count)
            }
            count++
            const brickLinkItem = cursor.value
            if (!brickLinkItem) {
              console.log('No item found, breaking')
              break
            }
            const brickLinkItems = [brickLinkItem]
            const item: Item = {
              id: brickLinkItem.itemId,
            }
            item.brickLinkItems = brickLinkItems
            item.name = brickLinkItems?.map((bi: BrickLinkItem) => bi.Name + ' (' + bi.id + ')').join(', ')
            item.itemType = brickLinkItems?.map((bi: BrickLinkItem) => bi.itemType).join(', ')
            item.category = brickLinkItems?.map((bi: BrickLinkItem) => bi['Category Name']).join(', ')
            item.image = brickLinkItems?.find((bi: BrickLinkItem) => bi.image)?.image
            item.score = Math.random()
            const index = findIndex(items, item)
            items.splice(index, 0, item)
            console.log('Processed items:', count)
            if (count % 1000 === 0) {
              console.log('Processed items:', count)
            }
            if (index < 1000) {
              tableRef.value?.addRow(item, index)
            }
          }
        }
        console.log('Loaded category:', categoryId)
      } catch (e) {
        console.error('Error loading category ID:', categoryId, e)
      }
    }
  } else {
    const items: Item[] = []
    let count = 0
    tableItems.value = []
    while (true) {
      const cursor = await db.transaction(stores.ITEMS.name).store.openCursor()
      if (!cursor) {
        break
      }
      if (count > 0) {
        await cursor.advance(count)
      }
      count++
      const item = cursor.value
      if (!item) {
        break
      }
      const brickLinkItems = await getAllFromIndex<BrickLinkItem>(db, indices.BRICK_LINK_ITEMS_BY_ITEM_ID, item.id)
      if (brickLinkItems?.length === 0) {
        continue
      }
      item.brickLinkItems = brickLinkItems
      item.name = brickLinkItems?.map((bi: BrickLinkItem) => bi.Name + ' (' + bi.id + ')').join(', ')
      item.itemType = brickLinkItems?.map((bi: BrickLinkItem) => bi.itemType).join(', ')
      item.category = brickLinkItems?.map((bi: BrickLinkItem) => bi['Category Name']).join(', ')
      item.image = brickLinkItems?.find((bi: BrickLinkItem) => bi.image)?.image
      item.score = Math.random()
      const index = findIndex(items, item)
      items.splice(index, 0, item)
      console.log('Processed items:', count)
      if (count % 1000 === 0) {
        console.log('Processed items:', count)
      }
      if (index < 1000) {
        tableRef.value?.addRow(item, index)
      }
    }
  }
}

const setSelectedItem = async function (option: SelectOption<any>) {
  console.log('setSelectedItem', option)
  selectedItemType.value = option
  const db = await getDbConnection()
  switch (option.id) {
    case 'categories':
      await setCategories(db)
      return
    case 'colors':
      await setColors(db)
      return
    case 'itemTypes':
      await setItemTypes(db)
      return
    case 'items':
      await setItems(db)
      return
  }
}
const tableItems = ref<any[]>([])
const tableRef = ref<InstanceType<typeof TableComponent> | null>(null)
</script>

<template>
  <section>
    <TableComponent v-if="selectedItemType" :table="selectedItemType" :items="tableItems" ref="tableRef" />
    <div v-else class="buttons">
      <div v-for="table in itemTypes" :key="table.id" class="itemType">
        <button @click="setSelectedItem(table)" v-html="getTableLabel(table)" />
        <template v-if="table.preview && table.items?.length">:
          <div v-for="item in table.items?.slice(0, 10)" :key="item.id">
            <template v-if="typeof table.preview === 'string'">
              <button v-if="!!table.previewClickFn" v-html="item[table.preview]"
                @click="table.previewClickFn(item)"></button>
              <div v-else v-html="item[table.preview]" />
            </template>
            <TableCell v-else :column="table.preview" :item="item" set-max-width />
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.itemType {
  display: flex;
  gap: 0.3rem;
  align-items: flex-start;
  flex-wrap: wrap;
}
</style>
