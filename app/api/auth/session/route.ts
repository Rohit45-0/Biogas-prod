import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, user: { username: session.username, role: session.role }, expiresAt: session.expiresAt });
}
