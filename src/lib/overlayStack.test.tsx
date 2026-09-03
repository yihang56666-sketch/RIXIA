import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { hasOpenOverlays, resetOverlayStackForTesting, useOverlayInteraction } from './overlayStack'
import { useEffect, useRef } from 'react'

function Harness({ enabled, onClose }: { enabled: boolean; onClose?: () => void }) {
  useOverlayInteraction(enabled, onClose)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  return (
    <div>
      <div data-testid="state">open</div>
      <button onClick={() => { if (closeRef.current) closeRef.current() }}>manual</button>
    </div>
  )
}

describe('overlayStack', () => {
  afterEach(() => {
    resetOverlayStackForTesting()
  })

  it('locks scroll while an overlay is mounted and restores it after unmount', () => {
    const { unmount } = render(<Harness enabled />)

    expect(screen.getByTestId('state')).toHaveTextContent('open')
    expect(document.body.dataset.overlayScrollLock).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.dataset.overlayScrollLock).toBeUndefined()
    expect(document.body.style.overflow).toBe('')
  })

  it('tracks multiple overlays and still reports open until the last one closes', () => {
    const onClose = vi.fn()
    const first = render(<Harness enabled onClose={onClose} />)
    const second = render(<Harness enabled />)

    const states = screen.getAllByTestId('state')
    expect(states).toHaveLength(2)
    expect(states[0]).toHaveTextContent('open')
    expect(states[1]).toHaveTextContent('open')

    first.unmount()
    expect(screen.getByTestId('state')).toHaveTextContent('open')
    expect(onClose).not.toHaveBeenCalled()

    second.unmount()
    expect(hasOpenOverlays()).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('only routes Escape to the topmost overlay', () => {
    const topOnClose = vi.fn()
    render(<Harness enabled onClose={vi.fn()} />)
    render(<Harness enabled onClose={topOnClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(topOnClose).toHaveBeenCalledTimes(1)
  })
})
