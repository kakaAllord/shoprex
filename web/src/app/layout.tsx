import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Shoprex — Meneja wa Shoprex',
  description:
    'Shoprex V1 — mfumo wa mauzo na stoo kwa maduka ya Tanzania. Owner and platform-administrator console.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `suppressHydrationWarning` because next-themes stamps the resolved theme
    // onto <html> before React hydrates — the server cannot know it, and that
    // one attribute mismatch is expected rather than a bug to chase.
    <html lang="sw" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
