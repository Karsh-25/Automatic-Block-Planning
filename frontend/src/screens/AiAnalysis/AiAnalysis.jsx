import React, { useMemo, useState } from "react";
import {
  Cpu,
  Train,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Info,
  ChevronRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { PageShell, HeroBanner, cn } from "../../components/layout/Layout";

// ============================================================
// BACKEND SHAPE -> UI DERIVATION
//
// Step 3 ("AI Analyses the Network") is a PRE-OPTIMIZATION baseline: for
// every block request, check its *preferred_start_time* window only (no
// candidate search, no optimizer) and report what would happen if every
// request just got its preferred slot. This is what block_optimizer.py's
// before/after comparison later calls the "Before AI (Current Plan)"
// numbers -- Step 4 is where the optimizer actually runs and improves on
// this baseline. Step 3 must NOT show optimized-plan numbers.
//
// This baseline comes from two existing backend functions, called once
// per request:
//
//   1. constraint_engine.evaluate_candidate(preferred_candidate, request, ctx)
//      -> {
//           request_id, start_time, end_time, duration_min,
//           is_preferred: true, feasible: bool,
//           conflicts: [
//             { type: "TRAIN", train_id, train_name, overlap_minutes },
//             { type: "EXISTING_BLOCK", existing_block_id, block_type, overlap_minutes },
//             { type: "RESOURCE", existing_block_id, team, overlap_minutes },
//             ...
//           ]
//         }
//
//   2. ml.inference.predict_risk(asset)
//      -> { predicted_risk_score, predicted_priority: "Low"|"Medium"|"High"|"Critical", borderline, confidence_note }
//
// `analysis.evaluations[i]` below is one request's evaluate_candidate()
// result plus its request/asset context and predict_risk() output
// attached. There is no SimulationReport / optimized-plan data here --
// that belongs to the Step 4 "Generate Optimal Plan" screen, not this one.
//
// analysis shape:
// {
//   evaluations: [{
//     block_request_id, asset_id, section_id, station_code,
//     maintenance_type, required_team, priority, preferred_start_time,
//     feasible, conflicts: [...],            // from evaluate_candidate()
//     asset_risk: { predicted_risk_score, predicted_priority, borderline }, // from predict_risk()
//   }],
// }
// ============================================================

const PRIORITY_RANK = { Low: 0, Medium: 1, High: 2, Critical: 3 };

function flattenConflicts(analysis) {
  const rows = [];
  for (const ev of analysis.evaluations || []) {
    for (const c of ev.conflicts || []) {
      rows.push({ evaluation: ev, conflict: c });
    }
  }
  return rows;
}

function deriveStats(analysis) {
  const allConflicts = flattenConflicts(analysis);
  const trainConflicts = allConflicts.filter((r) => r.conflict.type === "TRAIN");

  const affectedTrainIds = new Set(trainConflicts.map((r) => r.conflict.train_id));
  const predictedDelayMin = trainConflicts.reduce(
    (sum, r) => sum + (r.conflict.overlap_minutes || 0),
    0
  );

  const priorities = (analysis.evaluations || [])
    .map((ev) => ev.asset_risk?.predicted_priority)
    .filter(Boolean);
  const dominantPriority = priorities.length
    ? priorities.reduce((worst, p) =>
        PRIORITY_RANK[p] > PRIORITY_RANK[worst] ? p : worst
      )
    : "—";

  return {
    affectedTrainCount: affectedTrainIds.size,
    conflictsDetected: allConflicts.length,
    dominantPriority,
    predictedDelayMin,
  };
}

/** Top sections by total predicted delay (TRAIN conflicts only). */
function deriveTopSections(analysis, limit = 3) {
  const bySection = new Map();

  for (const ev of analysis.evaluations || []) {
    const trainConflicts = (ev.conflicts || []).filter((c) => c.type === "TRAIN");
    if (trainConflicts.length === 0) continue;
    const delay = trainConflicts.reduce((sum, c) => sum + (c.overlap_minutes || 0), 0);
    const key = `${ev.section_id} (${ev.station_code})`;
    bySection.set(key, (bySection.get(key) || 0) + delay);
  }

  return [...bySection.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, delayMin]) => ({ label, delayMin }));
}

