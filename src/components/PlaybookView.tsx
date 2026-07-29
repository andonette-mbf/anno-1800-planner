"use client";
import React, { useEffect, useRef } from "react";
import { PLAYBOOK_CARDS_POST, PLAYBOOK_CARDS_PRE, PLAYBOOK_LEAD } from "@/content/companion";
import { OQ_KEYS, useCompanion } from "@/lib/store";

const OQ_LABELS: Record<string, string> = {
  furcoat: "Fur-coat need trigger population (residence panel)",
  steelworks_tier: "Which workforce tier staffs the Steelworks",
  cf_fertilities: "Crown Falls fertilities",
  cf_minerals: "Crown Falls mineral nodes",
  cf_size: "Crown Falls island size",
  mail_income: "Mail income per residence once a route runs",
  tourism_income: "Tourism income (attractiveness × 3.6)",
};

/** Prose block with live `.oqm[data-oq]` mirrors of the saved Open-Questions values. */
function Prose({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useCompanion();
  useEffect(() => {
    if (!ref.current) return;
    ref.current.querySelectorAll<HTMLElement>(".oqm[data-oq]").forEach((m) => {
      const k = m.dataset.oq!;
      m.textContent = data.openq[k] || "____";
    });
  }, [data.openq, html]);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function PlaybookView() {
  const { data, setOpenq, sync } = useCompanion();
  return (
    <div className="docwrap">
      <Prose html={PLAYBOOK_LEAD} />
      {PLAYBOOK_CARDS_PRE.map((c, i) => (
        <Prose key={i} html={c} />
      ))}
      <div className="card">
        <div className="hd">
          <h2>❓ Open Questions</h2>
          <span className="muted">
            fill from the panel, don&apos;t guess —{" "}
            {sync === "synced" ? "synced" : sync === "syncing" ? "syncing…" : "saved in this browser"}
          </span>
        </div>
        <div className="bd doc">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {OQ_KEYS.map((k) => (
                  <tr key={k}>
                    <td>{OQ_LABELS[k]}</td>
                    <td>
                      <input
                        className="oq-input"
                        placeholder="____"
                        value={data.openq[k] || ""}
                        onChange={(e) => setOpenq(k, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            These values also fill the matching gold blanks throughout the playbook. Saved
            automatically{sync === "synced" ? " and synced to your other devices" : " in this browser"}.
          </p>
        </div>
      </div>
      {PLAYBOOK_CARDS_POST.map((c, i) => (
        <Prose key={i} html={c} />
      ))}
    </div>
  );
}
