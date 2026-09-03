import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CaptureButton } from './CaptureButton';
import { useAppStore } from '../store/useAppStore';

const popoverBackdrop = () => screen.queryByRole('presentation', { name: '' });
const captureFab = () => screen.getByRole('button', { name: '快速收集' });

describe('CaptureButton', () => {
  beforeEach(() => {
    useAppStore.setState({ view: 'tasks', inbox: [] } as any);
  });

  it('shows a floating capture button when the view supports quick capture', () => {
    render(<CaptureButton />);
    expect(captureFab()).toBeInTheDocument();
    expect(popoverBackdrop()).not.toBeInTheDocument();
  });

  it('opens the quick add popover and stores inbox entries when submitted', () => {
    render(<CaptureButton />);

    fireEvent.click(captureFab());

    const dialog = screen.getByRole('dialog', { name: '快速收集' });
    expect(dialog).toBeInTheDocument();
    expect(popoverBackdrop()).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('输入想法或待办，回车保存'), { target: { value: '复习错题本' } });
    fireEvent.submit(screen.getByPlaceholderText('输入想法或待办，回车保存'));

    expect(useAppStore.getState().inbox).toHaveLength(1);
    expect(useAppStore.getState().inbox[0].text).toBe('复习错题本');
    expect(popoverBackdrop()).not.toBeInTheDocument();
  });

  it('does not render on views where quick capture is hidden', () => {
    useAppStore.setState({ view: 'bilibili-player' } as any);
    render(<CaptureButton />);
    expect(screen.queryByRole('button', { name: '快速收集' })).not.toBeInTheDocument();
  });
});
