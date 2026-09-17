// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AddStaffPanel } from './staff-add-panel';
import type { BranchView } from '@/lib/api/organization';

const branches: BranchView[] = [
  { id: 'b1', businessId: 'biz', name: 'Tawi Kuu', isActive: true, createdAt: '2026-08-01T00:00:00.000Z' },
];

describe('AddStaffPanel', () => {
  it('opens on the worker form by default', async () => {
    const user = userEvent.setup();
    render(<AddStaffPanel branches={branches} />);

    await user.click(screen.getByRole('button', { name: /Ongeza mtu/ }));

    expect(screen.getByLabelText('Jina kamili · Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Nenosiri · Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Barua pepe · Email')).not.toBeInTheDocument();
  });

  it('switches to the manager form on toggle', async () => {
    const user = userEvent.setup();
    render(<AddStaffPanel branches={branches} />);

    await user.click(screen.getByRole('button', { name: /Ongeza mtu/ }));
    await user.click(screen.getByRole('button', { name: 'Meneja · Manager' }));

    expect(screen.getByLabelText('Barua pepe · Email')).toBeInTheDocument();
  });

  /**
   * Found by driving this in a real browser: closing the panel after
   * switching to Manager left `role` state at MANAGER, so reopening later
   * showed the manager form instead of the worker default.
   */
  it('resets back to the worker form after the panel is closed and reopened', async () => {
    const user = userEvent.setup();
    render(<AddStaffPanel branches={branches} />);

    await user.click(screen.getByRole('button', { name: /Ongeza mtu/ }));
    await user.click(screen.getByRole('button', { name: 'Meneja · Manager' }));
    expect(screen.getByLabelText('Barua pepe · Email')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Barua pepe · Email')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ongeza mtu/ }));
    expect(screen.getByLabelText('Jina kamili · Full name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Barua pepe · Email')).not.toBeInTheDocument();
  });
});
