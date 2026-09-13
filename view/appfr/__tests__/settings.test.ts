import { describe, expect, it, vi } from 'vitest'
import { SETTINGS, setSetting, settingFor, shipTo } from '../settings'

describe('the ship-to country', () => {
  it('is a knob of its own kind, listed with the numbers', () => {
    const declared = settingFor('shipTo')
    expect(declared?.kind).toBe('country')
    // Last, after the two counts of patience: the table lists the settings in
    // the order they are declared, and a reader meets the fill's before the
    // shipping's.
    expect(SETTINGS.map((setting) => setting.key)).toEqual([
      'reachPatience',
      'reachGapMs',
      'shipTo'
    ])
  })

  it('holds the code it is given, or blank', () => {
    setSetting('shipTo', 'DE')
    expect(shipTo.value).toBe('DE')
    // Blank is a real choice — no country yet — rather than a refused write.
    setSetting('shipTo', '')
    expect(shipTo.value).toBe('')
  })

  it('takes no number, and hands a number setting no code', () => {
    setSetting('shipTo', 'US')
    setSetting('shipTo', 7)
    expect(shipTo.value).toBe('US')
    const patience = settingFor('reachPatience')
    expect(patience?.kind).toBe('number')
    const before = patience!.value.value
    setSetting('reachPatience', 'DE')
    expect(patience!.value.value).toBe(before)
  })
})

describe('the setting cell', () => {
  it('draws a country as a picker of the directory’s countries, and writes the pick', async () => {
    await import('fake-indexeddb/auto')
    const {
      getDbConnection 
    } = await import('../../../idb/idb')
    const {
      putAll 
    } = await import('../../../idb/db')
    const {
      default: STORES 
    } = await import('../../../idb/stores')
    const {
      mount 
    } = await import('@vue/test-utils')
    const {
      default: CellSetting 
    } = await import('../CellSetting.vue')

    const db = await getDbConnection()
    await putAll(db, STORES.STORE_COUNTRIES, [
      {
        countryCode: 'US',
        countryName: 'United States',
        regionId: 'Americas',
        groupState: 'N',
        image: '',
        storeCount: 1
      },
      {
        countryCode: 'DE',
        countryName: 'Germany',
        regionId: 'Europe',
        groupState: 'N',
        image: '',
        storeCount: 2
      }
    ])
    db.close()

    setSetting('shipTo', '')
    const wrapper = mount(CellSetting, {
      props: {
        row: {
          id: 'shipTo',
          entityKey: 'settings',
          entityLabel: 'Settings',
          fields: {
            setting: 'shipTo'
          }
        }
      }
    })
    // Blank first, then the countries by name rather than by code — a reader
    // looks for Germany, not for `DE`. Waited for rather than flushed: the
    // read lands on the fake database's own timers, not the microtask queue.
    await vi.waitFor(() => {
      expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
        'Not set',
        'Germany',
        'United States'
      ])
    })

    await wrapper.find('select').setValue('DE')
    expect(shipTo.value).toBe('DE')
    wrapper.unmount()
  })

  it('still draws a number as a number field', async () => {
    const {
      mount 
    } = await import('@vue/test-utils')
    const {
      default: CellSetting 
    } = await import('../CellSetting.vue')
    const wrapper = mount(CellSetting, {
      props: {
        row: {
          id: 'reachGapMs',
          entityKey: 'settings',
          entityLabel: 'Settings',
          fields: {
            setting: 'reachGapMs'
          }
        }
      }
    })
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('input[type="number"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('ms')
    wrapper.unmount()
  })
})
