// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SidePanel } from './side-panel';
import { Button } from './ui/button';

describe('SidePanel', () => {
  it('stays closed, with its form off the page, until the trigger is pressed', () => {
    render(
      <SidePanel trigger={<Button>Ongeza</Button>} title="Ongeza bidhaa · Add a product">
        <p>Jina la bidhaa</p>
      </SidePanel>,
    );

    expect(screen.getByRole('button', { name: 'Ongeza' })).toBeInTheDocument();
    expect(screen.queryByText('Jina la bidhaa')).not.toBeInTheDocument();
  });

  it('opens the panel and shows its title, description, and fields', async () => {
    const user = userEvent.setup();
    render(
      <SidePanel
        trigger={<Button>Ongeza tawi</Button>}
        title="Ongeza tawi · Add a branch"
        description="Jina moja linatosha."
      >
        <p>Jina la tawi</p>
      </SidePanel>,
    );

    await user.click(screen.getByRole('button', { name: 'Ongeza tawi' }));

    expect(screen.getByText('Ongeza tawi · Add a branch')).toBeInTheDocument();
    expect(screen.getByText('Jina moja linatosha.')).toBeInTheDocument();
    expect(screen.getByText('Jina la tawi')).toBeInTheDocument();
  });

  it('closes from its own close button, without navigating anywhere', async () => {
    const user = userEvent.setup();
    render(
      <SidePanel trigger={<Button>Ongeza</Button>} title="Ongeza bidhaa · Add a product">
        <p>Jina la bidhaa</p>
      </SidePanel>,
    );

    await user.click(screen.getByRole('button', { name: 'Ongeza' }));
    expect(screen.getByText('Jina la bidhaa')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Funga' }));
    expect(screen.queryByText('Jina la bidhaa')).not.toBeInTheDocument();
  });
});
