/**
 * Tests for KPICard — metric display with trend indicator.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPICard } from './kpi-card';

describe('KPICard', () => {
  it('renders title and value', () => {
    render(<KPICard title="Active Cranes" value={3} />);

    expect(screen.getByText('Active Cranes')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders string value', () => {
    render(<KPICard title="Status" value="Online" />);

    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<KPICard title="Load" value="12.5t" subtitle="of 30t max" />);

    expect(screen.getByText('of 30t max')).toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    render(<KPICard title="Load" value="12.5t" />);

    expect(screen.queryByText('of 30t max')).not.toBeInTheDocument();
  });

  it('renders trend indicator with upward arrow', () => {
    render(<KPICard title="Lifts" value={42} trend="up" trendValue="+12% today" />);

    const trendEl = screen.getByText(/\+12% today/);
    expect(trendEl).toBeInTheDocument();
    expect(trendEl.textContent).toContain('↑');
  });

  it('renders trend indicator with downward arrow', () => {
    render(<KPICard title="Alerts" value={5} trend="down" trendValue="-3 from yesterday" />);

    const trendEl = screen.getByText(/-3 from yesterday/);
    expect(trendEl).toBeInTheDocument();
    expect(trendEl.textContent).toContain('↓');
  });

  it('renders neutral trend with right arrow', () => {
    render(<KPICard title="Score" value="95%" trend="neutral" trendValue="No change" />);

    const trendEl = screen.getByText(/No change/);
    expect(trendEl.textContent).toContain('→');
  });

  it('renders icon when provided', () => {
    render(
      <KPICard
        title="Wind"
        value="14 km/h"
        icon={<span data-testid="wind-icon">W</span>}
      />
    );

    expect(screen.getByTestId('wind-icon')).toBeInTheDocument();
  });

  it('does not render trend section when trend is missing', () => {
    const { container } = render(<KPICard title="Test" value={0} trendValue="+1" />);

    // Should NOT render trend even if trendValue is set but trend is undefined
    expect(container.querySelector('.text-green-400')).not.toBeInTheDocument();
    expect(container.querySelector('.text-red-400')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <KPICard title="Test" value={0} className="custom-class" />
    );

    // The outer Card should have the custom class
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
