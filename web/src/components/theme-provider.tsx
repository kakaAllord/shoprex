'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * Light and dark are both first-class here, and neither is an inversion of the
 * other — `globals.css` steps every dark value against the dark surface. The
 * default follows the operating system, because a shop office at midday and
 * the same office at closing time are not the same room.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
