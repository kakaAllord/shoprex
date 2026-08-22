import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Shoprex — Meneja wa Shoprex',
  description:
    'Shoprex V1 — mfumo wa mauzo na stoo kwa maduka ya Tanzania. Owner and platform-administrator console.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sw">
      <body>{children}</body>
    </html>
  );
}
