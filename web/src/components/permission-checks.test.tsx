// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PermissionChecks } from './permission-checks';

describe('PermissionChecks', () => {
  it('renders every permission, ticked or not', () => {
    // The backend *replaces* the set rather than merging it, so a form that
    // posted only the changes would quietly strip the rest. Every box has to
    // be present for the post to be truthful.
    render(<PermissionChecks granted={['SELL']} idPrefix="t" />);

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];

    expect(boxes).toHaveLength(4);
    expect(boxes.every((box) => box.name === 'permissions')).toBe(true);
  });

  it('ticks exactly what has been granted', () => {
    render(<PermissionChecks granted={['SELL', 'VIEW_STOCK']} idPrefix="t" />);

    expect(screen.getByLabelText(/Kuuza/)).toBeChecked();
    expect(screen.getByLabelText(/Kuona stoo/)).toBeChecked();
    expect(screen.getByLabelText(/Kupokea mzigo/)).not.toBeChecked();
    expect(screen.getByLabelText(/Kuona mauzo/)).not.toBeChecked();
  });

  it('leaves everything unticked for somebody new', () => {
    render(<PermissionChecks idPrefix="new" />);

    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).not.toBeChecked();
    }
  });

  it('labels each box with the job rather than the enum', () => {
    render(<PermissionChecks idPrefix="t" />);

    // An owner ticking boxes should not have to infer what VIEW_REPORTS covers.
    expect(screen.getByLabelText(/Browse the sales list/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Receive deliveries/)).toBeInTheDocument();
  });
});
