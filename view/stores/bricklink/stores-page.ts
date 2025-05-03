import { Call, makeTextCall } from "~/assets/js/make-call";
import { extractValueFromHtml, extractValuesFromHtml } from "~/assets/js/utils";

export interface Country {
  region: string;
  countryCode: string;
  groupState: "Y" | "N";
  image: string;
  countryName: string;
}

export interface Region {
  name: string;
  countryCount: number;
}

export const useStoresPageStore = defineStore("storesPageStore", {
  state: () => ({
    countries: 0,
    countriesMap: new Map<string, Country>(),
    stores: 0,
    regions: 0,
    regionsMap: new Map<string, Region>(),
    loaded: false,
  }),
  getters: {
    countriesArray(state): Country[] {
      return Array.from(state.countriesMap.values());
    },
    filteredRegions: (state): Region[] => {
      const out = Array.from(state.regionsMap.values());
      const queryStore = useQueryStore();
      const { s } = storeToRefs(queryStore);
      const search = s;
      if (!search.value || search.value === "") {
        return out;
      }
      const lowerCaseSearch = search.value.toLowerCase();
      const caseMatch = search.value !== lowerCaseSearch;
      return out.filter((region) => {
        if (caseMatch) {
          // @ts-ignore undefined case already handled above
          return region.name.includes(search.value);
        }
        return region.name.toLowerCase().includes(lowerCaseSearch);
      });
    },
    filteredCountries(): Country[] {
      const queryStore = useQueryStore();
      const { s, filters } = storeToRefs(queryStore);
      const search = s;
      if (
        (!search.value || search.value === "") &&
        filters.value.length === 0
      ) {
        return this.countriesArray;
      }
      const lowerCaseSearch = search.value
        ? search.value.toLowerCase()
        : undefined;
      const caseMatch = search.value !== lowerCaseSearch;
      const filteredRegions = filters.value.filter((f) => f.key === "regions");
      const includedRegionIds = filteredRegions
        .filter((f) => f.action === "include")
        .map((f) => f.item);
      const excludedRegionIds = filteredRegions
        .filter((f) => f.action === "exclude")
        .map((f) => f.item);
      return this.countriesArray.filter((item) => {
        if (search.value && caseMatch) {
          if (!item.countryName.includes(search.value)) {
            return false;
          }
          if (includedRegionIds.length > 0) {
            return includedRegionIds.includes(item.region);
          } else if (excludedRegionIds.length > 0) {
            return !excludedRegionIds.includes(item.region);
          }
          return true;
        }
        if (
          lowerCaseSearch &&
          !item.countryName.toLowerCase().includes(lowerCaseSearch)
        ) {
          return false;
        }
        if (includedRegionIds.length > 0) {
          return includedRegionIds.includes(item.region);
        } else if (excludedRegionIds.length > 0) {
          return !excludedRegionIds.includes(item.region);
        }
        return true;
      });
    },
  },
  actions: {
    async fetch() {
      makeTextCall(
        Call.GET_STORES_PAGE,
        "https://www.bricklink.com/browse.asp",
        {
          headers: {
            accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "en,de;q=0.9,es;q=0.8,en-US;q=0.7",
            priority: "u=0, i",
            "sec-ch-ua":
              '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          body: null,
          method: "GET",
          mode: "cors",
          credentials: "include",
        }
      );
    },
    handleFetchResponse(response: string) {
      const stores = extractValueFromHtml(
        response,
        ["<h3 class='new'>Countries</h3>", "<span>"],
        " stores"
      );
      this.stores = Number.parseInt(stores[0][0].replaceAll(",", ""));
      const regionTables = extractValueFromHtml(
        response,
        "<h3 class='new'>Countries</h3>",
        "Search stores by name"
      );
      const regions = extractValueFromHtml(
        regionTables[0],
        "<table class='store-list'>",
        "</td></tr></table>"
      );
      regions.forEach((r: string) => {
        const regionId = extractValuesFromHtml(
          r,
          "<th colspan='2'>",
          "</th>"
        )[0];
        const countries = extractValueFromHtml(
          r,
          "<tr><td><a href='",
          "</span></td></tr>"
        );
        const region: Region = {
          name: regionId,
          countryCount: countries.length,
        };
        this.regionsMap.set(regionId, region);
        const x = countries.map((c: string) => {
          const parts = extractValuesFromHtml(
            c,
            [
              "", // country code
              "src='", // image
              ">", // country name
              "<span>", // store count
            ],
            [c.includes("groupState=") ? "&" : "'>", "'", "</a>"]
          );
          let groupState = "N";
          if (c.includes("groupState=")) {
            groupState = extractValuesFromHtml(c, "groupState=", "'")[0];
          }
          return {
            regionId,
            countryCode: parts[0],
            groupState,
            image: "https://www.bricklink.com" + parts[1],
            countryName: parts[2],
            storeCount: Number.parseInt(parts[3]),
          };
        });
        x.forEach((c: Country) => {
          this.countriesMap.set(c.countryCode, c);
        });
        this.countries += countries.length;
      });
      this.regions = this.regionsMap.size;
      this.loaded = true;
    },
  },
});
