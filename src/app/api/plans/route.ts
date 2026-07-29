import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getDb } from "@/lib/db";

function guard(req: NextRequest) {
  const db = getDb();
  if (!db) return { err: NextResponse.json({ error: "no database configured" }, { status: 503 }) };
  if (!isAuthed(req)) return { err: NextResponse.json({ error: "unauthorised" }, { status: 401 }) };
  return { db };
}

export async function GET(req: NextRequest) {
  const g = guard(req);
  if (g.err) return g.err;
  const plans = await g.db.plan.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      data: p.data,
      createdAt: p.createdAt.getTime(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const g = guard(req);
  if (g.err) return g.err;
  let name = "";
  let data: unknown;
  try {
    ({ name, data } = await req.json());
  } catch {}
  if (!name || typeof name !== "string" || name.length > 120 || !data || typeof data !== "object")
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const plan = await g.db.plan.create({ data: { name: name.trim(), data: data as object } });
  return NextResponse.json({ id: plan.id });
}

export async function DELETE(req: NextRequest) {
  const g = guard(req);
  if (g.err) return g.err;
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await g.db.plan.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