/** Individual TRAIN conflicts, sorted by predicted delay. */
function deriveTopConflicts(analysis, limit = 5) {
  const rows = flattenConflicts(analysis)
    .filter((r) => r.conflict.type === "TRAIN")
    .map(({ evaluation, conflict }) => ({
      id: `${evaluation.block_request_id}-${conflict.train_id}`,
      train: `${conflict.train_id} — ${conflict.train_name}`,
      detail: `vs ${evaluation.maintenance_type} (${evaluation.section_id}/${evaluation.station_code})`,
      delay: `${conflict.overlap_minutes} min`,
      delayMin: conflict.overlap_minutes || 0,
    }));

  return rows.sort((a, b) => b.delayMin - a.delayMin).slice(0, limit);
}

function deriveSummary(analysis) {
  const stats = deriveStats(analysis);
  const total = (analysis.evaluations || []).length;
  const infeasible = (analysis.evaluations || []).filter((ev) => !ev.feasible).length;

  return (
    `Checked ${total} block request${total === 1 ? "" : "s"} at their preferred time, ` +
    `before any optimization. ${stats.conflictsDetected} conflict${stats.conflictsDetected === 1 ? "" : "s"} ` +
    `found across ${infeasible} request${infeasible === 1 ? "" : "s"}, affecting ` +
    `${stats.affectedTrainCount} train${stats.affectedTrainCount === 1 ? "" : "s"} with an estimated ` +
    `${stats.predictedDelayMin} min of delay if scheduled as-is. Highest asset priority involved: ${stats.dominantPriority}.`
  );
}

// ============================================================
// STAT CARD
// ============================================================

const STAT_THEMES = {
  blue: { bg: "bg-blue-50", text: "text-blue-600", ring: "border-blue-100" },
  red: { bg: "bg-red-50", text: "text-red-600", ring: "border-red-100" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "border-amber-100" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "border-emerald-100" },
};

function StatCard({ icon: Icon, theme, label, value, sub, onViewDetails }) {
  const t = STAT_THEMES[theme];
  return (
    <div className={cn("rounded-2xl border bg-white p-4 sm:p-5", t.ring)}>
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", t.bg, t.text)}>
          <Icon size={16} />
        </div>
        <span className="text-sm font-medium text-slate-500">{label}</span>
      </div>
      <div className={cn("text-2xl sm:text-3xl font-bold mb-1", t.text)}>{value}</div>
      <div className="text-xs text-slate-400 mb-3">{sub}</div>
      <button
        type="button"
        onClick={onViewDetails}
        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
      >
        View Details <ChevronRight size={12} />
      </button>
    </div>
  );
}

// ============================================================
// TOP IMPACTED SECTIONS
//
// Ranked by total predicted delay (preferred-time TRAIN conflicts,
// grouped by section_id/station_code) -- real pre-optimization numbers,
// not an invented network topology.
// ============================================================

