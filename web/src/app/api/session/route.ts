import { NextResponse } from 'next/server';
import { ShoprexApiError } from '../../../lib/api/client';
import { consolePath, login } from '../../../lib/api/auth';
import { SESSION_COOKIE } from '../../../lib/api/session';

/**
 * Sign-in proxy. The browser posts credentials here; this handler calls the
 * Shoprex backend and stores the access token in an httpOnly cookie, so the token
 * is never exposed to page scripts. No business logic lives here.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Ombi si sahihi · Malformed request' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return NextResponse.json(
      { message: 'Barua pepe na nenosiri vinahitajika · Email and password are required' },
      { status: 400 },
    );
  }

  try {
    const result = await login(email, password);

    const response = NextResponse.json({
      user: result.user,
      redirectTo: consolePath(result.user.console),
    });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: result.accessToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return response;
  } catch (error) {
    if (error instanceof ShoprexApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: 'Seva haipatikani · Backend unreachable' },
      { status: 503 },
    );
  }
}

/** Sign out. */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
