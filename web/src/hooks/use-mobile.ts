'use client';

import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Starts `false` rather than guessing, because the server has no window and a
 * guess that disagrees with the client hydrates into a flicker.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  return isMobile;
}
