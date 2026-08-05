export type AquaRole = "admin" | "user";
export type AquaSession = { username: string; role: AquaRole; expiresAt: number };

export const SESSION_COOKIE = "aqua_session";
const encoder = new TextEncoder();

function base64UrlEncode(value: string) {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function signature(payload: string) {
  const secret = process.env.AQUA_SESSION_SECRET;
  if (!secret) throw new Error("Session secret is not configured");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  let binary = "";
  for (const byte of signed) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

export function authConfigured() {
  return Boolean(process.env.AQUA_SESSION_SECRET && process.env.AQUA_ADMIN_PASSWORD && process.env.AQUA_USER_PASSWORD);
}

export async function authenticate(username: string, password: string): Promise<AquaSession | null> {
  const adminUsername = process.env.AQUA_ADMIN_USERNAME || "admin";
  const userUsername = process.env.AQUA_USER_USERNAME || "user";
  const adminPassword = process.env.AQUA_ADMIN_PASSWORD || "";
  const userPassword = process.env.AQUA_USER_PASSWORD || "";
  let role: AquaRole | null = null;
  if (safeEqual(username, adminUsername) && safeEqual(password, adminPassword)) role = "admin";
  if (safeEqual(username, userUsername) && safeEqual(password, userPassword)) role = "user";
  if (!role || !password) return null;
  return { username, role, expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
}

export async function createSessionToken(session: AquaSession) {
  const payload = base64UrlEncode(JSON.stringify(session));
  return `${payload}.${await signature(payload)}`;
}

export async function getSession(request: Request): Promise<AquaSession | null> {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature || !safeEqual(suppliedSignature, await signature(payload))) return null;
  try {
    const session = JSON.parse(base64UrlDecode(payload)) as AquaSession;
    if (!session.username || !["admin", "user"].includes(session.role) || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

