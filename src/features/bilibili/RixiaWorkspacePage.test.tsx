import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RixiaWorkspacePage } from './RixiaWorkspacePage';
import { useAppStore } from '../../store/useAppStore';

describe('RixiaWorkspacePage', () => {
  it('renders the page chrome and routes the back button to the provided view', () => {
    useAppStore.setState({ view: 'rixia-page' } as any);
    render(
      <RixiaWorkspacePage title="自习室" backView="tasks" backLabel="回到任务">
        <p>页面内容</p>
      </RixiaWorkspacePage>,
    );

    expect(screen.getByRole('heading', { name: '自习室' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回到任务' })).toBeInTheDocument();
    expect(screen.getByText('页面内容')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '回到任务' }));
    expect(useAppStore.getState().view).toBe('tasks');
  });

  it('renders children without the surrounding page chrome when embedded is true', () => {
    const { container } = render(
      <RixiaWorkspacePage title="自习室" embedded>
        <p>嵌入内容</p>
      </RixiaWorkspacePage>,
    );

    expect(container.querySelector('.fb-page')).toBeNull();
    expect(screen.getByText('嵌入内容')).toBeInTheDocument();
  });
});
