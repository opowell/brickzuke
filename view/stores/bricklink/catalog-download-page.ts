import {
  Call,
  makeJsonCall,
  makeTextCall,
  type EventDetail,
} from "~/assets/js/make-call";
import { extractValuesFromHtml } from "~/assets/js/utils";

interface Category {
  id: string;
  name: string;
}
interface BrickLinkItem {
  Number: string;
}

function getOptions(type: string) {
  return {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en,de;q=0.9,es;q=0.8,en-US;q=0.7",
      "cache-control": "max-age=0",
      "content-type": "application/x-www-form-urlencoded",
      priority: "u=0, i",
      "sec-ch-ua":
        '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
    },
    referrer: "https://www.bricklink.com/catalogDownload.asp",
    referrerPolicy: "no-referrer-when-downgrade",
    body: `viewType=0&itemType=${type}&selYear=Y&selWeight=Y&selDim=Y&itemTypeInv=S&itemNo=&downloadType=T`,
    method: "POST",
    mode: "cors",
    credentials: "include",
  };
}

function itemKey(itemType: string, item: BrickLinkItem) {
  return itemType + "-" + item.Number;
}

const itemTypeMap = new Map<string, string>();
itemTypeMap.set("S", "Sets");
itemTypeMap.set("P", "Parts");
itemTypeMap.set("M", "Minifigures");
itemTypeMap.set("B", "Books");
itemTypeMap.set("G", "Gear");
itemTypeMap.set("C", "Catalogs");

export const useCatalogDownloadPageStore = defineStore(
  "catalogDownloadPageStore",
  {
    state: () => ({
      items: new Map<string, Map<string, any>>(),
    }),
    getters: {
      itemsArray(state) {
        const values = Array.from(state.items.values()).flatMap((map) =>
          Array.from(map.values())
        );
        return Array.from(values);
      },
      filteredItems() {
        const catalogItemPage = useCatalogItemPageStore();
        const catalogItemPageRefs = storeToRefs(catalogItemPage);
        const singleItem = catalogItemPageRefs.singleItem;
        let out = this.itemsArray;
        if (singleItem.value) {
          const catalogItemInvPage = useCatalogItemInvPageStore();
          const invItems = catalogItemInvPage.items
            .get(singleItem.value.itemType)
            ?.get(singleItem.value.itemNumber);
          if (invItems && this.items) {
            out = [];
            const uniqueItems = invItems.filter((i, index: number) => {
              const firstIndex = invItems.findIndex(
                (j) => j.itemType === i.itemType && j.itemId === i.itemId
              );
              return index === firstIndex;
            });
            uniqueItems.forEach((invItem) => {
              const typeMap = this.items.get(invItem.itemType);
              if (!typeMap) {
                return;
              }
              const item = typeMap.get(invItem.itemId);
              if (!item) {
                return;
              }
              const keys = Object.keys(item);
              const dupe = {};
              keys.forEach((key) => (dupe[key] = item[key]));
              dupe.image = invItem.thumbnail;
              out.push(dupe);
            });
          }
          // return out;
        }
        const queryStore = useQueryStore();
        const { filters, s } = storeToRefs(queryStore);
        const search = s;
        if (
          (!search.value || search.value === "") &&
          filters.value.length === 0
        ) {
          return out;
        }
        // @ts-ignore
        const lowerCaseSearch = search.value
          ? search.value.toLowerCase()
          : undefined;
        const caseMatch = search.value !== lowerCaseSearch;
        const filteredCategories = filters.value.filter(
          (f) => f.key === "categories"
        );
        const includedCategoryIds = filteredCategories
          .filter((f) => f.action === "include")
          .map((f) => f.item);
        const excludedCategoryIds = filteredCategories
          .filter((f) => f.action === "exclude")
          .map((f) => f.item);
        const filteredItemTypes = filters.value.filter(
          (f) => f.key === "itemTypes"
        );
        const includedItemTypeIds = filteredItemTypes
          .filter((f) => f.action === "include")
          .map((f) => f.item);
        const excludedItemTypeIds = filteredItemTypes
          .filter((f) => f.action === "exclude")
          .map((f) => f.item);
        return out.filter((item) => {
          if (search.value && caseMatch) {
            if (!item.Name.includes(search.value)) {
              return false;
            }
            if (!singleItem.value) {
              if (includedCategoryIds.length > 0) {
                return includedCategoryIds.includes(item["Category ID"]);
              } else if (excludedCategoryIds.length > 0) {
                return !excludedCategoryIds.includes(item["Category ID"]);
              }
            }
            return true;
          }
          if (
            search.value &&
            !item.Name.toLowerCase().includes(lowerCaseSearch)
          ) {
            return false;
          }
          if (!singleItem.value) {
            if (includedCategoryIds.length > 0) {
              if (!includedCategoryIds.includes(item["Category ID"])) {
                return false;
              }
            } else if (excludedCategoryIds.length > 0) {
              if (excludedCategoryIds.includes(item["Category ID"])) {
                return false;
              }
            }
          }
          const itemType = itemTypeMap.get(item.itemType);
          // console.log("check", item.itemType, itemType, includedItemTypeIds);
          if (!itemType) {
            console.log("ERROR, unknown type!", itemType);
          }
          if (includedItemTypeIds.length > 0) {
            if (!includedItemTypeIds.includes(itemType)) {
              return false;
            }
          } else if (excludedItemTypeIds.length > 0) {
            if (excludedItemTypeIds.includes(itemType)) {
              return false;
            }
          }
          return true;
        });
      },
    },
    actions: {
      async fetchItemPage(type: string) {
        return await makeTextCall(
          Call.GET_CATALOG_DOWNLOAD_PAGE,
          "https://www.bricklink.com/catalogDownload.asp?a=a",
          getOptions(type)
        );
      },
      async handlePageResponse(detail: EventDetail) {
        const response = detail.response;
        const rows = response
          .split("\n")
          .map((row) => row.replaceAll("\r", "").split("\t"));
        const headers = rows.splice(0, 1)[0];
        const itemType = extractValuesFromHtml(
          detail.request.options.body,
          "itemType=",
          "&"
        )[0];
        const items = rows
          .filter((row) => row.length === headers.length)
          .map((row) => {
            const out = {
              itemType,
            };
            headers.forEach((header, index) => {
              out[header] = row[index];
            });
            out.id = itemKey(itemType, out);
            if (itemType === "S") {
              out.image = `https://img.bricklink.com/ItemImage/${itemType}T/0/${out.Number}.t2.png`;
            } else {
              out.image = `https://img.bricklink.com/ItemImage/${itemType}L/${out.Number}.png`;
            }
            return out;
          });
        const map = new Map<string, any>();
        items.forEach((item) => {
          map.set(item.Number, item);
        });
        this.items.set(itemType, map);
        // console.log(this.items)
      },
    },
  }
);
