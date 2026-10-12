import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function fingerprint(value:unknown) {return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;}
export function signEvidence(value:unknown) {
  const key=process.env.AQUA_SESSION_SECRET;
  if(!key) throw new Error("Evidence signing key unavailable");
  return createHmac("sha256",key).update(canonical(value)).digest("hex");
}
export function verifySignature(value:unknown, signature:string) {
  const actual=Buffer.from(signEvidence(value));const supplied=Buffer.from(signature);
  return actual.length===supplied.length && timingSafeEqual(actual,supplied);
}
export function csvCell(value:unknown) {
  let text=String(value??"");
  if (/^[=+@\t\r]/.test(text)) text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
