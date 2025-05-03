const FILTER_SEPARATOR = '_'
const keyLabels = new Map<string, string>()
keyLabels.set('categories', 'Categories')
keyLabels.set('items', 'Items')
keyLabels.set('itemTypes', 'Item types')
import { defineStore } from 'pinia'
import { useRoute } from 'vue-router'

interface Filter {
  action: 'include' | 'exclude'
  key: string
  item?: string
}
interface Query {
  f?: string
  s?: string
  vn?: string
  vs?: string
  va?: string
}

export interface PresentableFilter extends Filter {
  keyLabel?: string
  itemLabel?: string
}

function getItemLabel(type: string, item?: string): string | undefined {
  if (!item) {
    return
  }
  switch (type) {
    case 'categories': {
      const catalogListPageStore = useCatalogListPageStore()
      const category = catalogListPageStore.categoriesMap.get(item)
      if (category?.name) {
        return category.name
      }
    }
    case 'items': {
      const catalogItemPage = useCatalogItemPageStore()
      const catalogItem = catalogItemPage.itemsMap.get(item)
      if (catalogItem?.itemName) {
        return catalogItem?.itemName
      }
    }
  }
  return item
}

function getQueryValue(param: string) {
  const route = useRoute()
  const query = route.query
  let out = undefined
  const queryValue = query[param]?.toString()
  if (queryValue) {
    out = queryValue.split(',')
  }
  return out
}

export const useQueryStore = defineStore('queryStore', {
  state: () => {
    return {
      s: undefined as undefined | string,
      filters: [] as Filter[],
      views: new Map(),
      d: undefined as undefined | string,
      pauseRedirect: false,
    }
  },
  getters: {
    somethingOpen(): boolean {
      return this.viewsSelected.length > 0 || this.viewsAll.length > 0
    },
    filtersOfType(state): Function {
      return (type: string) => {
        return state.filters.filter((f) => f.key === type)
      }
    },
    currentQuery(state): Query {
      const query: Query = {}
      if (this.filterString) {
        query.f = this.filterString
      }
      if (this.viewsNoneString) {
        query.vn = this.viewsNoneString
      }
      if (this.viewsSelectedString) {
        query.vs = this.viewsSelectedString
      }
      if (this.viewsAllString) {
        query.va = this.viewsAllString
      }
      if (this.s) {
        query.s = state.s
      }
      return query
    },
    itemIds(state): string[] {
      return state.filters
        .filter((f) => f.key === 'items')
        .map((f) => f.item)
        .filter((x) => x !== undefined)
    },
    viewsNone(state): (string | undefined)[] {
      return Array.from(state.views.entries())
        .filter((entry) => entry[1] === 'none')
        .map((e) => e[0])
    },
    viewsSelected(state): (string | undefined)[] {
      return Array.from(state.views.entries())
        .filter((entry) => entry[1] === 'selected')
        .map((e) => e[0])
    },
    viewsAll(state): (string | undefined)[] {
      return Array.from(state.views.entries())
        .filter((entry) => entry[1] === 'all')
        .map((e) => e[0])
    },
    viewsNoneString(state): string | undefined {
      // vn
      const str = this.viewsNone.join(',')
      if (str === '') {
        return
      }
      return str
    },
    viewsSelectedString(state): string | undefined {
      // vs
      const str = this.viewsSelected.join(',')
      if (str === '') {
        return
      }
      return str
    },
    viewsAllString(state): string | undefined {
      // va
      const str = this.viewsAll.join(',')
      if (str === '') {
        return
      }
      return str
    },
    filterString(state): string | undefined {
      if (!state.filters) {
        return
      }
      return state.filters.map((filter) => filterToQueryString(filter)).join(',')
    },
    filtersIncluded(state): Filter[] | undefined {
      // f, i
      if (!state.filters) {
        return
      }
      return state.filters.filter((f: Filter) => f.action === 'include')
    },
    filtersExcluded(state): Filter[] | undefined {
      // f, e
      if (!state.filters) {
        return
      }
      return state.filters.filter((f: Filter) => f.action === 'exclude')
    },
    presentableFilters(state): PresentableFilter[] | undefined {
      return state.filters?.map((f: Filter) => {
        return {
          ...f,
          keyLabel: keyLabels.get(f.key),
          itemLabel: getItemLabel(f.key, f.item),
        }
      })
    },
  },
  actions: {
    setState() {
      this.pauseRedirect = true
      const filters = (getQueryValue('f') || [])?.map((filterString) => {
        const parts = filterString.split(FILTER_SEPARATOR)
        const filter: Filter = {
          action: parts[0] === 'i' ? 'include' : 'exclude',
          key: parts[1],
        }
        if (parts.length > 2) {
          filter.item = parts[2]
        }
        return filter
      })
      const views = new Map<string, string>()
      getQueryValue('vn')?.forEach((key) => views.set(key, 'none'))
      getQueryValue('vs')?.forEach((key) => views.set(key, 'selected'))
      getQueryValue('va')?.forEach((key) => views.set(key, 'all'))
      const route = useRoute()
      const query = route.query
      this.s = query.s?.toString()
      this.filters = filters
      this.views = views
      this.d = query?.d?.toString()
      this.pauseRedirect = false
    },
    addFilter(f: Filter) {
      if (!this.filters) {
        this.filters = [f]
      } else {
        this.filters?.push(f)
      }
      this.s = ''
    },
    removeFilter(contentId: string, item?: string) {
      this.filters = this.filters?.filter((f) => f.key !== contentId || (!!item && f.item !== item))
    },
    setViewNone(contentId: string) {
      this.setView('none', contentId)
    },
    setViewSelected(contentId: string) {
      this.setView('selected', contentId)
    },
    clearView(contentId: string) {
      this.views.delete(contentId)
    },
    setView(view: string, contentId: string) {
      this.views.set(contentId, view)
    },
  },
})
