import { NextResponse } from 'next/server';
import { consolePath, signup } from '../../../lib/api/auth';
import { ShoprexApiError } from '../../../lib/api/client';
import { SESSION_COOKIE } from '../../../lib/api/session';

/**
 * Owner self-registration proxy. Forwards to the backend, then stores the
 * returned token in an httpOnly cookie so the new owner is signed straight in.
 * All validation lives in the backend; this handler only carries the request.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Ombi si sahihi · Malformed request' }, { status: 400 });
  }

  const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

  try {
    const result = await signup({
      shopName: asText(body.shopName),
      email: asText(body.email),
      phone: asText(body.phone),
      password: typeof body.password === 'string' ? body.password : '',
      fullName: asText(body.fullName) || undefined,
    });

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
