export interface Cart {
  id: number
  name: string
  active?: number
}
export interface CachedCart extends Cart {
  cartItems: CachedCartItem[]
}

export interface CachedStore extends Store {
  invItems: CachedInvItem[]
  carts: CachedCart
}

export interface CachedInvItem extends InvItem {
  externalPart: CachedExternalItem
  priceScore: ComputedRef<string>
  variant: CachedItemVariant | undefined
  color: CachedColor | undefined
  item: CachedExternalItem | undefined
  cartItems: CachedCartItem
  store: CachedStore
}
export interface CachedCartItem extends CartItem {
  cart: CachedCart
  store: CachedStore
  invItem: CachedInvItem
}

export interface CartWithItems extends Cart {
  cartItems: CartItem[]
}

export interface CartsPageCart extends Cart {
  numStores: number
  numInvItems: number
  quantity: number
  cost: number
}

export interface CartItem {
  cartId: number | IDBValidKey
  storeId: string
  invItemId: string
  quantity: number
  price: string
  lastUpdated: Date
}

export interface CartPageCartItem extends CartItem {
  id: string
  store: Store
  priceScore: string
  image: string
  part: ExternalItem
  condition: string
  color: Color
  maxQuantity: number
  category: ExternalCategory
  invItem: InvItem
  variant: ItemVariant
}

export interface ShippingCost {
  region?: string
  minOrderPrice?: number
  maxOrderPrice?: number
  cost: number
  maxWeight?: number
  type?: 'eco' | 'priority'
}
export interface HomeData {
  stores: number
  categories: number
  colors: number
  parts: number
  conditions: number
  lists: number
  searches: number
  carts: number
}
export enum StoreType {
  BrickLink = 'BrickLink',
  Lego = 'Lego',
}
export interface Store {
  fullyFetched?: boolean
  id: string
  name: string
  fetchPageIndex: number
  fetchMaxPageIndex: number
  shippingCosts: ShippingCost[]
  slug: string
  priceAdjustment: number
  lastScraped: Date
  type: StoreType
  countryId: string
}

export interface BrickLinkItem extends ExternalItem {
  type: 'BrickLink'
}
export interface LegoItem extends ExternalItem {
  type: 'Lego'
}

export interface StoreCountry {
  id: string
  name: string
}

export interface StoreState {
  id: string
  name: string
}

export interface SearchCategory {
  searchId: number
  categoryId: number
  isExcluded: number
}

export interface SearchStore {
  searchId: number
  storeId: string
  isExcluded: number
}

export interface StoreCountriesPageStoreCountry extends StoreCountry {
  numStores: number
  excluded: boolean
  included: boolean
}

export interface BrickLinkStorePage {
  url: string
  nextScrape: Date
  scrapeMultiplier: number
}

export interface LegoCategory extends ExternalCategory {
  type: 'Lego'
}
export interface Item {
  itemId: number
}
export interface PartPageCategory extends Category {}
export interface PartButtonPart extends Item {
  externalParts: ExternalItem[]
}
export interface RebrickableItem extends ExternalItem {
  legoPartIds: string[] | undefined
  brickLinkIds: string[] | undefined
  type: 'Rebrickable'
}
export interface ExternalItem {
  externalCategoryId: string
  itemId: number
  externalItemId: string
  name?: string
  type: 'Rebrickable' | 'Lego' | 'BrickLink'
}

export interface CachedExternalItem extends ExternalItem {
  part?: CachedItem
  invItems: CachedInvItem[]
  externalCategory?: CachedExternalCategory
  variants: CachedItemVariant[]
  image: string | undefined
}
export interface StorePageInvItemItem extends ExternalItem {
  variants: StorePageItemVariant[]
  externalParts: StorePageExternalPart[]
}
export interface ItemVariant {
  itemId: string
  colorId: string
  image: string
  type: 'Rebrickable' | 'Lego' | 'BrickLink'
}
export interface StorePageItemVariant extends ItemVariant {
  color: UiColor
  invItems: InvItem[]
}
export interface PartsPageVariant extends ItemVariant {
  item: ExternalItem
  color: Color
  invItems: PartsPageVariantInvItem[]
}

export interface ObjectCache {
  categories: Map<string, Category>
  colors: Map<string, UiColor>
}

