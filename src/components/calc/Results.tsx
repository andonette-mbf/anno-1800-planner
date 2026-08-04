"use client";
import React from "react";
import { GOODS, SILO, SILO_FEED, fmt, regionColor, tierName } from "@/lib/data";
import {
  BuildingRow,
  CalcState,
  buildingName,
  buildingRows,
  chainDemand,
  dispTier,
  displaySort,
  effRate,
  optimPlan,
  perfectRatio,
  targets,
  wholeTotalStat,
} from "@/lib/engine";
import { CatPill, FinalPill } from "./CatPill";

interface Props {
  st: CalcState;
  patch: (p: Partial<CalcState>) => void;
}

const TABS: { key: CalcState["tab"]; label: string }[] = [
  { key: "whole", label: "⚖️ Optimal build" },
  { key: "ratio", label: "💯 Perfect ratio" },
  { key: "buildings", label: "🏭 Buildings (exact output)" },
  { key: "shared", label: "🔗 Shared resources" },
  { key: "tree", label: "🌳 Chain tree" },
];

export function Results({ st, patch }: Props) {
  const R = buildingRows(st);
  const ids = Object.keys(R.demand);
  const finals = ids.filter((id) => GOODS[id].isFinal).length;
  const regions = [...new Set(ids.map((id) => GOODS[id].region))].length;
  const totalStat =
    st.tab === "whole" ? fmt(wholeTotalStat(st, R.demand), 0) : fmt(R.totalBuildings, st.round ? 0 : 1);

  return (
    <section>
      <div className="summary" id="summary">
        <div className="stat">
          <div className="k">Total buildings</div>
          <div className="v num">{totalStat}</div>
        </div>
        <div className="stat">
          <div className="k">Distinct goods</div>
          <div className="v num">
            {ids.length} <small>{finals} final</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">{st.mode === "pop" ? "Consumed goods" : "Production lines"}</div>
          <div className="v num">{Object.keys(targets(st)).length}</div>
        </div>
        <div className="stat">
          <div className="k">Regions</div>
          <div className="v num">{regions}</div>
        </div>
      </div>
      <div className="tabs" id="tabs">
        {TABS.map((t) => (
          <div
            key={t.key}
            className={`tab ${st.tab === t.key ? "on" : ""}`}
            onClick={() => patch({ tab: t.key })}
          >
            {t.label}
          </div>
        ))}
      </div>
      <div className="card">
        <div className="bd">
          <div className="tabpane on">
            {!ids.length ? (
              <div className="empty" style={{ padding: 36 }}>
                {st.mode === "pop"
                  ? "Enter a population count for one or more tiers on the left."
                  : "Nothing selected yet — add a good or hit a preset."}
              </div>
            ) : st.tab === "buildings" ? (
              <BuildingsPane st={st} R={R} />
            ) : st.tab === "shared" ? (
              <SharedPane st={st} R={R} />
            ) : st.tab === "whole" ? (
              <OptimalPane st={st} />
            ) : st.tab === "ratio" ? (
              <RatioPane st={st} />
            ) : (
              <TreePane st={st} />
            )}
          </div>
        </div>
      </div>
      <div className="footer">
        Rates are tons/min at the chosen productivity. 1 factory consumes 1 t of each input per 1 t
        of output; building ratios come from each building&apos;s production time.
        <br />
        Base data: production times &amp; chains from the open-source Anno 1800 calculator community
        data, cross-checked against the Anno&nbsp;1800 Wiki. Late-game / DLC recipes may vary by
        patch — every rate is editable in the model. Not affiliated with Ubisoft.
        <br />
        <span style={{ opacity: 0.55 }}>build 37 · anno light theme</span>
      </div>
    </section>
  );
}

function GroupRows({
  st,
  ids,
  colSpan,
  row,
}: {
  st: CalcState;
  ids: string[];
  colSpan: number;
  row: (id: string) => React.ReactNode;
}) {
  let lastGroup = "";
  const out: React.ReactNode[] = [];
  for (const id of ids) {
    const g = GOODS[id];
    const grp = g.isFinal
      ? `${g.regionName} · ${tierName(dispTier(st, id))}`
      : `${g.regionName} · intermediate / raw`;
    if (grp !== lastGroup) {
      out.push(
        <tr className="grp" key={`grp:${grp}`}>
          <td colSpan={colSpan}>{grp}</td>
        </tr>
      );
      lastGroup = grp;
    }
    out.push(row(id));
  }
  return <>{out}</>;
}

