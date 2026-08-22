'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/session', { method: 'DELETE' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} className="shoprex-linkbutton" disabled={busy}>
      {busy ? 'Inatoka...' : 'Toka · Sign out'}
    </button>
  );
}