export interface UiItemVariant extends ItemVariant {
  color: Color
  invItems: UiInvItem[]
  item?: UiItem
}
export interface VariantPageVariant extends ItemVariant {
  color: Color
  invItems: VariantPageInvItem[]
  item?: VariantPagePart
}
export interface VariantPageInvItem extends InvItem {
  store: Store
  item: Item
  cartQuantity: number
}
export interface PartVariantButtonVariant extends ItemVariant {
  color: Color
}
export interface StorePageVariant extends ItemVariant {
  color: Color
  invItems: InvItem[]
  item?: UiItem
}
export interface PartPageVariant extends ItemVariant {
  color: Color
  invItems: PartPageVariantInvItem[]
  item?: UiItem
}
export interface PartPageVariantInvItem extends InvItem {
  store: Store
  color: Color
  cartQuantity: number
  variant: ItemVariant
}
export interface UiItem extends Item {
  variants: UiItemVariant[]
  category?: Category
}
export interface VariantPagePart extends Item {
  variants: ItemVariant[]
  category?: Category
}
export interface PartsPagePart extends Item {
  variants: PartsPageVariant[]
  externalParts: ExternalItem[]
  image?: string
  priceRange: string
}
export interface ExternalPartPageInvItem extends InvItem {
  color: Color
  store: Store
  cartQuantity: number
}
export interface StorePagePart extends Item {
  variants: UiItemVariant[]
  category: Category
}
export interface ExternalPartPageExternalPart extends ExternalItem {
  variants: ExternalPartPageItemVariant[]
  invItems: ExternalPartPageInvItem[]
  category: ExternalCategory
}
export interface ExternalPartPageItemVariant extends ItemVariant {
  color: Color
}
export interface PartPagePart extends Item {
  variants: PartPageVariant[]
  invItems: PartPageVariantInvItem[]
  externalParts: ExternalItem[]
}
export interface InvItem {
  stale?: boolean
  invId: string
  storeId: string
  itemId: string
  condition: string
  quantity: number
  price: string
  colorId: string
  condition_New: number
  condition_Used: number
  type: 'Lego' | 'BrickLink' | 'Rebrickable'
}
export interface AdjustedInvItem extends InvItem {
  adjustedPrice: string
}

export interface UiInvItem extends InvItem {
  item: UiItem
  store?: UiStore
  colorName: string
}

export interface PartsPageVariantInvItem extends InvItem {}

export interface StorePageExternalPart extends ExternalItem {
  category: ExternalCategory
}

export interface StorePageInvItem extends InvItem {
  item: StorePageInvItemItem
  color: Color
  externalCategory: ExternalCategory
  category: CategoryWithExternals
  variant: StorePageInvItemVariant
  cartQuantity: number
  priceScore?: string
}

export interface StorePageInvItemVariant extends ItemVariant {
  color: Color
}

export interface ColorPageInvItem extends InvItem {
  variant: ItemVariant
  item: Item
  store?: Store
  colorName: string
}

export interface ConditionsPageCondition {
  id: string
  numInvItems: number
}
export interface StoresPageStore extends Store {
  fetchPercent: number
  numInvItems: number
}
export interface ListPageStore extends Store {
  cost: number
}
export interface UiStore extends Store {
  items: UiInvItem[]
}
export interface StorePageStore extends Store {
  items: InvItem[]
}
export interface ShopList {
  id: number
  name: string
}

export interface ShopListItem {
  listId: number
  itemId: string | number
  condition?: string
  minQuantity: number
  maxQuantity?: number
  maxPrice?: number
  colors: string[]
  type: 'item' | 'externalItem'
}

export interface CachedItem extends Item {
  externalParts: CachedExternalItem[]
}

export interface CachedSearchFilter extends SearchFilter {}

export interface CachedSearch extends Search {
  externalCategories: {
    included: string[]
    excluded: string[]
  }
  categories: {
    included: number[]
    excluded: number[]
  }
  colors: {
    included: number[]
    excluded: number[]
  }
  conditions: {
    included: string[]
    excluded: string[]
  }
  stores: {
    included: string[]
    excluded: string[]
  }
  parts: {
    included: number[]
    excluded: number[]
  }
}

export interface CachedItemVariant extends ItemVariant {
  externalPart: CachedExternalItem
  color: CachedColor
}

