"use client";
import React, { useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/data";
import { bandLabels, datasetFor } from "@/lib/dataset";
import { CalcState, Selection, baseRate, buildingName, needActive } from "@/lib/engine";
import { GAME_CONTENT } from "@/lib/games";
import { GoodIcon } from "../GoodIcon";
import { Dropdown } from "../ui/Dropdown";
import { CatPill } from "./CatPill";
import { SavedPlans } from "./SavedPlans";

interface Props {
  st: CalcState;
  patch: (p: Partial<CalcState>) => void;
  gen: number;
  bumpGen: () => void;
  loadState: (st: CalcState) => void;
}

// In 1800 the region chips filter the good list. In 117 they pick the region the
// plan is BUILT in — which selects the producer, and therefore the rate and the
// chain — so the list is never filtered there, only reordered (home region
// first, cross-region imports last).
function finalGoodsList(st: CalcState) {
  const D = datasetFor(st);
  const all = Object.values(D.goods).filter((g) => g.isFinal);
  if (D.regionIsPlanning) return all;
  return all.filter((g) => !st.regionFilter || g.region === st.regionFilter);
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

/** The region chips: a filter in 1800, the plan's build region in 117. */
export function RegionChips({
  st,
  patch,
}: {
  st: CalcState;
  patch: (p: Partial<CalcState>) => void;
}) {
  const D = datasetFor(st);
  const entries = Object.entries(D.regions).map(([k, v]) => [Number(k), v] as [number, string]);
  const chips: [number, string][] = D.regionIsPlanning ? entries : [[0, "All"], ...entries];
  return (
    <>
      {D.regionIsPlanning && (
        <div className="note" style={{ margin: "0 0 6px" }}>
          <b>Building in</b> — this picks the recipe, not just the list. Flour is a Grain Mill
          (2/min) in Latium and a Donkey Mill (1/min) in Albion, and Leather takes salt in one and
          wood in the other.
        </div>
      )}
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
    </>
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
  const D = datasetFor(st);
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

  const tierName = (t: string | null) => (t ? D.tierLabels[t] || t : "—");
  const q = query.toLowerCase().trim();
  let options = finalGoodsList(st).filter((g) => !st.sel[g.id]);
  if (q)
    options = options.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        buildingName(st, g.id).toLowerCase().includes(q) ||
        tierName(g.tier).toLowerCase().includes(q)
    );
  options.sort(
    (a, b) =>
      D.regionRank(st, a.id) - D.regionRank(st, b.id) ||
      (D.tierOrder[a.tier ?? ""] ?? 99) - (D.tierOrder[b.tier ?? ""] ?? 99) ||
      a.name.localeCompare(b.name)
  );

  const selIds = Object.keys(st.sel).sort(
    (a, b) =>
      D.regionRank(st, a) - D.regionRank(st, b) ||
      (D.tierOrder[D.goods[a].tier ?? ""] ?? 99) - (D.tierOrder[D.goods[b].tier ?? ""] ?? 99)
  );

  return (
    <>
      <RegionChips st={st} patch={patch} />
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
                    <GoodIcon name={g.name} game={D.game} />
                    {g.name} <CatPill st={st} id={g.id} />
                  </b>
                  <span>
                    {buildingName(st, g.id)} · {fmt(baseRate(st, g.id))}/min
                  </span>
                </div>
                <small>
                  {D.regionLabel(st, g.id)} · {tierName(g.tier)}
                </small>
              </div>
            ))}
            {!options.length && <div className="opt muted">No matches</div>}
          </div>
        </div>
      </div>
      <div className="selected" id="selected">
        {selIds.length ? (
          selIds.map((id) => <SelRow key={`${id}:${gen}`} st={st} id={id} patch={patch} />)
        ) : (
          <div className="empty">
            Pick one or more final goods above.
            <br />
            Try a preset ↓
          </div>
        )}
      </div>
      <div className="presets" id="presets">
        {D.presets.map((p, i) => (
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
  const D = datasetFor(st);
  const g = D.goods[id];
  const s = st.sel[id];
  return (
    <div className="sel">
      <span className="dot" style={{ background: D.regionColor(st, id) }} />
      <div className="nm">
        <b title={g.name}>
          <GoodIcon name={g.name} game={D.game} />
          {g.name}
        </b>
        <span>
          {buildingName(st, id)} · {D.regionLabel(st, id)}
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
      <Dropdown
        className="unit"
        ariaLabel={`Unit for ${g.name}`}
        value={s.mode}
        onChange={(v) =>
          patch({ sel: { ...st.sel, [id]: { ...s, mode: v as Selection["mode"] } } })
        }
        options={[
          { value: "fac", label: "factories" },
          { value: "tpm", label: "t/min" },
        ]}
      />
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

// Pop-mode demos, per game. 1800's are the legacy buttons verbatim; 117's are
// the two starting tiers, one per region.
const POP_DEMOS: Record<string, { label: string; pop: Record<string, number> }[]> = {
  anno1800: [
    { label: "Demo · 3000 Farmers", pop: { farmers: 3000 } },
    { label: "Demo · small OW city", pop: { farmers: 2500, workers: 2000, artisans: 800 } },
  ],
  anno117: [
    { label: "Demo · 1500 Liberti", pop: { liberti: 1500 } },
    { label: "Demo · Latium town", pop: { liberti: 1200, plebeians: 800 } },
    { label: "Demo · Albion town", pop: { waders: 1200, smiths: 800 } },
  ],
};

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
  const D = datasetFor(st);
  const groups: Record<number, string[]> = {};
  for (const tid in D.pop) (groups[D.pop[tid].region] = groups[D.pop[tid].region] || []).push(tid);
  const regionIds = Object.keys(D.regions)
    .map(Number)
    .sort((a, b) => a - b);
  const totalRes = Object.values(st.pop).reduce((a, b) => a + (+b || 0), 0);
  const demos = POP_DEMOS[D.game] ?? [];

  return (
    <>
      <div className="note" style={{ margin: "0 0 4px" }}>
        Enter how many <b>residents</b> you have at each tier.{" "}
        {D.regionIsPlanning ? (
          <>
            Every tier also needs goods its own region can&apos;t make — those show up as{" "}
            <b>imports</b> in the results, and you ship them in.
          </>
        ) : (
          <>
            Needs unlock at their in-game population thresholds, so early counts only demand the
            goods they&apos;d really consume.{" "}
            <span className="muted">
              Postal service and a few late-DLC luxury goods aren&apos;t modelled.
            </span>
          </>
        )}
      </div>
      {/* Which needs control a game gets is its dataset's model, not its
          region behaviour — a third model would add a third case here. */}
      {D.needsModel === "bands" ? (
        <BandPicker st={st} patch={patch} />
      ) : (
        <LifestyleToggle st={st} patch={patch} />
      )}
      <div className="setrow" style={{ margin: "6px 0 0" }}>
        <span>
          Consumption rate <span className="muted">(item buffs lower it)</span>
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
      {regionIds.map((r) =>
        groups[r] ? (
          <React.Fragment key={r}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".4px",
                color: D.regionTint(r),
                margin: "12px 0 4px",
                fontWeight: 700,
              }}
            >
              {D.regions[r]}
            </div>
            {groups[r].map((tid) => {
              const t = D.pop[tid];
              const v = st.pop[tid] || 0;
              const act = Object.values(t.n).filter((d) => needActive(st, d, tid)).length;
              const tot = Object.keys(t.n).length;
              return (
                <div className="sel" key={tid}>
                  <span className="dot" style={{ background: D.regionTint(r) }} />
                  <div className="nm">
                    <b title={t.lbl}>{t.lbl}</b>
                    <span>
                      {v ? `${act} of ${tot} needs active` : `${tot} needs`}
                      {t.housed ? ` · house ${t.housed}` : ""}
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
        {demos.map((d) => (
          <React.Fragment key={d.label}>
            <button
              className="pbtn"
              onClick={() => {
                patch({ pop: d.pop });
                bumpGen();
              }}
            >
              {d.label}
            </button>{" "}
          </React.Fragment>
        ))}
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

/** 1800: lifestyle needs are an optional extra on top of needs + wants. */
function LifestyleToggle({
  st,
  patch,
}: {
  st: CalcState;
  patch: (p: Partial<CalcState>) => void;
}) {
  return (
    <div className="setrow" style={{ margin: "8px 0 2px" }}>
      <span>
        Lifestyle needs <span className="muted">(optional · bonus residents)</span>
      </span>{" "}
      <span className="toggle" id="lifeTog">
        <button className={st.lifestyle ? "" : "on"} onClick={() => patch({ lifestyle: false })}>
          Off
        </button>{" "}
        <button className={st.lifestyle ? "on" : ""} onClick={() => patch({ lifestyle: true })}>
          On
        </button>
      </span>
    </div>
  );
}

/** 117: needs carry no unlock thresholds, only one of four supply bands. This
 *  is how far up the player is actually supplying them. */
function BandPicker({ st, patch }: { st: CalcState; patch: (p: Partial<CalcState>) => void }) {
  const band = st.band ?? 2;
  const labels = bandLabels(datasetFor(st));
  return (
    <>
      <div className="setrow" style={{ margin: "8px 0 2px" }}>
        <span>
          Consume up to <span className="muted">(needs unlock as a residence upgrades)</span>
        </span>
      </div>
      <div className="chips" style={{ marginBottom: 4 }}>
        {labels.map((label, i) => (
          <span
            key={label}
            className={`chip ${band === i ? "on" : ""}`}
            title={
              i === 0
                ? "Only the goods a fresh residence demands"
                : `Everything up to and including ${label}`
            }
            onClick={() => patch({ band: i })}
          >
            {i === 0 ? label : `+ ${label}`}
          </span>
        ))}
      </div>
    </>
  );
}

function Settings({ st, patch }: { st: CalcState; patch: (p: Partial<CalcState>) => void }) {
  const D = datasetFor(st);
  const hasCoalChoice = D.hasCoalChoice;
  const hasElectricity = D.hasElectricity;
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
      {hasCoalChoice && (
        <div className="setrow">
          <span>Coal source</span>{" "}
          <span className="toggle" id="coalTog">
            <button
              className={st.coalTime === 30 ? "on" : ""}
              onClick={() => patch({ coalTime: 30 })}
            >
              Charcoal Kiln · 2/min
            </button>{" "}
            <button
              className={st.coalTime === 15 ? "on" : ""}
              onClick={() => patch({ coalTime: 15 })}
            >
              Coal Mine · 4/min
            </button>
          </span>
        </div>
      )}
      {hasElectricity && (
        <div className="setrow">
          <span>
            Electricity <span className="muted">(Old World ×2)</span>
          </span>{" "}
          <span className="toggle" id="elecTog">
            <button
              className={st.electricity ? "" : "on"}
              onClick={() => patch({ electricity: false })}
            >
              Off
            </button>{" "}
            <button
              className={st.electricity ? "on" : ""}
              onClick={() => patch({ electricity: true })}
            >
              On ⚡
            </button>
          </span>
        </div>
      )}
      <div className="setrow">
        <span>
          Silos <span className="muted">{GAME_CONTENT[D.game].siloHint}</span>
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
      {D.fuelGood && (
        <div className="note">
          🔥 Fuel is counted automatically: every kiln, forge and furnace burns{" "}
          {fmt(D.fuelPerMin)} t/min of {D.goods[D.fuelGood]?.name ?? D.fuelGood} while it runs, so
          it scales with the building count rather than with output.
        </div>
      )}
    </div>
  );
}
