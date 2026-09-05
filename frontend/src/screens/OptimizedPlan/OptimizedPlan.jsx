import React, { useMemo, useState } from "react";
import {
  CalendarClock,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Target,
  Award,
  ListChecks,
  Info,
  MapPin,
  Wrench,
  Gauge,
} from "lucide-react";
import { HeroBanner, cn } from "../../components/layout/Layout";

// ============================================================
// BACKEND SHAPE -> UI DERIVATION
//
// Step 4 ("Generate Optimal Plan") calls POST /api/optimize, which wraps
// the existing, already-tested Phase 3 OR-Tools optimizer
// (block_optimizer.optimize_block_plan + explain_entry) -- see
// backend/app/main.py. Unlike Step 3 (/api/analyze, preferred-time-only),
// this runs Phase 1 (every candidate offset) -> Phase 2 (every candidate)
// -> Phase 3 (CP-SAT) for each request and returns the solver's actual
// recommendation, or a documented reason why none exists.
//
// Response shape:
// {
//   solver_status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | ...,
//   objective_value: number | null,
//   scheduled_count: number,
//   unscheduled_count: number,
//   plans: [{
//     request_id, maintenance_type, section_id, station_code,
//     priority, urgency, preferred_start_time, time_flexibility,
//     total_candidates_generated, feasible_candidates, infeasible_candidates,
//     rejected_conflict_breakdown: { TRAIN: n, RESOURCE: n, ... },
//     asset_id,
//     asset_risk: { predicted_risk_score, predicted_priority, borderline, source },
//     scheduled: boolean,
//     // when scheduled === true:
//     selected_window: { start_time, end_time, duration_min, is_preferred_time, offset_from_preferred_min },
//     score: { total_score, components: { asset_risk, priority, urgency, preference_closeness } },
//     next_best_alternatives: [{ start_time, end_time, total_score }, ...],
//     // when scheduled === false:
//     reason: string,
//   }, ...]
// }
//
// Every value shown on this page is read straight from that response --
// nothing here re-runs or re-derives the optimizer's decision.
// ============================================================

const CONFLICT_TYPE_LABEL = {
  TRAIN: "Train",
  EXISTING_BLOCK: "Existing Block",
  RESOURCE: "Resource / Team",
  DURATION: "Duration",
  TIME_WINDOW: "Time Window",
  OPERATIONAL: "Operational Buffer",
};

const PRIORITY_STYLES = {
  Low: "bg-slate-100 text-slate-600",
  Medium: "bg-amber-100 text-amber-700",
  High: "bg-red-100 text-red-600",
  Critical: "bg-red-600 text-white",
};

const SCORE_COMPONENT_META = {
  asset_risk: { label: "Asset Risk", icon: Gauge, bar: "bg-red-500", chip: "text-red-600 bg-red-50" },
  priority: { label: "Priority", icon: Award, bar: "bg-amber-500", chip: "text-amber-600 bg-amber-50" },
  urgency: { label: "Urgency", icon: Clock, bar: "bg-indigo-500", chip: "text-indigo-600 bg-indigo-50" },
  preference_closeness: {
    label: "Preferred-Time Closeness",
    icon: Target,
    bar: "bg-emerald-500",
    chip: "text-emerald-600 bg-emerald-50",
  },
};

