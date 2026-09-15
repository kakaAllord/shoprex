// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  Sidebar,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from './sidebar';

function Frame({ defaultOpen = true }: { defaultOpen?: boolean }) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive tooltip="Ripoti">
              <span>Ripoti</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </Sidebar>
      <SidebarTrigger />
    </SidebarProvider>
  );
}

describe('the console sidebar', () => {
  it('opens at the width the reader last left it at', () => {
    // Two separate mounts rather than a rerender: `defaultOpen` seeds the
    // initial state, which is the whole point — the server reads the cookie
    // and hands the first paint the right width.
    const open = render(<Frame defaultOpen />);
    expect(open.container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'expanded',
    );
    open.unmount();

    const closed = render(<Frame defaultOpen={false} />);
    expect(closed.container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'collapsed',
    );
  });

  it('collapses and expands from the trigger', async () => {
    const user = userEvent.setup();
    render(<Frame />);

    await user.click(screen.getByRole('button', { name: /Fungua au funga menyu/ }));

    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'collapsed',
    );
  });

  /**
   * The width is remembered in a cookie rather than in `localStorage` so the
   * *server* can read it and render the right width on the first paint. If
   * this stops being written, the sidebar starts snapping sideways a moment
   * after every page load.
   */
  it('remembers the choice somewhere the server can read it', async () => {
    const user = userEvent.setup();
    render(<Frame />);

    await user.click(screen.getByRole('button', { name: /Fungua au funga menyu/ }));

    expect(document.cookie).toContain('shoprex_sidebar=false');
  });

  it('marks the destination the reader is on, and not by colour alone', () => {
    render(<Frame />);

    expect(screen.getByRole('button', { name: 'Ripoti' })).toHaveAttribute(
      'data-active',
      'true',
    );
  });
});
