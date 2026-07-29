"use client";
import React, { useCallback, useEffect, useState } from "react";
import { CalcState } from "@/lib/engine";
import { useAuth } from "@/lib/store";

interface PlanRow {
  id: string;
  name: string;
  data: CalcState;
  createdAt: number;
}

export function SavedPlans({
  st,
  loadState,
}: {
  st: CalcState;
  loadState: (st: CalcState) => void;
}) {
  const { status, db } = useAuth();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/plans");
      if (!r.ok) return;
      const j = await r.json();
      setPlans(j.plans);
    } catch {}
  }, []);

  useEffect(() => {
    if (status === "authed") refresh();
    else setPlans(null);
  }, [status, refresh]);

  if (!db || status === "off" || status === "loading") return null;

  return (
    <div className="settings">
      <div className="setrow">
        <span>💾 Saved plans</span>
        {status !== "authed" && <span className="muted">sign in to save</span>}
      </div>
      {status === "authed" && (
        <>
          <div className="plrow">
            <input
              placeholder="Name this plan…"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <button className="linkbtn" disabled={busy} onClick={save}>
              Save
            </button>
          </div>
          {plans === null ? (
            <div className="note">Loading plans…</div>
          ) : plans.length ? (
            plans.map((p) => (
              <div className="plitem" key={p.id}>
                <span
                  style={{ flex: 1, cursor: "pointer" }}
                  title="Load this plan"
                  onClick={() => loadState(p.data)}
                >
                  {p.name}
                </span>
                <button
                  className="plx"
                  title="Delete plan"
                  onClick={async () => {
                    await fetch(`/api/plans?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
                    refresh();
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          ) : (
            <div className="note">No saved plans yet — name the current setup and hit Save.</div>
          )}
        </>
      )}
    </div>
  );

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), data: st }),
      });
      setName("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }
}
