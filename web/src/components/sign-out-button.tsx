'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOutIcon } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

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
    <DropdownMenuItem
      variant="destructive"
      disabled={busy}
      onSelect={(event) => {
        event.preventDefault();
        void signOut();
      }}
    >
      <LogOutIcon />
      {busy ? 'Inatoka...' : 'Toka · Sign out'}
    </DropdownMenuItem>
  );
}
