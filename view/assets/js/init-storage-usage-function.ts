declare global {
  interface Window {
    getStorageUsage: () => Promise<void>
  }
}
import { getStorageUsage } from './utils'

export function initStorageUsageFunction() {
  window.getStorageUsage = getStorageUsage
}
