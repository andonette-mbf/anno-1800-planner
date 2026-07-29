"use client";
import { CATLBL } from "@/lib/data";
import { CalcState, goodCat } from "@/lib/engine";

export function CatPill({ st, id }: { st: CalcState; id: string }) {
  const c = goodCat(st, id);
  if (c === undefined) return null;
  const [label, cls] = CATLBL[c];
  return <span className={`pill ${cls}`}>{label}</span>;
}

/** Finals show their category pill, or a plain "final" pill when uncategorised. */
export function FinalPill({ st, id, isFinal }: { st: CalcState; id: string; isFinal: boolean }) {
  const c = goodCat(st, id);
  if (c !== undefined) return <CatPill st={st} id={id} />;
  if (isFinal) return <span className="pill final">final</span>;
  return null;
}
