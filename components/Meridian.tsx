"use client";

import type { AuditResult } from "@/lib/audit";

const TOTAL = 180;
const TERM = 15; // one term's normal load, and the tick interval

/**
 * The credit meridian: one ruled scale across the whole 180-credit degree,
 * divided into the three pillars and ticked every 15 credits — a term's load —
 * so the distance left to run reads directly as terms of work.
 *
 * Built from laid-out elements rather than a scaled drawing, so every label
 * stays at a real reading size on a phone.
 */
export function Meridian({ audit, termsRemaining }: { audit: AuditResult; termsRemaining: number }) {
  const { totals, pillars } = audit;

  const zones = pillars.map((p) => {
    const earned = Math.min(p.creditsEarned, p.creditsRequired);
    const pending = Math.min(p.creditsInProgress, p.creditsRequired - earned);
    return { ...p, earned, pending };
  });

  const ticks = Array.from({ length: TOTAL / TERM + 1 }, (_, i) => i * TERM);
  const left = Math.max(0, totals.required - totals.earned - totals.inProgress);
  const termsToGo = Math.ceil(left / TERM);
  const perTerm = termsRemaining > 0 ? left / termsRemaining : 0;

  return (
    <section className="meridian" aria-label="Degree progress">
      <div className="meridian-head">
        <div>
          <p className="eyebrow">Credits earned toward 180</p>
          <p className="meridian-figure">
            {fmt(totals.earned)}
            <span>
              {" "}/ 180
              {totals.inProgress > 0 ? ` · ${fmt(totals.inProgress)} in progress` : ""}
            </span>
          </p>
        </div>
        <p className="meridian-note">
          {totals.earned === 0
            ? "Each tick below is one 15-credit term. Add your courses to see how far along the scale you are."
            : `${fmt(totals.remaining)} credits to go — about ${termsToGo} more ${
                termsToGo === 1 ? "term" : "terms"
              } at a normal 15-credit load. Spread over ${termsRemaining} ${
                termsRemaining === 1 ? "term" : "terms"
              }, that is ${fmt(perTerm)} credits a term.`}
        </p>
      </div>

      <div className="zones">
        {zones.map((z) => (
          <div className="zone" key={z.id} style={{ flexGrow: z.creditsRequired }}>
            <span className="zone-name">{z.name}</span>
            <span className="mono zone-value">
              {fmt(z.earned)}/{z.creditsRequired}
            </span>
          </div>
        ))}
      </div>

      <div
        className="rule"
        role="img"
        aria-label={`${fmt(totals.earned)} of 180 credits earned. ${zones
          .map((z) => `${z.name} ${fmt(z.earned)} of ${z.creditsRequired}`)
          .join(". ")}.`}
      >
        {zones.map((z) => (
          <div className="rule-zone" key={z.id} style={{ flexGrow: z.creditsRequired }}>
            <i className="fill-earned" style={{ flexGrow: z.earned }} />
            <i className="fill-progress" style={{ flexGrow: z.pending }} />
            <i style={{ flexGrow: Math.max(0, z.creditsRequired - z.earned - z.pending) }} />
          </div>
        ))}
      </div>

      <div className="ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t}
            className={`tick-mark${t % 45 === 0 ? " is-major" : ""}`}
            style={{ left: `${(t / TOTAL) * 100}%` }}
          >
            {t % 45 === 0 && <em>{t}</em>}
          </span>
        ))}
      </div>

      <div className="legend">
        <span className="legend-item">
          <span className="swatch" style={{ background: "var(--brass)" }} /> Earned
        </span>
        <span className="legend-item">
          <span className="swatch swatch-hatch" /> In progress
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: "var(--rest)" }} /> Still to take
        </span>
        <span className="legend-item">Each tick is one 15-credit term</span>
      </div>
    </section>
  );
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
