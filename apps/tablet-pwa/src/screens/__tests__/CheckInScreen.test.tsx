/**
 * Tests for CheckInScreen component.
 * Validates operator card rendering, store interaction, manual entry, and MQTT publishing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CheckInScreen } from '../CheckInScreen';

/** Mock setOperator function returned by the store. */
const mockSetOperator = vi.fn();

/** Mock craneId returned by the store. */
const MOCK_CRANE_ID = 'CRANE-001';

/**
 * Mock the Zustand telemetry store.
 * The store hook is called with a selector: `useTelemetryStore((s) => s.craneId)`.
 * We intercept each selector call and return the appropriate mock value.
 */
vi.mock('@/stores/telemetry-store', () => ({
  useTelemetryStore: (selector: (state: Record<string, unknown>) => unknown) => {
    const mockState: Record<string, unknown> = {
      craneId: MOCK_CRANE_ID,
      setOperator: mockSetOperator,
    };
    return selector(mockState);
  },
}));

/** Mock the MQTT publish module — prevents real mqtt client from loading. */
const mockPublishMessage = vi.fn();
vi.mock('@/lib/mqtt-publish', () => ({
  publishMessage: (...args: unknown[]) => mockPublishMessage(...args),
}));

describe('CheckInScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders all demo operator cards', () => {
    render(<CheckInScreen />);

    // All 5 demo operators should be visible
    expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument();
    expect(screen.getByText('Suresh Patel')).toBeInTheDocument();
    expect(screen.getByText('Vikram Singh')).toBeInTheDocument();
    expect(screen.getByText('Arun Sharma')).toBeInTheDocument();
    expect(screen.getByText('Deepak Rao')).toBeInTheDocument();

    // Operator IDs should also be displayed
    expect(screen.getByText('OP-001')).toBeInTheDocument();
    expect(screen.getByText('OP-005')).toBeInTheDocument();
  });

  it('calls setOperator on the store when an operator card is clicked', () => {
    render(<CheckInScreen />);

    const rajeshButton = screen.getByRole('button', {
      name: 'Check in as Rajesh Kumar',
    });
    fireEvent.click(rajeshButton);

    expect(mockSetOperator).toHaveBeenCalledTimes(1);
    expect(mockSetOperator).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'OP-001',
        name: 'Rajesh Kumar',
        shiftStart: expect.any(Number),
      })
    );
  });

  it('allows manual entry mode: toggle form, fill name and ID, submit', () => {
    render(<CheckInScreen />);

    // Manual entry form should not be visible initially
    expect(screen.queryByLabelText('Full Name')).not.toBeInTheDocument();

    // Click the "Not in the list?" toggle
    const toggleButton = screen.getByText('Not in the list?');
    fireEvent.click(toggleButton);

    // Manual entry form fields should now be visible
    const nameInput = screen.getByLabelText('Full Name');
    const idInput = screen.getByLabelText('Employee ID');
    const submitButton = screen.getByRole('button', { name: 'Start Shift' });

    expect(nameInput).toBeInTheDocument();
    expect(idInput).toBeInTheDocument();

    // Submit button should be disabled when fields are empty
    expect(submitButton).toBeDisabled();

    // Fill in the form
    fireEvent.change(nameInput, { target: { value: 'Priya Nair' } });
    fireEvent.change(idInput, { target: { value: 'OP-099' } });

    // Submit button should now be enabled
    expect(submitButton).not.toBeDisabled();

    // Submit the form
    fireEvent.click(submitButton);

    // setOperator should have been called with the manual entry data
    expect(mockSetOperator).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'OP-099',
        name: 'Priya Nair',
        shiftStart: expect.any(Number),
      })
    );
  });

  it('publishes an MQTT check-in message when an operator checks in', () => {
    render(<CheckInScreen />);

    const vikramButton = screen.getByRole('button', {
      name: 'Check in as Vikram Singh',
    });
    fireEvent.click(vikramButton);

    expect(mockPublishMessage).toHaveBeenCalledTimes(1);
    expect(mockPublishMessage).toHaveBeenCalledWith(
      `mosy/${MOCK_CRANE_ID}/operator/check-in`,
      expect.objectContaining({
        crane_id: MOCK_CRANE_ID,
        operator_id: 'OP-003',
        operator_name: 'Vikram Singh',
        action: 'check-in',
        timestamp: expect.any(String),
      })
    );
  });
});
