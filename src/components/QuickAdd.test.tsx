import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuickAdd } from './QuickAdd';

describe('QuickAdd', () => {
  it('renders the placeholder and submit button', () => {
    render(<QuickAdd placeholder='添加任务' onSubmit={() => undefined} />);

    expect(screen.getByPlaceholderText('添加任务')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加' })).toBeInTheDocument();
  });

  it('submits the current value and clears the input', () => {
    const onSubmit = vi.fn();
    render(<QuickAdd placeholder='输入待办' onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('输入待办'), { target: { value: '复盘' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    expect(onSubmit).toHaveBeenCalledWith('复盘');
    expect(screen.getByPlaceholderText('输入待办')).toHaveValue('');
  });

  it('supports a custom submit button label', () => {
    const onSubmit = vi.fn();
    render(<QuickAdd placeholder='记录想法' onSubmit={onSubmit} button='记一笔' />);

    fireEvent.change(screen.getByPlaceholderText('记录想法'), { target: { value: '灵感' } });
    fireEvent.click(screen.getByRole('button', { name: '记一笔' }));

    expect(onSubmit).toHaveBeenCalledWith('灵感');
    expect(screen.queryByRole('button', { name: '添加' })).not.toBeInTheDocument();
  });
});
