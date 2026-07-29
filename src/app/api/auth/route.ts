import { NextRequest, NextResponse } from "next/server";
import { COOKIE, authEnabled, checkPassword, isAuthed, sessionToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    auth: authEnabled(),
    db: !!getDb(),
    authed: isAuthed(req),
  });
}

export async function POST(req: NextRequest) {
  if (!authEnabled())
    return NextResponse.json({ error: "auth not configured" }, { status: 503 });
  let password = "";
  try {
    ({ password } = await req.json());
  } catch {}
  if (!checkPassword(password))
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, sessionToken()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
