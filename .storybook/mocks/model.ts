import { ref } from 'vue'
import type { CountsState } from '../../types/counts-state'
import type { Filter } from '../../types/filter'
import type { TableComponent } from '../../types/components'
import type { TableRow } from '../../types/table'
import type { SelectOption } from '../../view/components/header/TheViews.vue'

export const selectedItemType = ref<SelectOption | undefined>(undefined)
export const filters = ref<Filter[]>([])
export const setCounts = () => {}
export const currentQueryString = ref('')
export const tableItems = ref<TableRow[]>([])
export const tableRef = ref<TableComponent | null>(null)
export const typesWithCounts = ref<SelectOption[]>([])
export const counts = ref(new Map<string, CountsState>())
export const processingCounts = ref(false)
export const hasSearch = ref(false)
export function setSelectedItem(_item: SelectOption) {}
