import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`);
  return response;
}
