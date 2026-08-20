import { NextResponse } from "next/server";
import { authenticate, authConfigured, createSessionToken, SESSION_COOKIE } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!authConfigured()) return NextResponse.json({ error: "Login is not configured." }, { status: 503 });
  const body = await request.json() as { username?: string; password?: string };
  const session = await authenticate(String(body.username ?? "").trim(), String(body.password ?? ""));
  if (!session) return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  const response = NextResponse.json({ user: { username: session.username, role: session.role }, expiresAt: session.expiresAt });
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${await createSessionToken(session)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=28800`);
  return response;
}
