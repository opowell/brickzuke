import type { Table } from '@/components/TableComponent.vue'
import { formatInteger } from './utils'

export function getTableLabel<T>(table: Table<T>) {
  if (!table.count) {
    return table.label
  }
  return table.label + ':&nbsp;' + formatInteger(table.count)
}
