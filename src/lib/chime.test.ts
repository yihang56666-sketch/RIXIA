import { describe, expect, it } from 'vitest'
import { playChime } from './chime'

describe('playChime', () => {
  it('does not throw when AudioContext exists', () => {
    const contexts: unknown[] = []
    window.AudioContext = class MockAudioContext {
      currentTime = 0
      resume = () => Promise.resolve()
      createOscillator() {
        const oscillator: any = {}
        oscillator.connect = () => oscillator
        oscillator.start = () => oscillator
        oscillator.stop = () => oscillator
        return oscillator
      }
      createGain() {
        const gain: any = {}
        gain.gain = {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        }
        gain.connect = () => gain
        return gain
      }
      destination = {}
      close = () => Promise.resolve()
      constructor() {
        contexts.push(this)
        return this
      }
    } as unknown as typeof AudioContext

    expect(() => playChime()).not.toThrow()
    expect(contexts).toHaveLength(1)

    delete (window as any).AudioContext
  })

  it('does not throw when AudioContext is unavailable', () => {
    expect(() => playChime()).not.toThrow()
  })
})
