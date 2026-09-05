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
import { HeroBanner, cn } from "../../components/layout/Layout";

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

// ============================================================
// CONFLICT TYPE HELPERS
//
// evaluate_candidate() can return six conflict types: TRAIN,
// EXISTING_BLOCK, RESOURCE, DURATION, TIME_WINDOW, OPERATIONAL (see
// constraint_engine.py's check_* functions for the exact dict shape of
// each). Only TRAIN conflicts carry a real train-schedule delay; the
// others are feasibility problems with their own fields. These helpers
// turn any conflict type into a human-readable label/description so
// non-train conflicts aren't silently invisible in the UI.
// ============================================================

const CONFLICT_TYPE_META = {
  TRAIN: { label: "Train", theme: "text-red-600 bg-red-50" },
  EXISTING_BLOCK: { label: "Existing Block", theme: "text-amber-600 bg-amber-50" },
  RESOURCE: { label: "Resource", theme: "text-indigo-600 bg-indigo-50" },
  DURATION: { label: "Duration", theme: "text-slate-600 bg-slate-100" },
  TIME_WINDOW: { label: "Time Window", theme: "text-slate-600 bg-slate-100" },
  OPERATIONAL: { label: "Operational", theme: "text-amber-600 bg-amber-50" },
};

function conflictTypeMeta(type) {
  return CONFLICT_TYPE_META[type] || { label: type, theme: "text-slate-600 bg-slate-100" };
}

/** One-line human description of any conflict dict, regardless of type. */
function describeConflict(conflict) {
  switch (conflict.type) {
    case "TRAIN":
      return `${conflict.train_id} — ${conflict.train_name}`;
    case "EXISTING_BLOCK":
      return `Overlaps existing block ${conflict.existing_block_id} (${conflict.block_type})`;
    case "RESOURCE":
      return `${conflict.team} already committed on block ${conflict.existing_block_id}`;
    case "DURATION":
      return `Duration ${conflict.duration_min} min is outside the allowed ${conflict.allowed_min}\u2013${conflict.allowed_max} min range`;
    case "TIME_WINDOW":
      return conflict.reason
        ? conflict.reason.replace(/_/g, " ")
        : "Candidate window is not well-formed";
    case "OPERATIONAL":
      return `Within the ${conflict.buffer_min} min safety buffer of block ${conflict.existing_block_id}`;
    default:
      return conflict.type;
  }
}

/** Short right-aligned value shown next to a conflict row. */
function conflictMetric(conflict) {
  if (conflict.type === "TRAIN" || conflict.type === "EXISTING_BLOCK" || conflict.type === "RESOURCE") {
    return `${conflict.overlap_minutes} min`;
  }
  return "Not feasible";
}

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

/**
 * Every conflict across every request/type, sorted with the most
 * "serious" first (real time overlap first, then feasibility-only
 * conflicts like DURATION/TIME_WINDOW which have no overlap_minutes).
 * TRAIN conflicts are NOT the only thing shown here — a plan can be
 * fully infeasible (e.g. RESOURCE/DURATION conflicts) with zero train
 * impact, and that should still be visible somewhere in the UI.
 */