export interface SearchFilter {
  searchId: IDBValidKey
  type:
    | 'category'
    | 'color'
    | 'store'
    | 'condition'
    | 'externalCategory'
    | 'storeCountry'
  objectId: string | number
  isExcluded: boolean
}
export interface Search {
  id: number
  name: string
  active: number
  filters?: SearchFilter[]
  priceScoreQuantity: number
  priceScoreIgnoreColor: boolean
}
export interface ActiveSearch extends Search {
  categories: {
    included: number[]
    excluded: number[]
  }
  colors: {
    included: string[]
    excluded: string[]
  }
  conditions: {
    included: string[]
    excluded: string[]
  }
  countries: {
    included: string[]
    excluded: string[]
  }
  stores: {
    included: string[]
    excluded: string[]
  }
  parts: {
    included: number[]
    excluded: number[]
  }
}
export interface CartPageCart extends CartWithItems {}
export interface ActiveCartButtonCart extends Cart {
  totalCost: number
  totalItems: number
  totalQuantity: number
}
export interface ActiveSearchButtonActiveSearch extends ActiveSearch {
  categories: {
    included: number[]
    excluded: number[]
    includedNames: string[]
    excludedNames: string[]
  }
  colors: {
    included: string[]
    excluded: string[]
    includedNames: string[]
    excludedNames: string[]
  }
  countries: {
    included: string[]
    excluded: string[]
    includedNames: string[]
    excludedNames: string[]
  }
  parts: {
    included: number[]
    excluded: number[]
    includedNames: string[]
    excludedNames: string[]
  }
  stores: {
    included: string[]
    excluded: string[]
    includedNames: string[]
    excludedNames: string[]
  }
  conditions: {
    included: string[]
    excluded: string[]
    includedNames: string[]
    excludedNames: string[]
  }
}
interface ActiveSearchPagePart extends Item {
  numVariants: number
}
interface ActiveSearchPageStore extends Store {
  numParts: number
}
export interface ActiveSearchPageCondition {
  id: string
  numInvItems: number
}
export interface SearchPageSearch extends ActiveSearch {
  includedConditionObjects: ActiveSearchPageCondition[]
  excludedConditionObjects: ActiveSearchPageCondition[]
  includedCategoryObjects: CategoriesPageCategory[]
  excludedCategoryObjects: CategoriesPageCategory[]
  colorObjects: UiColor[]
  partObjects: ActiveSearchPagePart[]
  storeObjects: ActiveSearchPageStore[]
  conditionPriceAdjustments: ConditionPriceAdjustment[]
}

export interface ConditionPriceAdjustment {
  searchId: number
  condition: 'New' | 'Used'
  adjustment: number
}

export interface SearchesPageSearch extends Search {}
export interface UiListItem extends ShopListItem {
  item?: UiItem
  colorNames?: Color[]
  shopList?: UiShopList
}

export interface Condition {
  id: string
  name: string
}

export interface Color {
  id: string
  name: string
  brickLinkName?: string
  brickLinkId?: string
  legoName?: string
  legoId?: string
}

export interface CachedColor extends Color {}

export interface RbColor {
  Img: string
  ID: number
  Name: string
  RGB: string
  'Num Parts': number
  'Num Sets': number
  'First Year': number | null
  'Last Year': number | null
  LEGO: string
  LDraw: string
  BrickLink: string
  BrickOwl: string
}

export interface ColorPageColor extends Color {
  invItems?: ColorPageInvItem[]
}

export interface UiColor extends Color {
  numInvItems?: number
  invItems?: UiInvItem[]
  image?: string
}

export interface ColorsPageColor extends Color {
  numInvItems?: number
  invItems?: UiInvItem[]
  image?: string
}

export interface Category {
  excluded?: boolean
  included?: boolean
  id: number
}

export interface CachedCategory extends Category {
  parts: CachedExternalItem[]
  externalCategories: CachedExternalCategory[]
}

export interface BrickLinkCategory extends ExternalCategory {
  type: 'BrickLink'
}

export interface RebrickableCategory extends ExternalCategory {
  type: 'Rebrickable'
}

export interface CategoryWithExternals extends Category {
  externalCategories: ExternalCategory[]
}

export interface CategoryButtonCategory {
  id: number | string
  externalCategories: ExternalCategory[]
}

export interface ExternalCategory {
  included?: boolean
  excluded?: boolean
  id: string
  name: string
  categoryId: number
  type: 'BrickLink' | 'Lego' | 'Rebrickable'
}

export interface CachedExternalCategory extends ExternalCategory {
  externalPartsFiltered: ComputedRef<CachedExternalItem[]>
  externalParts: Ref<CachedExternalItem[]>
  category: CachedCategory
  image: ComputedRef<string | undefined> | undefined
}

export interface CachedExternalCategory extends ExternalCategory {
  externalPartsFiltered: ComputedRef<CachedExternalItem[]>
  externalParts: Ref<CachedExternalItem[]>
  category: CachedCategory
  image: ComputedRef<string | undefined> | undefined
}

export interface ExternalCategoryPageExternalCategory extends ExternalCategory {
  externalParts: ExternalItem[]
  category: CategoryWithExternals
}

export interface ExternalCategoryPageExternalPart extends ExternalItem {
  image?: string
  numVariants: number
}

export interface CategoryPagePart extends Item {
  variants: any
  numInvItems: number
  numVariants: number
  externalParts: ExternalItem[]
  image?: string
}

export interface CategoryPageCategory extends Category {
  parts: CategoryPagePart[]
  externalCategories: ExternalCategory[]
}

export interface CategoriesPageExternalCategory extends ExternalCategory {
  numParts: number
  image?: string
}

export interface CategoriesPageCategory extends Category {
  image?: string
  externalCategories: CategoriesPageExternalCategory[]
}

export interface UiCategory extends Category {
  parts?: UiItem[]
  numParts: number
}

export interface UiShopList extends ShopList {
  items: ShopListItem[]
}
