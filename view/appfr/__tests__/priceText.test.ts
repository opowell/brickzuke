import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CellPostage from '../CellPostage.vue'
import CellPrice from '../CellPrice.vue'
import { priceText, priceUnitsPhrase } from '../priceText'
import { setSetting } from '../settings'

afterEach(() => {
  setSetting('priceUnits', 'cents')
})

describe('a price in the chosen units', () => {
  it('is cents from the start, keeping two figures of a small price', () => {
    expect(priceText(0.5)).toBe('50')
    expect(priceText(1.23)).toBe('123')
    expect(priceText(0.016)).toBe('1.6')
    expect(priceText(0.0034)).toBe('0.34')
    expect(priceText(0)).toBe('0')
  })

  it('drops the noughts after the point, in either units', () => {
    expect(priceText(0.05)).toBe('5')
    expect(priceText(0.002)).toBe('0.2')
    expect(priceText(0.03)).toBe('3')
    expect(priceText(0.1)).toBe('10')
    expect(priceText(10)).toBe('1000')
    setSetting('priceUnits', 'euros')
    expect(priceText(0.05)).toBe('0.05')
    expect(priceText(0.5)).toBe('0.5')
    expect(priceText(1)).toBe('1')
    expect(priceText(10)).toBe('10')
    expect(priceText(0.002)).toBe('0.002')
    expect(priceText(4.99, true)).toBe('4.99')
    expect(priceText(5, true)).toBe('5')
  })

  it('is euros when asked, with the places a small price needs', () => {
    setSetting('priceUnits', 'euros')
    expect(priceText(1.23)).toBe('1.23')
    expect(priceText(0.016)).toBe('0.016')
    expect(priceText(0.0034)).toBe('0.0034')
  })

  it('counts a whole-cent figure — postage — to no places in cents and two in euros', () => {
    expect(priceText(4.99, true)).toBe('499')
    setSetting('priceUnits', 'euros')
    expect(priceText(4.99, true)).toBe('4.99')
  })

  it('says nothing for what is not a number', () => {
    expect(priceText(Number.NaN)).toBe('')
  })

  it('names the units after the currency', () => {
    expect(priceUnitsPhrase('EUR')).toBe('EUR cents')
    expect(priceUnitsPhrase('')).toBe('cents')
    setSetting('priceUnits', 'euros')
    expect(priceUnitsPhrase('EUR')).toBe('EUR')
    expect(priceUnitsPhrase('')).toBe('')
  })
})

describe('the cells', () => {
  const row = {
    id: '1',
    entityKey: 'storeInventories',
    entityLabel: 'Store inventories',
    fields: {
      price: 'EUR 0.50',
      postageCurrency: 'EUR'
    }
  }

  it('draw a price in the chosen units, and follow the setting as it changes', async () => {
    const wrapper = mount(CellPrice, {
      props: {
        row,
        value: 0.5,
        column: {
          key: 'priceValue'
        }
      }
    })
    expect(wrapper.text()).toBe('50')
    setSetting('priceUnits', 'euros')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('0.5')
    wrapper.unmount()
  })

  it('draw postage in the chosen units, named after the currency', async () => {
    const wrapper = mount(CellPostage, {
      props: {
        row,
        value: 4.99,
        column: {
          key: 'postage'
        }
      }
    })
    expect(wrapper.text()).toBe('499 EUR cents')
    setSetting('priceUnits', 'euros')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('4.99 EUR')
    wrapper.unmount()
  })
})