function Bld({ st, id, extra }: { st: CalcState; id: string; extra?: React.ReactNode }) {
  const g = GOODS[id];
  return (
    <div className="bld">
      <span className="dot" style={{ background: regionColor(g.region) }} />
      <div>
        <b>{buildingName(st, id)}</b> <span className="muted">→ {g.name}</span> {extra}
      </div>
    </div>
  );
}

function BuildingsPane({ st, R }: { st: CalcState; R: ReturnType<typeof buildingRows> }) {
  const rows = [...R.rows].sort((a, b) => displaySort(st, a.id, b.id));
  let lastGroup = "";
  const trs: React.ReactNode[] = [];
  for (const r of rows) {
    const g = GOODS[r.id];
    const grp = g.isFinal
      ? `${g.regionName} · ${tierName(dispTier(st, r.id))} need`
      : `${g.regionName} · intermediate / raw`;
    if (grp !== lastGroup) {
      trs.push(
        <tr className="grp" key={`g:${grp}`}>
          <td colSpan={6}>{grp}</td>
        </tr>
      );
      lastGroup = grp;
    }
    const surCls = r.sur < 1e-6 ? "" : r.sur / (r.cap || 1) < 0.001 ? "surplus-ok" : "surplus-warn";
    const sharedBy = Object.keys(R.contrib[r.id] || {}).length;
    trs.push(
      <tr key={r.id}>
        <td>
          <Bld
            st={st}
            id={r.id}
            extra={
              <>
                <FinalPill st={st} id={r.id} isFinal={g.isFinal} />{" "}
                {sharedBy > 1 && <span className="pill">shared ×{sharedBy}</span>}
              </>
            }
          />
        </td>
        <td className="num round big">×{st.round ? r.cnt : fmt(r.exact)}</td>
        <td className="num muted">{fmt(r.er)}</td>
        <td className="num">{fmt(r.dem)}</td>
        <td className="num muted">{fmt(r.exact)}</td>
        <td className={`num ${surCls}`}>{r.sur > 1e-6 ? `+${fmt(r.sur)}` : "—"}</td>
      </tr>
    );
  }
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Building → good</th>
            <th>Build</th>
            <th>Rate/min</th>
            <th>Need t/min</th>
            <th>Exact</th>
            <th>Surplus</th>
          </tr>
        </thead>
        <tbody>{trs}</tbody>
      </table>
      <div className="legend">
        <span>
          <span className="dot" style={{ background: "#e7b96b" }} />
          Old World
        </span>
        <span>
          <span className="dot" style={{ background: "#57c98a" }} />
          New World
        </span>
        <span>
          <span className="dot" style={{ background: "#5fa8ff" }} />
          Arctic
        </span>
        <span>
          <span className="dot" style={{ background: "#c98ad6" }} />
          Enbesa
        </span>
        <span>
          <span className="pill pn">need</span> basic (population)
        </span>{" "}
        <span>
          <span className="pill pw">want</span> happiness
        </span>{" "}
        <span>
          <span className="pill pl">lifestyle</span> optional bonus
        </span>{" "}
        <span>no pill = production good</span>{" "}
        <span className="surplus-warn">Surplus = spare capacity from rounding up</span>
      </div>
    </>
  );
}

