import { ref } from 'vue'

export const selectedItemType = ref<any>(null)
export const filters = ref<any[]>([])
export const setCounts = () => {}
export const currentQueryString = ref('')
export const tableItems = ref<any[]>([])
export const tableRef = ref<any>(null)
export const typesWithCounts = ref<any[]>([])
export const counts = ref(new Map())
export const processingCounts = ref(false)
export const hasSearch = ref(false)
export function setSelectedItem(_item: any) {}
