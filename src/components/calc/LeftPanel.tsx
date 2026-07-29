"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  GOODS,
  POP,
  PRESETS,
  REGIONS,
  TIER_ORDER,
  fmt,
  regionColor,
  tierName,
} from "@/lib/data";
import {
  CalcState,
  Selection,
  buildingName,
  needActive,
} from "@/lib/engine";
import { CatPill } from "./CatPill";
import { SavedPlans } from "./SavedPlans";

interface Props {
  st: CalcState;
  patch: (p: Partial<CalcState>) => void;
  gen: number;
  bumpGen: () => void;
  loadState: (st: CalcState) => void;
}

function finalGoodsList(st: CalcState) {
  return Object.values(GOODS)
    .filter((g) => g.isFinal)
    .filter((g) => !st.regionFilter || g.region === st.regionFilter);
}

export function LeftPanel({ st, patch, gen, bumpGen, loadState }: Props) {
  const selCount = Object.keys(st.sel).length;
  return (
    <section className="card stack">
      <div className="hd">
        <h2>What do you want to make?</h2>
        <span className="muted" id="selCount">
          {st.mode === "goods" && selCount ? `${selCount} selected` : ""}
        </span>
      </div>
      <div className="bd">
        <div className="toggle" id="modeTog" style={{ display: "flex", marginBottom: 12 }}>
          <button
            className={st.mode === "goods" ? "on" : ""}
            style={{ flex: 1 }}
            onClick={() => patch({ mode: "goods" })}
          >
            🎯 Final goods
          </button>{" "}
          <button
            className={st.mode === "pop" ? "on" : ""}
            style={{ flex: 1 }}
            onClick={() => patch({ mode: "pop" })}
          >
            👥 Population
          </button>
        </div>
        <div id="goodsPanel" className={st.mode === "pop" ? "hidden" : ""}>
          <GoodsPanel st={st} patch={patch} gen={gen} bumpGen={bumpGen} />
        </div>
        <div id="popPanel" className={st.mode === "pop" ? "" : "hidden"}>
          <PopPanel st={st} patch={patch} gen={gen} bumpGen={bumpGen} />
        </div>
        <Settings st={st} patch={patch} />
        <SavedPlans st={st} loadState={loadState} />
      </div>
    </section>
  );
}