function SharedPane({ st, R }: { st: CalcState; R: ReturnType<typeof buildingRows> }) {
  const shared = R.rows
    .map((r) => r.id)
    .filter((id) => Object.keys(R.contrib[id] || {}).length > 1)
    .sort(
      (a, b) =>
        Object.keys(R.contrib[b]).length - Object.keys(R.contrib[a]).length ||
        GOODS[a].region - GOODS[b].region
    );
  if (!shared.length)
    return (
      <div className="empty" style={{ padding: 26 }}>
        No shared resources yet.
        <br />
        <span className="muted">
          Add two lines that use a common input — e.g. Steel Beams + Weapons (both need Steel &amp;
          Iron), or a preset.
        </span>
      </div>
    );
  return (
    <>
      <p className="note">
        These intermediates feed <b>more than one</b> of your production lines. Building them as one
        shared pool is cheaper than a separate line per product, because you round up <b>once</b>{" "}
        instead of once per line.
      </p>
      {shared.map((id) => {
        const g = GOODS[id];
        const o = R.byId[id];
        const consumers = Object.entries(R.contrib[id]).sort((a, b) => b[1] - a[1]);
        const sharedBuild = st.round ? Math.ceil(o.exact - 1e-9) : o.exact;
        let separately = 0;
        for (const [, tpm] of consumers) {
          const c = tpm / o.er;
          separately += st.round ? Math.ceil(c - 1e-9) : c;
        }
        const saves = separately - sharedBuild;
        return (
          <div className="shareCard" key={id}>
            <h3>
              <span
                className="dot"
                style={{ background: regionColor(g.region), display: "inline-block" }}
              />{" "}
              {buildingName(st, id)} → {g.name}{" "}
              <span className="muted">· {fmt(o.er)}/min each</span>
            </h3>
            <div className="flow">
              <span className="tag">
                Total need <b>{fmt(o.dem)}</b> t/min
              </span>
              <span className="tag">
                Shared build <b>{sharedBuild}</b>
              </span>
              <span className="tag">
                If built separately <b>{separately}</b>
              </span>
              {saves > 0 ? (
                <span className="tag save">
                  ↓ saves {fmt(saves)} building{saves > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="tag">no rounding loss</span>
              )}
            </div>
            <div className="flow">
              {consumers.map(([cid, tpm]) => (
                <span className="tag" key={cid}>
                  {GOODS[cid].name}: <b>{fmt(tpm)}</b> t/min
                </span>
              ))}
            </div>
            <SurplusHint st={st} id={id} row={o} />
          </div>
        );
      })}
    </>
  );
}

function SurplusHint({ st, id, row }: { st: CalcState; id: string; row: BuildingRow }) {
  const spare = (st.round ? Math.ceil(row.exact - 1e-9) : row.exact) * row.er - row.dem;
  if (spare <= 1e-6)
    return <div className="note">Perfectly balanced — no spare capacity.</div>;
  const feeds = Object.values(GOODS)
    .filter((g) => g.inputs.some((i) => i.good === id))
    .slice(0, 4)
    .map((g) => `${fmt(spare / effRate(st, g.id))}× ${g.building}`);
  return (
    <div className="note">
      Spare <b className="surplus-warn">+{fmt(spare)}</b> t/min from rounding up — enough to also
      feed about {feeds.join(", ") || "—"} elsewhere.
    </div>
  );
}

function OptimalPane({ st }: { st: CalcState }) {
  const p = optimPlan(st);
  if (!p) return null;
  const ids = Object.keys(p.counts).sort((a, b) => displaySort(st, a, b));
  const adds = Object.entries(p.added)
    .map(([f, c]) => `+${c}× ${GOODS[f].name}`)
    .join(", ");
  const bu = Math.round(100 * p.baseUtil);
  const au = Math.round(100 * p.util);
  return (
    <>
      <p className="note">
        Fewest buildings that cover your targets: <b>{p.baseTotal}</b>. Shared inputs are pooled
        across every chain and rounded up <b>once</b>, so mines &amp; smelters serve all lines at
        once.
        {adds ? (
          <>
            {" "}
            Because you can only build whole buildings, some capacity is left over — enough to also
            run <b className="save">{adds}</b> marked <i>optional</i> below. They need no extra
            input buildings: skip them and you still hit your target (total <b>{p.baseTotal}</b>),
            build them and the leftover capacity becomes product instead of idle time (total{" "}
            <b>{p.total}</b>, utilisation {bu}% → <b>{au}%</b>). Used% assumes you build them.
          </>
        ) : (
          <>
            {" "}
            Overall utilisation <b>{au}%</b> — the chains line up exactly, nothing worth adding.
          </>
        )}
      </p>
      <table>
        <thead>
          <tr>
            <th>Building → good</th>
            <th>Build</th>
            <th>Used</th>
          </tr>
        </thead>
        <tbody>
          <GroupRows
            st={st}
            ids={ids}
            colSpan={3}
            row={(id) => {
              const u = p.dem[id] / (p.cap[id] || 1);
              const uc = u > 0.999 ? "surplus-ok" : u > 0.85 ? "" : "surplus-warn";
              const ad = p.added[id] || 0;
              return (
                <tr key={id}>
                  <td>
                    <Bld st={st} id={id} extra={<CatPill st={st} id={id} />} />
                  </td>
                  <td className="num round big">
                    ×{p.counts[id]}
                    {ad ? <span className="pill save"> {ad} optional</span> : null}
                  </td>
                  <td className={`num ${uc}`}>{Math.round(100 * u)}%</td>
                </tr>
              );
            }}
          />
        </tbody>
      </table>
    </>
  );
}

function RatioPane({ st }: { st: CalcState }) {
  const p = perfectRatio(st);
  if (!p)
    return (
      <div className="empty" style={{ padding: 26 }}>
        No compact zero-waste ratio exists for this selection at these settings.
        <br />
        <span className="muted">
          Chains with awkward rates (silo feed, odd productivity %) may never divide evenly — the
          Optimal build tab still gives the cheapest plan.
        </span>
      </div>
    );
  const rows = [...p.rows].sort((a, b) => displaySort(st, a.id, b.id));
  const T = targets(st);
  let mult = 0;
  p.finals.forEach((f, j) => {
    const cover = T[f] / (p.counts[j] * effRate(st, f));
    if (cover > mult) mult = cover;
  });
  return (
    <>
      <p className="note">
        <b>Perfect ratio</b> — the smallest whole-number blueprint where <b>every</b> building runs
        at exactly <b>100%</b>:{" "}
        {p.finals.map((f, j) => (
          <React.Fragment key={f}>
            {j > 0 && " + "}
            <b>{p.counts[j]}×</b> {GOODS[f].name}
          </React.Fragment>
        ))}
        , <b>{p.total}</b> buildings in all. This is the canonical ratio for these chains — multiply
        the whole set to scale. It ignores the amounts on the left
        {mult > 0 ? (
          <>
            {" "}
            (your current targets ≈ <b>×{fmt(mult, 2)}</b> of this blueprint)
          </>
        ) : null}
        .
      </p>
      <table>
        <thead>
          <tr>
            <th>Building → good</th>
            <th>Ratio</th>
            <th>Makes t/min</th>
          </tr>
        </thead>
        <tbody>
          <GroupRows
            st={st}
            ids={rows.map((r) => r.id)}
            colSpan={3}
            row={(id) => {
              const r = rows.find((x) => x.id === id)!;
              return (
                <tr key={id}>
                  <td>
                    <Bld st={st} id={id} extra={<CatPill st={st} id={id} />} />
                  </td>
                  <td className="num round big">×{r.c}</td>
                  <td className="num muted">{fmt(r.c * effRate(st, id))}</td>
                </tr>
              );
            }}
          />
        </tbody>
      </table>
    </>
  );
}

function TreePane({ st }: { st: CalcState }) {
  const T = targets(st);
  const ids = Object.keys(T);
  if (!ids.length) return null;
  return (
    <div className="tree">
      <ul>
        {ids.map((id) => (
          <TreeNode key={id} st={st} id={id} tpm={T[id]} />
        ))}
      </ul>
    </div>
  );
}

function TreeNode({ st, id, tpm }: { st: CalcState; id: string; tpm: number }) {
  const g = GOODS[id];
  const er = effRate(st, id);
  const exact = tpm / er;
  const cnt = st.round ? Math.ceil(exact - 1e-9) : exact;
  const kids: [string, number][] = g.inputs.map((i) => [i.good, tpm * i.qty]);
  const feedGood = st.silo ? SILO[id] || null : null;
  if (feedGood) kids.push([feedGood, (tpm * SILO_FEED) / er]);
  return (
    <li>
      <span className="row">
        <span className="cnt">{fmt(cnt, st.round ? 0 : 1)}×</span> <b>{buildingName(st, id)}</b>{" "}
        <span className="muted">
          → {g.name} · {fmt(tpm)} t/min
        </span>
      </span>
      {kids.length > 0 && (
        <ul>
          {kids.map(([kid, ktpm], i) => (
            <TreeNode key={`${kid}:${i}`} st={st} id={kid} tpm={ktpm} />
          ))}
        </ul>
      )}
    </li>
  );
}
