/**
 * Tests for LoadMomentGauge — circular SVG gauge with color zones.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadMomentGauge } from './load-gauge';

describe('LoadMomentGauge', () => {
  it('renders percentage text', () => {
    render(<LoadMomentGauge percent={42} loadTonnes={12.5} maxTonnes={30} />);

    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('renders load values', () => {
    render(<LoadMomentGauge percent={42} loadTonnes={12.5} maxTonnes={30} />);

    expect(screen.getByText('12.5t / 30t')).toBeInTheDocument();
  });

  it('shows NORMAL label when load < 75%', () => {
    render(<LoadMomentGauge percent={50} loadTonnes={15} maxTonnes={30} />);

    expect(screen.getByText('NORMAL')).toBeInTheDocument();
  });

  it('shows WARNING label when load 75-89%', () => {
    render(<LoadMomentGauge percent={80} loadTonnes={24} maxTonnes={30} />);

    expect(screen.getByText('WARNING')).toBeInTheDocument();
  });

  it('shows OVERLOAD label when load >= 90%', () => {
    render(<LoadMomentGauge percent={95} loadTonnes={28.5} maxTonnes={30} />);

    expect(screen.getByText('OVERLOAD')).toBeInTheDocument();
  });

  it('clamps percent at 0', () => {
    render(<LoadMomentGauge percent={-10} loadTonnes={0} maxTonnes={30} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('NORMAL')).toBeInTheDocument();
  });

  it('clamps percent at 100', () => {
    render(<LoadMomentGauge percent={150} loadTonnes={45} maxTonnes={30} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('OVERLOAD')).toBeInTheDocument();
  });

  it('renders SVG element', () => {
    const { container } = render(
      <LoadMomentGauge percent={50} loadTonnes={15} maxTonnes={30} />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('applies custom size', () => {
    const { container } = render(
      <LoadMomentGauge percent={50} loadTonnes={15} maxTonnes={30} size={300} />
    );

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '300');
    expect(svg).toHaveAttribute('height', '300');
  });

  it('uses green color for normal load', () => {
    const { container } = render(
      <LoadMomentGauge percent={40} loadTonnes={12} maxTonnes={30} />
    );

    // Value arc should use green (#22c55e)
    const circles = container.querySelectorAll('circle');
    const valueArc = circles[1];
    expect(valueArc).toHaveAttribute('stroke', '#22c55e');
  });

  it('uses amber color for warning load', () => {
    const { container } = render(
      <LoadMomentGauge percent={82} loadTonnes={24.6} maxTonnes={30} />
    );

    const circles = container.querySelectorAll('circle');
    const valueArc = circles[1];
    expect(valueArc).toHaveAttribute('stroke', '#f59e0b');
  });

  it('uses red color for overload', () => {
    const { container } = render(
      <LoadMomentGauge percent={95} loadTonnes={28.5} maxTonnes={30} />
    );

    const circles = container.querySelectorAll('circle');
    const valueArc = circles[1];
    expect(valueArc).toHaveAttribute('stroke', '#dc2626');
  });

  it('renders with default size of 200', () => {
    const { container } = render(
      <LoadMomentGauge percent={50} loadTonnes={15} maxTonnes={30} />
    );

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '200');
  });
});
