import type { EventDetail } from "@/assets/js/make-call";
import { extractValueFromHtml, extractValuesFromHtml } from "@/assets/js/utils";
import { getDbConnection } from "../../../idb/idb";
import stores from "../../../idb/stores";
import { get, put } from "../../../idb/db";
import type { BrickLinkCategory, Category } from "./catalog-download-page";

async function handlePageResponse(detail: EventDetail) {
  const categoryTreeHtml = extractValueFromHtml(
    detail.response,
    ["<table class='bg-color--white catalog-list__category-list--internal catalog-tree__category-list--internal'>"],
    ['</table>'],
  ).join('')
  const categories = extractValueFromHtml(
    categoryTreeHtml,
    ["<A HREF='/catalogList.asp?"],
    ["</span><BR>"]
  )
  const db = await getDbConnection()
  for (let i = 0; i < categories.length; i++) {
    const categoryHtml = categories[i].replaceAll('<b>', '').replaceAll('</b>', '')
    const values = extractValuesFromHtml(
      categoryHtml,
      ['catType=', 'catString=', '', '('],
      ['&', "'>", '</A>', ')'],
    )
    let category = await get<BrickLinkCategory>(db, stores.BRICK_LINK_CATEGORIES, values[1])
    if (!category) {
      const bzCategoryId = await put<Category>(db, stores.CATEGORIES, {})
      if (!bzCategoryId || typeof bzCategoryId !== 'number') {
        continue
      }
      category = {
        bzCategoryId,
        catType: values[0],
        categoryId: values[1],
        'Category Name': values[2]
      }
    }
    category.items = Number.parseInt(values[3])
    console.log(category['Category Name'], category.items, values)
    await put(db, stores.BRICK_LINK_CATEGORIES, category)
  }
}

export default {
  handlePageResponse
}
