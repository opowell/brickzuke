declare global {
  interface Window {
    getStorageUsage: Function;
  }
}
import { getStorageUsage } from "./utils";

export function initStorageUsageFunction() {
  window.getStorageUsage = getStorageUsage;
}
