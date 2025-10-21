import type { Table } from '@/components/TableComponent.vue'
import { formatInteger } from './utils'
import { processingCounts } from '../../../model'

export function getTableLabel<T>(table: Table<T>) {
  if (!table.count || processingCounts.value) {
    return table.label
  }
  return table.label + ':&nbsp;' + formatInteger(table.count)
}
