import { describe, expect, it } from 'vitest'
import { enforceDataUrlBudget, fitBackgroundSize, MAX_DATA_URL_CHARS } from './backgroundImage'

describe('fitBackgroundSize', () => {
  it('keeps a small image at its original dimensions', () => {
    expect(fitBackgroundSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('scales a landscape image down to the maximum edge', () => {
    expect(fitBackgroundSize(3200, 1800)).toEqual({ width: 2560, height: 1440 })
  })

  it('scales a portrait image down to the maximum edge', () => {
    expect(fitBackgroundSize(1200, 2400)).toEqual({ width: 1200, height: 2400 })
  })
})

describe('enforceDataUrlBudget', () => {
  it('keeps data URLs within the persistence budget', () => {
    expect(enforceDataUrlBudget('data:image/webp;base64,AAAA')).toBe('data:image/webp;base64,AAAA')
  })

  it('rejects over-budget data URLs (PNG fallback territory)', () => {
    const oversized = 'data:image/png;base64,' + 'A'.repeat(MAX_DATA_URL_CHARS + 1)
    expect(enforceDataUrlBudget(oversized)).toBeNull()
  })
})