function deriveTopConflicts(analysis, limit = 5) {
  const rows = flattenConflicts(analysis).map(({ evaluation, conflict }, i) => {
    const meta = conflictTypeMeta(conflict.type);
    return {
      id: `${evaluation.block_request_id}-${conflict.type}-${i}`,
      type: conflict.type,
      typeLabel: meta.label,
      typeTheme: meta.theme,
      train: describeConflict(conflict),
      detail: `vs ${evaluation.maintenance_type} (${evaluation.section_id}/${evaluation.station_code}) \u2014 ${evaluation.block_request_id}`,
      delay: conflictMetric(conflict),
      delayMin: conflict.overlap_minutes || 0,
    };
  });

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
// DETAILS MODAL
//
// Backing content for every "View Details" / "View All" button. Each
// stat card opens the same modal shell with different rows, built
// straight from analysis.evaluations -- no separate backend call needed,
// this is just surfacing data the API already returned.
// ============================================================

function buildAffectedTrainsDetail(analysis) {
  const byTrain = new Map();
  for (const { evaluation, conflict } of flattenConflicts(analysis)) {
    if (conflict.type !== "TRAIN") continue;
    const key = conflict.train_id;
    const existing = byTrain.get(key) || {
      trainId: conflict.train_id,
      trainName: conflict.train_name,
      totalDelay: 0,
      hits: [],
    };
    existing.totalDelay += conflict.overlap_minutes || 0;
    existing.hits.push(
      `${evaluation.block_request_id} (${evaluation.maintenance_type}) \u2014 ${conflict.overlap_minutes} min overlap`
    );
    byTrain.set(key, existing);
  }
  return [...byTrain.values()].sort((a, b) => b.totalDelay - a.totalDelay);
}

function buildConflictsDetail(analysis) {
  return (analysis.evaluations || []).map((ev) => ({
    requestId: ev.block_request_id,
    maintenanceType: ev.maintenance_type,
    location: `${ev.section_id} / ${ev.station_code}`,
    feasible: ev.feasible,
    conflicts: (ev.conflicts || []).map((c) => ({
      typeLabel: conflictTypeMeta(c.type).label,
      typeTheme: conflictTypeMeta(c.type).theme,
      description: describeConflict(c),
      metric: conflictMetric(c),
    })),
  }));
}

function buildAssetPriorityDetail(analysis) {
  return [...(analysis.evaluations || [])]
    .filter((ev) => ev.asset_risk)
    .sort(
      (a, b) =>
        (PRIORITY_RANK[b.asset_risk.predicted_priority] ?? -1) -
        (PRIORITY_RANK[a.asset_risk.predicted_priority] ?? -1)
    )
    .map((ev) => ({
      requestId: ev.block_request_id,
      assetId: ev.asset_id,
      priority: ev.asset_risk.predicted_priority,
      score: ev.asset_risk.predicted_risk_score,
      borderline: ev.asset_risk.borderline,
    }));
}

function buildPredictedDelayDetail(analysis) {
  return flattenConflicts(analysis)
    .filter((r) => r.conflict.type === "TRAIN")
    .map(({ evaluation, conflict }) => ({
      requestId: evaluation.block_request_id,
      trainLabel: `${conflict.train_id} \u2014 ${conflict.train_name}`,
      location: `${evaluation.section_id} / ${evaluation.station_code}`,
      delayMin: conflict.overlap_minutes || 0,
    }))
    .sort((a, b) => b.delayMin - a.delayMin);
}

const DETAIL_CONFIG = {
  trains: { title: "Affected Trains" },
  conflicts: { title: "All Conflicts" },
  priority: { title: "Asset Priority Breakdown" },
  delay: { title: "Predicted Delay Breakdown" },
};

function DetailsModal({ view, analysis, onClose }) {
  if (!view) return null;
  const { title } = DETAIL_CONFIG[view];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {view === "trains" && <AffectedTrainsDetail analysis={analysis} />}
          {view === "conflicts" && <ConflictsDetail analysis={analysis} />}
          {view === "priority" && <PriorityDetail analysis={analysis} />}
          {view === "delay" && <DelayDetail analysis={analysis} />}
        </div>
      </div>
    </div>
  );
}

function EmptyDetail({ text }) {
  return <div className="text-xs text-slate-400 py-6 text-center">{text}</div>;
}

