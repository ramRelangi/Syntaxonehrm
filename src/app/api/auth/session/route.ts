
// src/app/api/auth/session/route.ts
import { NextResponse } from 'next/server';
import { getSessionData } from '@/modules/auth/actions'; // Import your server action

export async function GET() {
  try {
    const session = await getSessionData();

    if (!session || !session.userId || !session.userRole) {
      return NextResponse.json({ error: 'No active session or session data incomplete.' }, { status: 401 });
    }

    // Return only necessary, non-sensitive session data
    return NextResponse.json({
      userId: session.userId,
      userRole: session.userRole,
      tenantId: session.tenantId, // Optionally return tenantId if needed by client
      tenantDomain: session.tenantDomain, // Optionally return tenantDomain
    });

  } catch (error: any) {
    console.error('[API /auth/session] Error fetching session data:', error);
    return NextResponse.json({ error: 'Failed to retrieve session information.', details: error.message }, { status: 500 });
  }
}
