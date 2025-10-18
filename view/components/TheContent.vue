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
import type { BrickLinkCategory, BrickLinkColor, BrickLinkItemType, Category, Color, ItemType } from '@/stores/bricklink/catalog-download-page'
import indices from '../../idb/indices'
const selectedItemType = ref()
const setSelectedItem = async function (option: SelectOption<any>) {
  selectedItemType.value = option
  const db = await getDbConnection()
  switch (option.id) {
    case 'categories':
      const categories = await getAll<Category>(db, stores.CATEGORIES)
      if (!categories) {
        return
      }
      for (let i = 0; i < categories.length; i++) {
        const category = categories[i]
        category.brickLinkCategories = await getAllFromIndex<BrickLinkCategory>(db, indices.BRICK_LINK_CATEGORIES_BY_CATEGORY_ID, category.id)
        category.items = sum<BrickLinkCategory>(category.brickLinkCategories, c => c.items)
        category.name = category.brickLinkCategories?.map((c: BrickLinkCategory) => c['Category Name']).join(', ')
      }
      tableItems.value = categories
      break
    case 'colors':
      const colors = await getAll<Color>(db, stores.COLORS)
      if (!colors) {
        return
      }
      for (let i = 0; i < colors.length; i++) {
        const color = colors[i]
        color.brickLinkColors = await getAllFromIndex<BrickLinkColor>(db, indices.BRICK_LINK_COLORS_BY_COLOR_ID, color.id)
        color.name = color.brickLinkColors?.map((c: BrickLinkColor) => c['Color Name']).join(', ')
        color.countParts = sum<BrickLinkColor>(color.brickLinkColors, color => Number.parseInt(color.Parts))
        color.countSets = sum<BrickLinkColor>(color.brickLinkColors, color => Number.parseInt(color['In Sets']))
        color.countItems = color.countParts + color.countSets
      }
      tableItems.value = colors
      break
    case 'itemTypes':
      const itemTypes = await getAll<ItemType>(db, stores.ITEM_TYPES)
      if (!itemTypes) {
        return
      }
      for (let i = 0; i < itemTypes.length; i++) {
        const itemType = itemTypes[i]
        itemType.brickLinkItemTypes = await getAllFromIndex<BrickLinkItemType>(db, indices.BRICK_LINK_ITEM_TYPES_BY_ITEM_TYPE_ID, itemType.id)
        itemType.name = itemType.brickLinkItemTypes?.map((t: BrickLinkItemType) => t['Item Type Name']).join(', ')
        itemType.items = 4
        itemType.categories = 5
      }
      tableItems.value = itemTypes
      break
  }
}
const tableItems = ref<any[]>([])
defineProps<{
  itemTypes: SelectOption<any>[]
}>()
</script>

<template>
  <section>
    <TableComponent v-if="selectedItemType" :table="selectedItemType" :items="tableItems" />
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
