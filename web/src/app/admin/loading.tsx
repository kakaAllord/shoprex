import { LoadingState } from '../../components/states';

/** The platform administrator's console, while it waits. See `owner/loading.tsx`. */
export default function AdminLoading() {
  return (
    <main className="shoprex-shell shoprex-shell--wide">
      <LoadingState label="Inapakia · Loading…" rows={4} />
    </main>
  );
}
