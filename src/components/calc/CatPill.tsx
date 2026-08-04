"use client";
import { datasetFor } from "@/lib/dataset";
import { CalcState, goodCat } from "@/lib/engine";

export function CatPill({ st, id }: { st: CalcState; id: string }) {
  const c = goodCat(st, id);
  if (c === undefined) return null;
  // 1800 has three bands (need/want/lifestyle), 117 four (basic/wanted/
  // refined/luxury) — the labels and their pill colours come from the dataset.
  const band = datasetFor(st).catLabels[c];
  if (!band) return null;
  const [label, cls] = band;
  return <span className={`pill ${cls}`}>{label}</span>;
}

/** Finals show their category pill, or a plain "final" pill when uncategorised. */
export function FinalPill({ st, id, isFinal }: { st: CalcState; id: string; isFinal: boolean }) {
  const c = goodCat(st, id);
  if (c !== undefined) return <CatPill st={st} id={id} />;
  if (isFinal) return <span className="pill final">final</span>;
  return null;
}
