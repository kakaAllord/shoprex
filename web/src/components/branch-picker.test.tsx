// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BranchPicker } from './branch-picker';
import type { BranchView } from '../lib/api/organization';

const branch = (id: string, name: string): BranchView => ({
  id,
  businessId: 'b1',
  name,
  isActive: true,
  createdAt: '2026-08-01T00:00:00.000Z',
});

describe('BranchPicker', () => {
  it('puts the branch in the URL, so a branch can be bookmarked', () => {
    render(
      <BranchPicker
        branches={[branch('one', 'Tawi Kuu'), branch('two', 'Tawi la Pili')]}
        selected="one"
        basePath="/owner/stock"
      />,
    );

    expect(screen.getByRole('link', { name: 'Tawi la Pili' })).toHaveAttribute(
      'href',
      '/owner/stock?branch=two',
    );
  });

  it('marks the branch being looked at', () => {
    render(
      <BranchPicker
        branches={[branch('one', 'Tawi Kuu'), branch('two', 'Tawi la Pili')]}
        selected="two"
        basePath="/owner/sales"
      />,
    );

    expect(screen.getByRole('link', { name: 'Tawi la Pili' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('disappears entirely when there is nothing to choose between', () => {
    // A one-branch shop, or a manager delegated exactly one branch, should not
    // be shown a chooser with one option in it.
    const { container } = render(
      <BranchPicker branches={[branch('one', 'Tawi Kuu')]} selected="one" basePath="/owner/stock" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders only what the backend was willing to say', () => {
    // GET /branches is already scoped: a manager gets their assigned branches
    // and nothing else. This component never filters, so it cannot disagree
    // with the server about who may see what.
    render(
      <BranchPicker
        branches={[branch('one', 'Tawi Kuu'), branch('two', 'Tawi la Pili')]}
        selected="one"
        basePath="/owner/stock"
      />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