function AffectedTrainsDetail({ analysis }) {
  const rows = useMemo(() => buildAffectedTrainsDetail(analysis), [analysis]);
  if (rows.length === 0) {
    return <EmptyDetail text="No train conflicts \u2014 every request's preferred window is clear of train movements at its station." />;
  }
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.trainId} className="border border-slate-100 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-sm font-semibold text-slate-700">
              {r.trainId} — {r.trainName}
            </div>
            <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">
              {r.totalDelay} min total
            </span>
          </div>
          <ul className="text-xs text-slate-500 space-y-0.5 list-disc list-inside">
            {r.hits.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ConflictsDetail({ analysis }) {
  const rows = useMemo(() => buildConflictsDetail(analysis), [analysis]);
  const withConflicts = rows.filter((r) => r.conflicts.length > 0);
  if (withConflicts.length === 0) {
    return <EmptyDetail text="No conflicts of any type were found across these requests." />;
  }
  return (
    <div className="space-y-4">
      {withConflicts.map((r) => (
        <div key={r.requestId} className="border border-slate-100 rounded-xl p-3">
          <div className="text-sm font-semibold text-slate-700 mb-2">
            {r.requestId} — {r.maintenanceType}{" "}
            <span className="text-xs font-normal text-slate-400">({r.location})</span>
          </div>
          <div className="space-y-2">
            {r.conflicts.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0", c.typeTheme)}>
                    {c.typeLabel}
                  </span>
                  <span className="text-xs text-slate-600 truncate">{c.description}</span>
                </div>
                <span className="text-xs font-medium text-slate-500 shrink-0">{c.metric}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PriorityDetail({ analysis }) {
  const rows = useMemo(() => buildAssetPriorityDetail(analysis), [analysis]);
  if (rows.length === 0) {
    return <EmptyDetail text="No asset risk data available." />;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.requestId} className="flex items-center justify-between gap-3 border border-slate-100 rounded-xl p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-700 truncate">
              {r.requestId} — {r.assetId}
            </div>
            {r.borderline && (
              <div className="text-[10px] text-amber-600 mt-0.5">
                Borderline score — close to the next priority cutoff
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-semibold text-slate-700">{r.priority}</div>
            <div className="text-[10px] text-slate-400">score {r.score}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DelayDetail({ analysis }) {
  const rows = useMemo(() => buildPredictedDelayDetail(analysis), [analysis]);
  if (rows.length === 0) {
    return <EmptyDetail text="No train-schedule overlaps \u2014 nothing is predicted to be delayed if every request runs at its preferred time." />;
  }
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-3 border border-slate-100 rounded-xl p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-700 truncate">{r.trainLabel}</div>
            <div className="text-xs text-slate-400 truncate">
              {r.requestId} · {r.location}
            </div>
          </div>
          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-md shrink-0">
            {r.delayMin} min
          </span>
        </div>
      ))}
    </div>
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

function TopConflicts({ conflicts, onViewAll }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-slate-700">Top Conflicts</div>
        <button
          type="button"
          onClick={onViewAll}
          disabled={conflicts.length === 0}
          className={cn(
            "text-xs font-medium",
            conflicts.length === 0
              ? "text-slate-300 cursor-not-allowed"
              : "text-indigo-600 hover:text-indigo-700"
          )}
        >
          View All
        </button>
      </div>

      <div className="space-y-3">
        {conflicts.length === 0 ? (
          <div className="text-xs text-slate-400 py-6 text-center">
            No conflicts on the current plan.
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
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", c.typeTheme)}>
                      {c.typeLabel}
                    </span>
                  </div>
                  <div className="text-sm text-slate-700 font-medium truncate mt-0.5">{c.train}</div>
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
  const [activeDetail, setActiveDetail] = useState(null); // 'trains' | 'conflicts' | 'priority' | 'delay' | null

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
    <>
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
              onViewDetails={() => setActiveDetail("trains")}
            />
            <StatCard
              icon={AlertTriangle}
              theme="red"
              label="Conflicts Detected"
              value={stats.conflictsDetected}
              sub="Potential conflicts found"
              onViewDetails={() => setActiveDetail("conflicts")}
            />
            <StatCard
              icon={ShieldAlert}
              theme="amber"
              label="Asset Priority"
              value={stats.dominantPriority}
              sub="Highest priority level involved"
              onViewDetails={() => setActiveDetail("priority")}
            />
            <StatCard
              icon={Clock}
              theme="emerald"
              label="Predicted Delay"
              value={`${stats.predictedDelayMin} min`}
              sub="Estimated delay if scheduled as-is"
              onViewDetails={() => setActiveDetail("delay")}
            />
          </div>

          {/* SECTIONS + CONFLICTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <TopImpactedSections sections={topSections} />
            <TopConflicts conflicts={topConflicts} onViewAll={() => setActiveDetail("conflicts")} />
          </div>

          {/* SUMMARY */}
          <AnalysisSummary text={summary} />

          {/* DETAILS MODAL */}
          <DetailsModal
            view={activeDetail}
            analysis={result}
            onClose={() => setActiveDetail(null)}
          />
        </>
      )}
    </>
  );
}