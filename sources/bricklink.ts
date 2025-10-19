import { BRICK_LINK_CATALOG } from '../view/stores/bricklink/catalog-codes'
import { useCatalogDownloadPageStore } from '../view/stores/bricklink/catalog-download-page'
import catalogPage from './bricklink/catalog-page'
export async function fetchBrickLink() {
  const catalogDownloadPage = useCatalogDownloadPageStore()
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.ITEM_TYPES)
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.CATEGORIES)
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.COLORS)
  await catalogDownloadPage.fetchViewType(BRICK_LINK_CATALOG.PART_AND_COLOR_CODES)
}

export async function fetchCatalogPage() {
  catalogPage.fetchPage()
}

export function updateCatalogTree() {
  const catalogDownloadPage = useCatalogDownloadPageStore()
  catalogDownloadPage.updateCatalogTree()
}
