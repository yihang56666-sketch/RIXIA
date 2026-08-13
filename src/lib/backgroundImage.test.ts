import { describe, expect, it } from 'vitest'
import { fitBackgroundSize } from './backgroundImage'

describe('fitBackgroundSize', () => {
  it('keeps a small image at its original dimensions', () => {
    expect(fitBackgroundSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('scales a landscape image down to the maximum edge', () => {
    expect(fitBackgroundSize(3200, 1800)).toEqual({ width: 1600, height: 900 })
  })

  it('scales a portrait image down to the maximum edge', () => {
    expect(fitBackgroundSize(1200, 2400)).toEqual({ width: 800, height: 1600 })
  })
})
