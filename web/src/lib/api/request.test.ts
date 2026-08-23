import { describe, expect, it } from 'vitest';
import { authorized, queryString } from './request';

describe('authorized', () => {
  it('carries the session as a bearer token and nothing else', () => {
    expect(authorized('abc.def.ghi')).toEqual({
      headers: { Authorization: 'Bearer abc.def.ghi' },
    });
  });
});

describe('queryString', () => {
  it('is empty when there is nothing to ask for', () => {
    expect(queryString({})).toBe('');
    expect(queryString({ limit: undefined, cursor: undefined })).toBe('');
  });

  it('leaves out a parameter that has no value', () => {
    // `?limit=&cursor=undefined` is a real bug that reads as a typo: the
    // backend answers 400 and the console looks broken.
    expect(queryString({ limit: 50, cursor: undefined })).toBe('?limit=50');
    expect(queryString({ query: '', limit: 10 })).toBe('?limit=10');
    expect(queryString({ cursor: null, limit: 1 })).toBe('?limit=1');
  });

  it('keeps a value of false and a value of zero, which are answers', () => {
    expect(queryString({ includeInactive: false })).toBe('?includeInactive=false');
    expect(queryString({ limit: 0 })).toBe('?limit=0');
  });

  it('escapes what a shop actually types', () => {
    expect(queryString({ query: 'Coca Cola & Fanta' })).toBe(
      '?query=Coca+Cola+%26+Fanta',
    );
  });
});