function parseHHMM(hhmm) {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function fmtMinutesAsHHMM(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ============================================================
// SOLVER STATUS BADGE
// ============================================================

function SolverStatusBadge({ status }) {
  const isOptimal = status === "OPTIMAL";
  const isFeasible = status === "FEASIBLE";
  const theme = isOptimal
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : isFeasible
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border", theme)}>
      <Sparkles size={12} />
      OR-Tools: {status || "—"}
    </span>
  );
}

// ============================================================
// SUMMARY STRIP (across every request just optimized)
// ============================================================

function SummaryStrip({ solverStatus, objectiveValue, scheduledCount, unscheduledCount }) {
  return (
    <div className="flex flex-wrap items-center gap-3 sm:gap-4 rounded-2xl bg-white border border-slate-200 px-4 sm:px-5 py-4 mb-5">
      <SolverStatusBadge status={solverStatus} />
      <div className="h-4 w-px bg-slate-200 hidden sm:block" />
      <div className="flex items-center gap-1.5 text-sm">
        <CheckCircle2 size={15} className="text-emerald-600" />
        <span className="font-semibold text-slate-700">{scheduledCount}</span>
        <span className="text-slate-400">scheduled</span>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <XCircle size={15} className="text-slate-400" />
        <span className="font-semibold text-slate-700">{unscheduledCount}</span>
        <span className="text-slate-400">not scheduled</span>
      </div>
      {objectiveValue !== null && objectiveValue !== undefined && (
        <>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-400">Total objective score:</span>
            <span className="font-semibold text-slate-700">{objectiveValue}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// INFO TILE (small stat used in the plan header grid)
// ============================================================

function InfoTile({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <div className="text-sm font-semibold text-slate-700 truncate">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 truncate">{sub}</div>}
    </div>
  );
}

// ============================================================
// TIMELINE (visual only — every label comes from the real
// preferred / selected / alternative times returned by the backend)
// ============================================================

function Timeline({ preferredMin, duration, selected, alternatives }) {
  const points = [preferredMin, preferredMin + duration];
  if (selected) {
    let end = selected.endMin;
    if (end < selected.startMin) end += 1440; // crosses midnight, visual only
    points.push(selected.startMin, end);
  }
  alternatives.forEach((a) => {
    let end = a.endMin;
    if (end < a.startMin) end += 1440;
    points.push(a.startMin, end);
  });

  const rawMin = Math.min(...points);
  const rawMax = Math.max(...points);
  const pad = Math.max(20, Math.round((rawMax - rawMin) * 0.15));
  const axisStart = Math.floor((rawMin - pad) / 15) * 15;
  const axisEnd = Math.ceil((rawMax + pad) / 15) * 15;
  const span = Math.max(axisEnd - axisStart, 1);

  const pct = (min) => `${((min - axisStart) / span) * 100}%`;

  const tickStep = span > 240 ? 60 : 30;
  const ticks = [];
  for (let t = Math.ceil(axisStart / tickStep) * tickStep; t <= axisEnd; t += tickStep) {
    ticks.push(t);
  }

  return (
    <div className="pt-2 pb-1">
      {/* axis */}
      <div className="relative h-5 mb-1">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute -translate-x-1/2 text-[10px] text-slate-400"
            style={{ left: pct(t) }}
          >
            {fmtMinutesAsHHMM(t)}
          </div>
        ))}
      </div>
      <div className="relative h-2 bg-slate-100 rounded-full mb-4">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 h-2 w-px bg-slate-200"
            style={{ left: pct(t) }}
          />
        ))}
      </div>

      {/* preferred time (dashed) */}
      <div className="relative h-8 mb-2">
        <div className="absolute -top-1 -translate-x-1/2 text-[10px] font-medium text-slate-400" style={{ left: pct(preferredMin) }}>
          Preferred
        </div>
        <div
          className="absolute top-3 h-3 rounded-full border-2 border-dashed border-slate-300"
          style={{ left: pct(preferredMin), width: `calc(${pct(preferredMin + duration)} - ${pct(preferredMin)})` }}
        />
      </div>

      {/* selected / recommended window */}
      {selected && (
        <div className="relative h-8">
          <div
            className="absolute -top-1 -translate-x-1/2 text-[10px] font-semibold text-emerald-600"
            style={{ left: pct(selected.startMin) }}
          >
            Recommended
          </div>
          <div
            className="absolute top-3 h-3 rounded-full bg-emerald-400"
            style={{
              left: pct(selected.startMin),
              width: `calc(${pct(selected.startMin >= selected.endMin ? selected.endMin + 1440 : selected.endMin)} - ${pct(selected.startMin)})`,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// SCORE BREAKDOWN
// ============================================================

function ScoreBreakdown({ score }) {
  if (!score) return null;
  const componentEntries = Object.entries(score.components || {});
  const maxComponent = Math.max(...componentEntries.map(([, v]) => v), 1);

  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-slate-700">Why AI chose this window</div>
        <div className="text-lg font-bold text-indigo-600">{score.total_score}<span className="text-xs font-medium text-slate-400"> / 100</span></div>
      </div>
      <div className="space-y-2.5">
        {componentEntries.map(([key, value]) => {
          const meta = SCORE_COMPONENT_META[key] || { label: key, icon: Info, bar: "bg-slate-400", chip: "text-slate-600 bg-slate-100" };
          const Icon = meta.icon;
          const widthPct = Math.max(4, (value / maxComponent) * 100);
          return (
            <div key={key} className="flex items-center gap-3">
              <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0", meta.chip)}>
                <Icon size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-600 font-medium">{meta.label}</span>
                  <span className="text-slate-500 font-semibold">{value}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={cn("h-1.5 rounded-full", meta.bar)} style={{ width: `${widthPct}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
        Each component is already weighted by the optimizer (asset risk 35%, priority 30%,
        preferred-time closeness 25%, urgency 10%) — the bars above show each component's
        actual contribution to the total score, not a re-calculation.
      </p>
    </div>
  );
}

// ============================================================
// NEXT-BEST ALTERNATIVES
// ============================================================

function AlternativesList({ alternatives }) {
  if (!alternatives || alternatives.length === 0) {
    return (
      <div className="text-xs text-slate-400 py-4 text-center">
        No other feasible windows were close in score — this was the clear best option.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {alternatives.map((alt, i) => (
        <div
          key={`${alt.start_time}-${alt.end_time}-${i}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <span className="text-sm font-medium text-slate-700">
              {alt.start_time} – {alt.end_time}
            </span>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded-md shrink-0">
            Score {alt.total_score}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// CONFLICT BREAKDOWN (rejected candidates, by type)
// ============================================================

function ConflictBreakdown({ breakdown }) {
  const entries = Object.entries(breakdown || {});
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([type, count]) => (
        <span
          key={type}
          className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md"
        >
          {CONFLICT_TYPE_LABEL[type] || type}: {count}
        </span>
      ))}
    </div>
  );
}

// ============================================================
// SCHEDULED PLAN CARD
// ============================================================

function ScheduledPlanCard({ plan }) {
  const preferredMin = parseHHMM(plan.preferred_start_time);
  const selectedStartMin = parseHHMM(plan.selected_window?.start_time);
  const selectedEndMin = parseHHMM(plan.selected_window?.end_time);
  const duration = plan.selected_window?.duration_min ?? 0;

  const alternatives = (plan.next_best_alternatives || []).map((a) => ({
    ...a,
    startMin: parseHHMM(a.start_time),
    endMin: parseHHMM(a.end_time),
  }));

  const canShowTimeline = preferredMin !== null && selectedStartMin !== null && selectedEndMin !== null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{plan.request_id}</span>
            <span className="text-xs text-slate-400">{plan.maintenance_type}</span>
            {plan.selected_window?.is_preferred_time ? (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Preferred time honored
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                Shifted {Math.abs(plan.selected_window?.offset_from_preferred_min ?? 0)} min from preferred
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <MapPin size={12} />
            {plan.section_id} · {plan.station_code}
          </div>
        </div>
        <span
          className={cn(
            "text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0",
            PRIORITY_STYLES[plan.priority] || "bg-slate-100 text-slate-600"
          )}
        >
          {plan.priority} priority
        </span>
      </div>

      <div className="p-5">
        {/* recommended window hero */}
        <div className="flex items-center gap-2 mb-1">
          <CalendarClock size={15} className="text-indigo-600" />
          <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Recommended Window</span>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            Best Window
          </span>
        </div>
        <div className="text-2xl sm:text-3xl font-bold text-slate-800 mb-4">
          {plan.selected_window?.start_time} – {plan.selected_window?.end_time}
        </div>

        {/* info tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <InfoTile icon={Clock} label="Duration" value={`${duration} min`} />
          <InfoTile icon={Wrench} label="Asset ID" value={plan.asset_id || "—"} />
          <InfoTile
            icon={AlertTriangle}
            label="Asset Risk"
            value={plan.asset_risk ? plan.asset_risk.predicted_risk_score : "—"}
            sub={plan.asset_risk?.predicted_priority}
          />
          <InfoTile
            icon={Sparkles}
            label="Optimization Score"
            value={plan.score ? plan.score.total_score : "—"}
            sub="out of 100"
          />
        </div>

        {/* timeline */}
        {canShowTimeline && (
          <div className="mb-5">
            <Timeline
              preferredMin={preferredMin}
              duration={duration}
              selected={{ startMin: selectedStartMin, endMin: selectedEndMin }}
              alternatives={alternatives.filter((a) => a.startMin !== null && a.endMin !== null)}
            />
          </div>
        )}

        {/* score breakdown + alternatives */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-2">
          <ScoreBreakdown score={plan.score} />
          <div className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ListChecks size={14} className="text-slate-500" />
              <div className="text-sm font-semibold text-slate-700">Next-Best Alternatives</div>
            </div>
            <AlternativesList alternatives={plan.next_best_alternatives} />
          </div>
        </div>

        {/* feasibility footnote */}
        <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px] text-slate-400">
          <span>
            {plan.feasible_candidates} of {plan.total_candidates_generated} candidate windows were feasible
            {plan.infeasible_candidates > 0 ? ` (${plan.infeasible_candidates} rejected)` : ""}.
          </span>
          <ConflictBreakdown breakdown={plan.rejected_conflict_breakdown} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// UNSCHEDULED PLAN CARD (no feasible window found)
// ============================================================

function UnscheduledPlanCard({ plan }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{plan.request_id}</span>
            <span className="text-xs text-slate-400">{plan.maintenance_type}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <MapPin size={12} />
            {plan.section_id} · {plan.station_code}
          </div>
        </div>
        <span
          className={cn(
            "text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0",
            PRIORITY_STYLES[plan.priority] || "bg-slate-100 text-slate-600"
          )}
        >
          {plan.priority} priority
        </span>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-4 mb-5">
          <XCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-red-700 mb-1">No feasible maintenance window found</div>
            <p className="text-xs text-red-600 leading-relaxed">{plan.reason}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <InfoTile icon={Clock} label="Preferred Time" value={plan.preferred_start_time} sub={plan.time_flexibility} />
          <InfoTile icon={Wrench} label="Asset ID" value={plan.asset_id || "—"} />
          <InfoTile
            icon={AlertTriangle}
            label="Asset Risk"
            value={plan.asset_risk ? plan.asset_risk.predicted_risk_score : "—"}
            sub={plan.asset_risk?.predicted_priority}
          />
          <InfoTile icon={ListChecks} label="Candidates Checked" value={plan.total_candidates_generated} sub={`${plan.infeasible_candidates} infeasible`} />
        </div>

        <div className="rounded-xl border border-slate-100 p-4">
          <div className="text-sm font-semibold text-slate-700 mb-2">Why scheduling wasn't possible</div>
          {Object.keys(plan.rejected_conflict_breakdown || {}).length > 0 ? (
            <ConflictBreakdown breakdown={plan.rejected_conflict_breakdown} />
          ) : (
            <div className="text-xs text-slate-400">No conflict breakdown was returned for this request.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan }) {
  return plan.scheduled ? <ScheduledPlanCard plan={plan} /> : <UnscheduledPlanCard plan={plan} />;
}

// ============================================================
// PRE-OPTIMIZE STATE (before "Generate Plan" is clicked)
// ============================================================

function PreOptimizeState({ onRun, isLoading, requestCount }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
        {isLoading ? <Loader2 size={26} className="animate-spin" /> : <Sparkles size={26} />}
      </div>
      <div>
        <div className="text-base font-semibold text-slate-700 mb-1">
          {isLoading ? "Running the OR-Tools optimizer…" : "Ready to generate the optimal plan"}
        </div>
        <div className="text-sm text-slate-400 max-w-sm">
          {isLoading
            ? "Generating every candidate window, checking constraints, and solving for the best schedule."
            : `Run the optimizer on ${requestCount} block request${requestCount === 1 ? "" : "s"} to find the best feasible window for each.`}
        </div>
      </div>
      {!isLoading && (
        <button
          type="button"
          onClick={onRun}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
        >
          <Sparkles size={16} />
          Generate Plan
        </button>
      )}
    </div>
  );
}

// ============================================================
// MAIN SCREEN (Step 4: Generate Optimal Plan)
// ============================================================

/**
 * @param {{
 *   requests: object[],
 *   optimization: object | null,
 *   onOptimize: (requests: object[]) => Promise<object>,
 *   onBack?: () => void,
 *   onContinue?: () => void,
 *   onNavigate?: (stepKey: string) => void,
 *   completedKeys?: string[],
 * }} props
 *
 * `optimization` is the real POST /api/optimize response (see the
 * "BACKEND SHAPE -> UI DERIVATION" block above) -- it is the actual
 * Phase 3 OR-Tools optimizer output for the exact requests created on
 * Page 2, not a sample/demo plan.
 */
export default function OptimizedPlan({
  requests = [],
  optimization,
  onOptimize,
  onBack,
  onContinue,
  onNavigate,
  completedKeys,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [localResult, setLocalResult] = useState(optimization || null);
  const [error, setError] = useState("");

  const handleRun = async () => {
    if (!onOptimize || requests.length === 0) return;
    setError("");
    setIsLoading(true);
    try {
      const result = await onOptimize(requests);
      setLocalResult(result);
    } catch (e) {
      setError(e?.message || "Optimization failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const result = optimization || localResult;
  const plans = useMemo(() => result?.plans || [], [result]);

  return (
    <>
      <HeroBanner
        title="Generate Optimal Plan"
        subtitle="The OR-Tools optimizer picks the single best feasible window for each block request."
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

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isLoading || requests.length === 0}
            onClick={handleRun}
            className={cn(
              "inline-flex items-center gap-2 px-5 sm:px-6 py-2 sm:py-2.5 rounded-lg text-sm sm:text-base font-semibold border transition-all duration-200",
              !isLoading && requests.length > 0
                ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 shadow-sm"
                : "border-slate-200 bg-transparent text-slate-300 cursor-not-allowed"
            )}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {result ? "Re-generate Plan" : "Generate Plan"}
          </button>

          <button
            type="button"
            disabled={!result}
            onClick={onContinue}
            className={cn(
              "px-6 sm:px-7 py-2 sm:py-2.5 rounded-lg text-base sm:text-lg font-semibold border transition-all duration-200",
              result
                ? "border-[#3a83f7] bg-[#3a83f7] text-white hover:bg-[#3275e6] hover:border-[#3275e6] shadow-sm"
                : "border-slate-200 bg-transparent text-slate-300 cursor-not-allowed"
            )}
          >
            Continue →
          </button>
        </div>
      </div>

      {requests.length === 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 mb-4 text-sm text-amber-700">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>No block requests yet. Go back to Page 2 and create at least one block request first.</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 mb-4 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!result && requests.length > 0 ? (
        <PreOptimizeState onRun={handleRun} isLoading={isLoading} requestCount={requests.length} />
      ) : result ? (
        <>
          <SummaryStrip
            solverStatus={result.solver_status}
            objectiveValue={result.objective_value}
            scheduledCount={result.scheduled_count}
            unscheduledCount={result.unscheduled_count}
          />
          <div className="space-y-5">
            {plans.map((plan) => (
              <PlanCard key={plan.request_id} plan={plan} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
