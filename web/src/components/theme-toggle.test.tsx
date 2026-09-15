// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './theme-toggle';

const setTheme = vi.fn();

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'system', resolvedTheme: 'light', setTheme }),
}));

describe('ThemeToggle', () => {
  it('offers light, dark, and following the machine', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /Change theme/ }));

    expect(screen.getByRole('menuitem', { name: /Mwanga/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Giza/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Ya simu/ })).toBeInTheDocument();
  });

  it('switches to the theme that was chosen', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /Change theme/ }));
    await user.click(screen.getByRole('menuitem', { name: /Giza/ }));

    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  /**
   * The server cannot know which theme the browser resolved, so the first
   * paint must not commit to one. Getting this wrong is a flicker on every
   * single page load, and it is invisible in a typecheck.
   */
  it('names the control for a screen reader in both languages', () => {
    render(<ThemeToggle />);

    expect(
      screen.getByRole('button', { name: /Badilisha mwonekano · Change theme/ }),
    ).toBeInTheDocument();
  });
});
