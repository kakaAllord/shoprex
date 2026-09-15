import { LoadingState } from '@/components/states';

/** The platform administrator's console, while it waits. See `owner/loading.tsx`. */
export default function AdminLoading() {
  return (
    <main className="flex min-h-svh flex-col gap-4 p-4 md:p-6">
      <LoadingState label="Inapakia · Loading…" rows={4} />
    </main>
  );
}
