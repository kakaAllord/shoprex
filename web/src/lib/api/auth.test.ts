import { describe, expect, it } from 'vitest';
import { consolePath } from './auth';

describe('console routing', () => {
  it('sends a platform administrator to the admin console', () => {
    expect(consolePath('admin')).toBe('/admin');
  });

  it('sends an owner to the owner console', () => {
    expect(consolePath('owner')).toBe('/owner');
  });
});
