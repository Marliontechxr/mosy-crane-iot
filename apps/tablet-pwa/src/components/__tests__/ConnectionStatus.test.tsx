/**
 * Tests for ConnectionStatus component.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus } from '../ConnectionStatus';

describe('ConnectionStatus', () => {
  it('shows LIVE when connected', () => {
    render(<ConnectionStatus connected={true} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('shows OFFLINE when disconnected', () => {
    render(<ConnectionStatus connected={false} />);
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
  });

  it('has green indicator when connected', () => {
    const { container } = render(<ConnectionStatus connected={true} />);
    const dot = container.querySelector('.bg-green-500');
    expect(dot).toBeInTheDocument();
  });

  it('has red indicator when disconnected', () => {
    const { container } = render(<ConnectionStatus connected={false} />);
    const dot = container.querySelector('.bg-red-500');
    expect(dot).toBeInTheDocument();
  });
});
