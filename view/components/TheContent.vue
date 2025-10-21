<script setup lang="ts">
import TableComponent from './TableComponent.vue'
import { getTableLabel } from '@/assets/js/getTableLabel.ts'
import TableCell from './TableCell.vue'
import type { SelectOption } from './header/TheViews.vue'
import { getDbConnection } from '../../idb/idb'
import stores from '../../idb/stores'
import { sum } from '../../idb/utils'
import { getAll, getAllFromIndex } from '../../idb/db'
import type { BrickLinkCategory, BrickLinkColor, BrickLinkItemType, Category, Color, Item, ItemType } from '@/stores/bricklink/catalog-download-page'
import indices from '../../idb/indices'
import { itemTypes, processingCounts, selectedItemType, setItems, tableItems, tableRef } from '../../model'
import type { IDBPDatabase } from 'idb'
import { ref, watch } from 'vue'

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
  console.log('setCategories')
  const categories = await getAll<Category>(db, stores.CATEGORIES)
  if (!categories) {
    return
  }
  tableItems.value = []
  for (let i = 0; i < categories.length; i++) {
    if (selectedItemType.value.id !== 'categories') {
      break
    }
    console.log('Loading category', categories[i].id)
    tableItems.value.push(await loadCategory(db, categories[i].id!))
  }
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
const localTableRef = ref<InstanceType<typeof TableComponent> | null>(null)
watch(() => selectedItemType.value, (value) => {
  if (!value) {
    return
  }
  tableRef.value = localTableRef.value
})
</script>

<template>
  <section>
    <TableComponent v-if="selectedItemType" :table="selectedItemType" :items="tableItems" ref="localTableRef" />
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
