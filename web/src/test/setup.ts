// DOM matchers (toHaveValue, toHaveTextContent, ...) for component tests.
import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements no `matchMedia`, and the sidebar asks for one to decide
 * whether it is a drawer or a rail. Answering "not mobile" keeps component
 * tests on the desktop path, which is the one every assertion here is about.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