function TopImpactedSections({ sections }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="text-sm font-semibold text-slate-700 mb-4">Top Impacted Sections</div>

      {sections.length === 0 ? (
        <div className="text-xs text-slate-400 py-6 text-center">
          No delay impact recorded for any section.
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <ShieldAlert size={14} className="text-amber-500 shrink-0" />
              <span className="text-sm text-slate-700 font-medium flex-1 truncate">
                {s.label}
              </span>
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-md shrink-0">
                {s.delayMin} min
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TOP CONFLICTS
// ============================================================

function TopConflicts({ conflicts }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-slate-700">Top Conflicts</div>
        <button type="button" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
          View All
        </button>
      </div>

      <div className="space-y-3">
        {conflicts.length === 0 ? (
          <div className="text-xs text-slate-400 py-6 text-center">
            No train conflicts on the current plan.
          </div>
        ) : (
          conflicts.map((c, i) => (
            <div key={c.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <AlertTriangle size={14} className="text-red-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-slate-700 font-medium truncate">{c.train}</div>
                  <div className="text-xs text-slate-400 truncate">{c.detail}</div>
                </div>
              </div>
              <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-md shrink-0">
                {c.delay}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// ANALYSIS SUMMARY BANNER
// ============================================================

function AnalysisSummary({ text }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 px-4 sm:px-5 py-4">
      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
        <Info size={13} />
      </span>
      <div>
        <div className="text-sm font-semibold text-slate-800 mb-0.5">Analysis Summary</div>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

// ============================================================
// PRE-ANALYSIS STATE (before "Run Analysis" is clicked)
// ============================================================

function PreAnalysisState({ onRun, isLoading }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
        {isLoading ? <Loader2 size={26} className="animate-spin" /> : <Sparkles size={26} />}
      </div>
      <div>
        <div className="text-base font-semibold text-slate-700 mb-1">
          {isLoading ? "Analyzing the network…" : "Ready to analyze"}
        </div>
        <div className="text-sm text-slate-400 max-w-sm">
          {isLoading
            ? "Checking asset risk, train schedules and constraints against your block requests."
            : "Run AI analysis to check your block requests against train schedules, asset risk and operational constraints."}
        </div>
      </div>
      {!isLoading && (
        <button
          type="button"
          onClick={onRun}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
        >
          <Cpu size={16} />
          Run AI Analysis
        </button>
      )}
    </div>
  );
}

// ============================================================
// MAIN SCREEN (Step 3: AI Analyses the Network)
// ============================================================

/**
 * @param {{
 *   requests: object[],
 *   analysis: object | null,
 *   onAnalyze: () => Promise<object> | object,
 *   onContinue: () => void,
 *   onBack?: () => void,
 *   onNavigate?: (stepKey: string) => void,
 *   completedKeys?: string[],
 * }} props
 *
 * `analysis` is the Step 3 pre-optimization baseline (see the
 * "BACKEND SHAPE -> UI DERIVATION" block at the top of this file for the
 * exact fields, sourced from constraint_engine.evaluate_candidate() +
 * ml.inference.predict_risk()). This is NOT the optimized-plan output --
 * that belongs to the Step 4 "Generate Optimal Plan" screen.
 */
export default function AiAnalysis({
  requests = [],
  analysis,
  onAnalyze,
  onContinue,
  onBack,
  onNavigate,
  completedKeys,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [localAnalysis, setLocalAnalysis] = useState(analysis || null);

  const handleRun = async () => {
    if (!onAnalyze) return;
    setIsLoading(true);
    try {
      const result = await onAnalyze(requests);
      setLocalAnalysis(result);
    } finally {
      setIsLoading(false);
    }
  };

  const result = analysis || localAnalysis;
  const canContinue = Boolean(result);

  // Derive all UI values from the raw backend report. Memoized so we're
  // not re-deriving on every render while other state (isLoading) changes.
  const stats = useMemo(() => (result ? deriveStats(result) : null), [result]);
  const topSections = useMemo(() => (result ? deriveTopSections(result) : []), [result]);
  const topConflicts = useMemo(() => (result ? deriveTopConflicts(result) : []), [result]);
  const summary = useMemo(() => (result ? deriveSummary(result) : ""), [result]);

  return (
    <PageShell
      activeKey="analysis"
      onNavigate={onNavigate}
      completedKeys={completedKeys}
      topbarIcon={Cpu}
      topbarLabel="AI Analyses the Network"
    >
      <HeroBanner
        title="AI Analyses the Network"
        subtitle="Analyzing requests, train movements, assets and constraints."
      />

      {/* TOP NAV */}
      <div className="flex items-center justify-between mt-4 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2 rounded-lg text-base font-semibold text-slate-500 hover:text-slate-700 transition"
        >
          ← Back
        </button>

        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className={cn(
            "px-6 sm:px-7 py-2 sm:py-2.5 rounded-lg text-base sm:text-lg font-semibold border transition-all duration-200",
            canContinue
              ? "border-[#3a83f7] bg-[#3a83f7] text-white hover:bg-[#3275e6] hover:border-[#3275e6] shadow-sm"
              : "border-slate-200 bg-transparent text-slate-300 cursor-not-allowed"
          )}
        >
          Continue →
        </button>
      </div>

      {!result ? (
        <PreAnalysisState onRun={handleRun} isLoading={isLoading} />
      ) : (
        <>
          {/* STAT CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard
              icon={Train}
              theme="blue"
              label="Affected Trains"
              value={stats.affectedTrainCount}
              sub="Trains will be impacted"
            />
            <StatCard
              icon={AlertTriangle}
              theme="red"
              label="Conflicts Detected"
              value={stats.conflictsDetected}
              sub="Potential conflicts found"
            />
            <StatCard
              icon={ShieldAlert}
              theme="amber"
              label="Asset Priority"
              value={stats.dominantPriority}
              sub="Highest priority level involved"
            />
            <StatCard
              icon={Clock}
              theme="emerald"
              label="Predicted Delay"
              value={`${stats.predictedDelayMin} min`}
              sub="Estimated delay if scheduled as-is"
            />
          </div>

          {/* SECTIONS + CONFLICTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <TopImpactedSections sections={topSections} />
            <TopConflicts conflicts={topConflicts} />
          </div>

          {/* SUMMARY */}
          <AnalysisSummary text={summary} />
        </>
      )}
    </PageShell>
  );
}