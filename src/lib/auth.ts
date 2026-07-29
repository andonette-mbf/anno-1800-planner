import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const COOKIE = "anno_auth";

function secret(): string | null {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || null;
}

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

/** Deterministic session token; rotate by changing APP_PASSWORD / AUTH_SECRET. */
export function sessionToken(): string | null {
  const s = secret();
  if (!s) return null;
  return createHmac("sha256", s).update("anno-planner-session-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function checkPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected || typeof password !== "string") return false;
  return safeEqual(password, expected);
}

export function isAuthed(req: NextRequest): boolean {
  const tok = sessionToken();
  if (!tok) return false;
  const cookie = req.cookies.get(COOKIE)?.value;
  return !!cookie && safeEqual(cookie, tok);
}
