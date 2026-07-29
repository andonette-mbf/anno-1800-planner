import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) return NextResponse.json({ error: "no database configured" }, { status: 503 });
  if (!isAuthed(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const row = await db.companionState.findUnique({ where: { id: 1 } });
  return NextResponse.json(
    row ? { data: row.data, updatedAt: row.updatedAt.getTime() } : { data: null, updatedAt: 0 }
  );
}

export async function PUT(req: NextRequest) {
  const db = getDb();
  if (!db) return NextResponse.json({ error: "no database configured" }, { status: 503 });
  if (!isAuthed(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  let data: unknown;
  try {
    ({ data } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!data || typeof data !== "object")
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const row = await db.companionState.upsert({
    where: { id: 1 },
    create: { id: 1, data: data as object },
    update: { data: data as object },
  });
  return NextResponse.json({ updatedAt: row.updatedAt.getTime() });
}
