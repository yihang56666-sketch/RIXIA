import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('renders the labelled control', () => {
    render(<Switch checked={false} onChange={() => undefined} label='专注勿扰' />)

    expect(screen.getByRole('switch', { name: '专注勿扰' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange with the inverted value', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label='专注勿扰' />)

    fireEvent.click(screen.getByRole('switch', { name: '专注勿扰' }))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('reflects the checked state', () => {
    const onChange = vi.fn()
    render(<Switch checked={true} onChange={onChange} label='启动时检查更新' />)

    expect(screen.getByRole('switch', { name: '启动时检查更新' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('switch', { name: '启动时检查更新' }))

    expect(onChange).toHaveBeenCalledWith(false)
  })
})