function GoodsPanel({
  st,
  patch,
  gen,
  bumpGen,
}: {
  st: CalcState;
  patch: (p: Partial<CalcState>) => void;
  gen: number;
  bumpGen: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.(".picker")) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const q = query.toLowerCase().trim();
  let options = finalGoodsList(st).filter((g) => !st.sel[g.id]);
  if (q)
    options = options.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.building.toLowerCase().includes(q) ||
        tierName(g.tier).toLowerCase().includes(q)
    );
  options.sort(
    (a, b) =>
      a.region - b.region ||
      (TIER_ORDER[a.tier ?? ""] ?? 99) - (TIER_ORDER[b.tier ?? ""] ?? 99) ||
      a.name.localeCompare(b.name)
  );

  const selIds = Object.keys(st.sel).sort(
    (a, b) =>
      GOODS[a].region - GOODS[b].region ||
      (TIER_ORDER[GOODS[a].tier ?? ""] ?? 99) - (TIER_ORDER[GOODS[b].tier ?? ""] ?? 99)
  );

  const chips: [number, string][] = [[0, "All"], ...Object.entries(REGIONS).map(
    ([k, v]) => [Number(k), v] as [number, string]
  )];

  return (
    <>
      <div className="chips" id="regionChips">
        {chips.map(([r, label]) => (
          <span
            key={r}
            className={`chip ${st.regionFilter === r ? "on" : ""}`}
            onClick={() => patch({ regionFilter: r })}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="searchrow picker" ref={pickerRef}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            id="search"
            placeholder={`Add a good — search ${finalGoodsList({ ...st, regionFilter: 0 }).length} products…`}
            autoComplete="off"
            value={query}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
          />
          <div className={`pop ${open ? "open" : ""}`} id="pop">
            {options.slice(0, 60).map((g) => (
              <div
                key={g.id}
                className="opt"
                onClick={() => {
                  patch({ sel: { ...st.sel, [g.id]: { mode: "fac", val: 1 } } });
                  setQuery("");
                }}
              >
                <div className="optlbl">
                  <b>
                    {g.name} <CatPill st={st} id={g.id} />
                  </b>
                  <span>
                    {buildingName(st, g.id)} · {fmt(g.rate)}/min
                  </span>
                </div>
                <small>
                  {g.regionName} · {tierName(g.tier)}
                </small>
              </div>
            ))}
            {!options.length && <div className="opt muted">No matches</div>}
          </div>
        </div>
      </div>
      <div className="selected" id="selected">
        {selIds.length ? (
          selIds.map((id) => (
            <SelRow key={`${id}:${gen}`} st={st} id={id} patch={patch} />
          ))
        ) : (
          <div className="empty">
            Pick one or more final goods above.
            <br />
            Try a preset ↓
          </div>
        )}
      </div>
      <div className="presets" id="presets">
        {PRESETS.map((p, i) => (
          <button
            key={i}
            className="pbtn"
            onClick={() => {
              const sel: Record<string, Selection> = {};
              for (const g in p.sel)
                sel[g] = { mode: p.sel[g][0] as Selection["mode"], val: p.sel[g][1] };
              patch({ sel });
              bumpGen();
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
    </>
  );
}

function SelRow({
  st,
  id,
  patch,
}: {
  st: CalcState;
  id: string;
  patch: (p: Partial<CalcState>) => void;
}) {
  const g = GOODS[id];
  const s = st.sel[id];
  return (
    <div className="sel">
      <span className="dot" style={{ background: regionColor(g.region) }} />
      <div className="nm">
        <b title={g.name}>{g.name}</b>
        <span>
          {buildingName(st, id)} · {g.regionName}
        </span>
      </div>
      <input
        type="number"
        min={0}
        step={0.5}
        defaultValue={s.val}
        className="valIn"
        onChange={(e) => {
          const val = Math.max(0, parseFloat(e.target.value) || 0);
          patch({ sel: { ...st.sel, [id]: { ...s, val } } });
        }}
      />
      <select
        className="unit"
        value={s.mode}
        onChange={(e) =>
          patch({ sel: { ...st.sel, [id]: { ...s, mode: e.target.value as Selection["mode"] } } })
        }
      >
        <option value="fac">factories</option>
        <option value="tpm">t/min</option>
      </select>
      <button
        className="x"
        title="remove"
        onClick={() => {
          const sel = { ...st.sel };
          delete sel[id];
          patch({ sel });
        }}
      >
        ×
      </button>
    </div>
  );
}

function PopPanel({
  st,
  patch,
  gen,
  bumpGen,
}: {
  st: CalcState;
  patch: (p: Partial<CalcState>) => void;
  gen: number;
  bumpGen: () => void;
}) {
  const groups: Record<number, string[]> = {};
  for (const tid in POP) (groups[POP[tid].r] = groups[POP[tid].r] || []).push(tid);
  const totalRes = Object.values(st.pop).reduce((a, b) => a + (+b || 0), 0);

  return (
    <>
      <div className="note" style={{ margin: "0 0 4px" }}>
        Enter how many <b>residents</b> you have at each tier. Needs unlock at their in-game
        population thresholds, so early counts only demand the goods they&apos;d really consume.{" "}
        <span className="muted">Postal service and a few late-DLC luxury goods aren&apos;t modelled.</span>
      </div>
      <div className="setrow" style={{ margin: "8px 0 2px" }}>
        <span>
          Lifestyle needs <span className="muted">(optional · bonus residents)</span>
        </span>{" "}
        <span className="toggle" id="lifeTog">
          <button
            className={st.lifestyle ? "" : "on"}
            onClick={() => patch({ lifestyle: false })}
          >
            Off
          </button>{" "}
          <button className={st.lifestyle ? "on" : ""} onClick={() => patch({ lifestyle: true })}>
            On
          </button>
        </span>
      </div>
      <div className="setrow" style={{ margin: "6px 0 0" }}>
        <span>
          Consumption rate <span className="muted">(newspaper &amp; item buffs lower it)</span>
        </span>
        <output id="consOut">{st.cons}%</output>
      </div>
      <input
        type="range"
        id="consRange"
        min={50}
        max={150}
        step={1}
        value={st.cons}
        onChange={(e) => patch({ cons: +e.target.value })}
      />
      {[1, 2, 4, 5].map((r) =>
        groups[r] ? (
          <React.Fragment key={r}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".4px",
                color: regionColor(r),
                margin: "12px 0 4px",
                fontWeight: 700,
              }}
            >
              {REGIONS[r]}
            </div>
            {groups[r].map((tid) => {
              const t = POP[tid];
              const v = st.pop[tid] || 0;
              const act = Object.values(t.n).filter((d) => needActive(st, d, tid)).length;
              const tot = Object.keys(t.n).length;
              return (
                <div className="sel" key={tid}>
                  <span className="dot" style={{ background: regionColor(r) }} />
                  <div className="nm">
                    <b title={t.lbl}>{t.lbl}</b>
                    <span>
                      {v ? `${act} of ${tot} needs active` : `${tot} needs`} · house {t.fh}
                    </span>
                  </div>
                  <input
                    key={`${tid}:${gen}`}
                    type="number"
                    min={0}
                    step={10}
                    defaultValue={v || ""}
                    placeholder="0"
                    className="popIn valIn"
                    onChange={(e) => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      const pop = { ...st.pop };
                      if (val) pop[tid] = val;
                      else delete pop[tid];
                      patch({ pop });
                    }}
                  />
                </div>
              );
            })}
          </React.Fragment>
        ) : null
      )}
      <div className="presets">
        <button
          className="pbtn"
          onClick={() => {
            patch({ pop: {} });
            bumpGen();
          }}
        >
          Clear
        </button>{" "}
        <button
          className="pbtn"
          onClick={() => {
            patch({ pop: { farmers: 3000 } });
            bumpGen();
          }}
        >
          Demo · 3000 Farmers
        </button>{" "}
        <button
          className="pbtn"
          onClick={() => {
            patch({ pop: { farmers: 2500, workers: 2000, artisans: 800 } });
            bumpGen();
          }}
        >
          Demo · small OW city
        </button>
      </div>
      <div
        className="setrow"
        style={{ marginTop: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}
      >
        <span>Total residents</span>
        <output id="popTot">{fmt(totalRes, 0)}</output>
      </div>
    </>
  );
}

function Settings({ st, patch }: { st: CalcState; patch: (p: Partial<CalcState>) => void }) {
  return (
    <div className="settings">
      <div className="setrow">
        <label htmlFor="prod">Productivity (items / trade union)</label>
        <output id="prodOut">{st.prod}%</output>
      </div>
      <input
        type="range"
        id="prod"
        min={50}
        max={500}
        step={5}
        value={st.prod}
        onChange={(e) => patch({ prod: +e.target.value })}
      />
      <div className="setrow">
        <span>Coal source</span>{" "}
        <span className="toggle" id="coalTog">
          <button className={st.coalTime === 30 ? "on" : ""} onClick={() => patch({ coalTime: 30 })}>
            Charcoal Kiln · 2/min
          </button>{" "}
          <button className={st.coalTime === 15 ? "on" : ""} onClick={() => patch({ coalTime: 15 })}>
            Coal Mine · 4/min
          </button>
        </span>
      </div>
      <div className="setrow">
        <span>
          Electricity <span className="muted">(Old World ×2)</span>
        </span>{" "}
        <span className="toggle" id="elecTog">
          <button className={st.electricity ? "" : "on"} onClick={() => patch({ electricity: false })}>
            Off
          </button>{" "}
          <button className={st.electricity ? "on" : ""} onClick={() => patch({ electricity: true })}>
            On ⚡
          </button>
        </span>
      </div>
      <div className="setrow">
        <span>
          Silos <span className="muted">(animal farms ×2, eat feed)</span>
        </span>{" "}
        <span className="toggle" id="siloTog">
          <button className={st.silo ? "" : "on"} onClick={() => patch({ silo: false })}>
            Off
          </button>{" "}
          <button className={st.silo ? "on" : ""} onClick={() => patch({ silo: true })}>
            On 🌾
          </button>
        </span>
      </div>
      <div className="setrow">
        <span>Round buildings up</span>{" "}
        <span className="toggle" id="roundTog">
          <button className={st.round ? "on" : ""} onClick={() => patch({ round: true })}>
            On
          </button>{" "}
          <button className={st.round ? "" : "on"} onClick={() => patch({ round: false })}>
            Off (exact)
          </button>
        </span>
      </div>
    </div>
  );
}
