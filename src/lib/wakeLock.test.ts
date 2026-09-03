import { describe, expect, it } from "vitest"
import { requestWakeLock } from "./wakeLock"

describe("requestWakeLock", () => {
  it("returns null when the API is unavailable", async () => {
    expect(await requestWakeLock()).toBe(null)
  })

  it("returns a release function when the API is supported", async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const sentinel = { release }
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn().mockResolvedValue(sentinel) },
      writable: true,
      configurable: true,
    })

    const releaseController = await requestWakeLock()

    expect(navigator.wakeLock?.request).toHaveBeenCalledWith("screen")
    expect(releaseController).toBeInstanceOf(Function)
    await releaseController!()
    expect(release).toHaveBeenCalledTimes(1)
  })
})
