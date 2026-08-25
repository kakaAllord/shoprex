import { NextResponse } from 'next/server';
import { buildApiUrl } from '../../../../lib/api/client';
import { readSessionToken } from '../../../../lib/api/session';

/**
 * Streams the backend's daily-report PDF to the browser.
 *
 * The access token lives in an **httpOnly cookie** — page scripts, and so a
 * plain `<a href>` to the backend, never see it. So the download has to pass
 * through a server route that reads the cookie and forwards the bearer token,
 * the same way every other authenticated call in this console does.
 *
 * No business logic lives here: the branch, the date, and the authorization
 * are all the backend's, this only relays the bytes and the two headers a
 * download needs.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const token = await readSessionToken();

  if (!token) {
    return NextResponse.json({ message: 'Ingia kwanza · Sign in first' }, { status: 401 });
  }

  const url = new URL(request.url);
  const branchId = url.searchParams.get('branchId');
  const date = url.searchParams.get('date');

  if (!branchId) {
    return NextResponse.json({ message: 'branchId inahitajika · branchId is required' }, { status: 400 });
  }

  const backendUrl = buildApiUrl(
    `/branches/${branchId}/reports/daily.pdf${date ? `?date=${encodeURIComponent(date)}` : ''}`,
  );

  const upstream = await fetch(backendUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    const body = await upstream.text();

    return NextResponse.json(
      { message: body || 'Ripoti haipatikani · The report could not be produced' },
      { status: upstream.status },
    );
  }

  const bytes = await upstream.arrayBuffer();

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ?? 'attachment; filename="ripoti.pdf"',
    },
  });
}
