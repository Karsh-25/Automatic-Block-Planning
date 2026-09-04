import React, { useMemo, useState } from "react";
import {
  Activity,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Train,
  ShieldCheck,
  ShieldAlert,
  Info,
  ChevronDown,
  ChevronUp,
  MapPin,
  GitCompare,
} from "lucide-react";
import { PageShell, HeroBanner, cn } from "../../components/layout/Layout";

// ============================================================
// BACKEND SHAPE -> UI DERIVATION
//
// Step 5 ("Simulate & Validate Plan") calls POST /api/simulate, which
// wraps the existing, already-tested Phase 4 simulator
// (simulator.simulate_optimization_result) -- see backend/app/main.py.
// It re-solves the same Phase 3 optimization on the exact same requests
// Page 4 used (CP-SAT is deterministic, so the plan is identical), then
// hands that real result straight to the Phase 4 simulator -- nothing is
// re-implemented or approximated here.
//
// Response shape (simulator.SimulationReport.to_dict(), unchanged):
// {
//   total_block_requests, scheduled_blocks, unscheduled_requests,
//   affected_trains: [train_id, ...],           // unique, across scheduled blocks
//   total_simulated_delay_min, average_simulated_delay_min, maximum_simulated_delay_min,
//   remaining_conflicts_count,
//   affected_assets: [asset_id, ...],
//   block_results: [{
//     block_request_id, asset_id, section_id, station_code,
//     maintenance_type, required_team,
//     scheduled: boolean,
//     status: "SCHEDULED_NO_REMAINING_CONFLICT" | "SCHEDULED_CONFLICT_DETECTED"
//           | "NOT_SCHEDULED_NO_FEASIBLE_WINDOW" | "NOT_SCHEDULED_DISPLACED_BY_PLAN",
//     window: { start_time, end_time, duration_min } | null,
//     affected_trains: [{ train_id, train_name, overlap_minutes }],
//     simulated_delay_min: number | null,   // null when not executed -- never fabricated as 0
//     remaining_conflicts: [...],           // independently re-verified; expected empty when scheduled
//     feasible_candidates_considered, total_candidates_generated,
//     reason: string,
//   }, ...],
//   limitations: [ ...simulator.SIMULATION_LIMITATIONS ],  // shown verbatim, not reworded
// }
//
// "Before Optimization" context for the comparison card comes from the
// Step 3 baseline already computed on Page 3 (POST /api/analyze,
// preferred-time-only feasibility) plus the original request fields
// held in App state since Page 2 -- not re-derived or guessed here.
// ============================================================

const PRIORITY_STYLES = {
  Low: "bg-slate-100 text-slate-600",
  Medium: "bg-amber-100 text-amber-700",
  High: "bg-red-100 text-red-600",
  Critical: "bg-red-600 text-white",
};

const STATUS_META = {
  SCHEDULED_NO_REMAINING_CONFLICT: {
    label: "Validated — no remaining conflicts",
    theme: "bg-emerald-50 border-emerald-100 text-emerald-700",
    icon: ShieldCheck,
  },
  SCHEDULED_CONFLICT_DETECTED: {
    label: "Conflict detected on re-verification",
    theme: "bg-red-50 border-red-100 text-red-700",
    icon: ShieldAlert,
  },
  NOT_SCHEDULED_NO_FEASIBLE_WINDOW: {
    label: "Not executed — no feasible window existed",
    theme: "bg-slate-50 border-slate-200 text-slate-600",
    icon: XCircle,
  },
  NOT_SCHEDULED_DISPLACED_BY_PLAN: {
    label: "Not executed — displaced by the optimal plan",
    theme: "bg-amber-50 border-amber-100 text-amber-700",
    icon: AlertTriangle,
  },
};

function conflictCountLabel(n) {
  return `${n} conflict${n === 1 ? "" : "s"}`;
}

function addMinutesToHHMM(hhmm, minutes) {
  if (!hhmm || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

// ============================================================
// SUMMARY STRIP
// ============================================================

function SummaryStrip({ report }) {
  return (
    <div className="flex flex-wrap items-center gap-3 sm:gap-4 rounded-2xl bg-white border border-slate-200 px-4 sm:px-5 py-4 mb-5">
      <div className="flex items-center gap-1.5 text-sm">
        <CheckCircle2 size={15} className="text-emerald-600" />
        <span className="font-semibold text-slate-700">{report.scheduled_blocks}</span>
        <span className="text-slate-400">executed</span>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <XCircle size={15} className="text-slate-400" />
        <span className="font-semibold text-slate-700">{report.unscheduled_requests}</span>
        <span className="text-slate-400">not executed</span>
      </div>
      <div className="h-4 w-px bg-slate-200 hidden sm:block" />
      <div className="flex items-center gap-1.5 text-sm">
        <Clock size={15} className="text-indigo-600" />
        <span className="text-slate-400">Total simulated delay:</span>
        <span className="font-semibold text-slate-700">{report.total_simulated_delay_min} min</span>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <Train size={15} className="text-indigo-600" />
        <span className="text-slate-400">Affected trains:</span>
        <span className="font-semibold text-slate-700">{report.affected_trains.length}</span>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <ShieldAlert size={15} className="text-slate-400" />
        <span className="text-slate-400">Remaining conflicts:</span>
        <span className="font-semibold text-slate-700">{report.remaining_conflicts_count}</span>
      </div>
    </div>
  );
}

// ============================================================
// INFO TILE
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
// BEFORE / AFTER COMPARISON
//
// Before = Step 3's preferred-time-only baseline (POST /api/analyze,
// already computed on Page 3) plus the original request's own duration
// (held in App state since Page 2). After = this request's real Phase 4
// simulation result. Nothing here is re-derived beyond simple lookups.
// ============================================================

function BeforeAfterCard({ beforeEval, originalRequest, afterResult }) {
  if (!beforeEval && !afterResult) return null;

  const beforeStart = beforeEval?.preferred_start_time;
  const beforeDuration = originalRequest ? Number(originalRequest.duration) : null;
  const beforeEnd = beforeStart && beforeDuration ? addMinutesToHHMM(beforeStart, beforeDuration) : null;
  const beforeConflicts = beforeEval?.conflicts?.length ?? null;
  const beforeFeasible = beforeEval?.feasible;

  const afterScheduled = afterResult?.scheduled;
  const afterWindow = afterResult?.window;
  const afterConflicts = afterResult?.remaining_conflicts?.length ?? null;
  const afterDelay = afterResult?.simulated_delay_min;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* BEFORE */}
      <div className="rounded-xl border border-red-100 bg-red-50/40 p-4">
        <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
          Before Optimization (preferred time, as requested)
        </div>
        {beforeEval ? (
          <>
            <div className="text-lg font-bold text-slate-800 mb-1">
              {beforeStart}{beforeEnd ? ` – ${beforeEnd}` : ""}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {beforeFeasible ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                  <CheckCircle2 size={11} /> Feasible as requested
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-medium">
                  <AlertTriangle size={11} /> {conflictCountLabel(beforeConflicts || 0)} at preferred time
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-400">
            Preferred-time baseline not available (Step 3 analysis wasn't run for this request).
          </div>
        )}
      </div>

      {/* AFTER */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
        <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
          After Optimization + Simulation
        </div>
        {afterScheduled && afterWindow ? (
          <>
            <div className="text-lg font-bold text-slate-800 mb-1">
              {afterWindow.start_time} – {afterWindow.end_time}
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle2 size={11} /> {conflictCountLabel(afterConflicts || 0)} remaining
              </span>
              {afterDelay !== null && afterDelay !== undefined && (
                <span className="inline-flex items-center gap-1 text-slate-600 bg-white px-2 py-0.5 rounded-full font-medium border border-slate-200">
                  <Clock size={11} /> {afterDelay} min simulated delay
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-500">Not executed — no optimized window was scheduled for this request.</div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// AFFECTED TRAINS LIST
// ============================================================

function AffectedTrainsList({ trains }) {
  if (!trains || trains.length === 0) {
    return (
      <div className="text-xs text-slate-400 py-2">
        No train-schedule overlaps detected on the executed window.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {trains.map((t, i) => (
        <div key={`${t.train_id}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Train size={13} className="text-red-500 shrink-0" />
            <span className="text-sm text-slate-700 truncate">
              {t.train_id} — {t.train_name}
            </span>
          </div>
          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-md shrink-0">
            {t.overlap_minutes} min
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// PER-REQUEST SIMULATION CARD
// ============================================================

function SimulationCard({ blockResult, plan, beforeEval, originalRequest }) {
  const meta = STATUS_META[blockResult.status] || {
    label: blockResult.status,
    theme: "bg-slate-50 border-slate-200 text-slate-600",
    icon: Info,
  };
  const StatusIcon = meta.icon;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{blockResult.block_request_id}</span>
            <span className="text-xs text-slate-400">{blockResult.maintenance_type}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <MapPin size={12} />
            {blockResult.section_id} · {blockResult.station_code}
          </div>
        </div>
        {plan?.priority && (
          <span
            className={cn(
              "text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0",
              PRIORITY_STYLES[plan.priority] || "bg-slate-100 text-slate-600"
            )}
          >
            {plan.priority} priority
          </span>
        )}
      </div>

      <div className="p-5">
        {/* status banner */}
        <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 mb-5", meta.theme)}>
          <StatusIcon size={18} className="shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold mb-0.5">{meta.label}</div>
            <p className="text-xs leading-relaxed opacity-90">{blockResult.reason}</p>
          </div>
        </div>

        {/* info tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <InfoTile icon={Clock} label="Simulated Delay" value={blockResult.simulated_delay_min !== null ? `${blockResult.simulated_delay_min} min` : "N/A"} sub={blockResult.simulated_delay_min === null ? "not executed" : "train-conflict overlap only"} />
          <InfoTile icon={Train} label="Affected Trains" value={blockResult.affected_trains.length} />
          <InfoTile icon={ShieldAlert} label="Remaining Conflicts" value={blockResult.remaining_conflicts.length} />
          <InfoTile icon={Activity} label="Candidates Considered" value={`${blockResult.feasible_candidates_considered}/${blockResult.total_candidates_generated}`} sub="feasible / generated" />
        </div>

        {/* before / after */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <GitCompare size={14} className="text-slate-500" />
            <div className="text-sm font-semibold text-slate-700">Before vs After</div>
          </div>
          <BeforeAfterCard beforeEval={beforeEval} originalRequest={originalRequest} afterResult={blockResult} />
        </div>

        {/* affected trains detail */}
        {blockResult.affected_trains.length > 0 && (
          <div className="rounded-xl border border-slate-100 p-4 mb-2">
            <div className="text-sm font-semibold text-slate-700 mb-2">Affected Train Movements</div>
            <AffectedTrainsList trains={blockResult.affected_trains} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// LIMITATIONS PANEL — shown verbatim from the backend, not reworded
// ============================================================

function LimitationsPanel({ limitations }) {
  const [open, setOpen] = useState(false);
  if (!limitations || limitations.length === 0) return null;
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 sm:px-5 py-4 mt-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2">
          <Info size={14} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">About this simulation — documented limitations</span>
        </div>
        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>
      {open && (
        <ul className="mt-3 space-y-1.5 list-disc list-inside">
          {limitations.map((l, i) => (
            <li key={i} className="text-xs text-slate-500 leading-relaxed">{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// PRE-SIMULATE STATE
// ============================================================

function PreSimulateState({ onRun, isLoading, requestCount }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
        {isLoading ? <Loader2 size={26} className="animate-spin" /> : <Activity size={26} />}
      </div>
      <div>
        <div className="text-base font-semibold text-slate-700 mb-1">
          {isLoading ? "Simulating the optimized plan…" : "Ready to simulate & validate the plan"}
        </div>
        <div className="text-sm text-slate-400 max-w-sm">
          {isLoading
            ? "Independently re-checking the optimized window against train, existing-block and resource conflicts."
            : `Run the Phase 4 simulator on the optimized plan for ${requestCount} block request${requestCount === 1 ? "" : "s"}.`}
        </div>
      </div>
      {!isLoading && (
        <button
          type="button"
          onClick={onRun}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
        >
          <Activity size={16} />
          Run Simulation
        </button>
      )}
    </div>
  );
}

// ============================================================
// MAIN SCREEN (Step 5: Simulate & Validate Plan)
// ============================================================

/**
 * @param {{
 *   requests: object[],
 *   analysis: object | null,
 *   optimization: object | null,
 *   simulation: object | null,
 *   onSimulate: (requests: object[]) => Promise<object>,
 *   onBack?: () => void,
 *   onNavigate?: (stepKey: string) => void,
 *   completedKeys?: string[],
 * }} props
 *
 * `simulation` is the real POST /api/simulate response (see the
 * "BACKEND SHAPE -> UI DERIVATION" block above) -- the actual Phase 4
 * simulator output for the same optimized plan shown on Page 4, not a
 * sample/demo result. `analysis` (Page 3's /api/analyze result) and
 * `requests` (the original Page 2 entries) are used only to build the
 * "Before Optimization" side of the comparison card -- both already
 * real data held in App state.
 */
export default function SimulationPlan({
  requests = [],
  analysis,
  optimization,
  simulation,
  onSimulate,
  onBack,
  onNavigate,
  completedKeys,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [localResult, setLocalResult] = useState(simulation || null);
  const [error, setError] = useState("");

  const handleRun = async () => {
    if (!onSimulate || requests.length === 0) return;
    setError("");
    setIsLoading(true);
    try {
      const result = await onSimulate(requests);
      setLocalResult(result);
    } catch (e) {
      setError(e?.message || "Simulation failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const report = simulation || localResult;

  const planById = useMemo(() => {
    const map = new Map();
    for (const p of optimization?.plans || []) map.set(p.request_id, p);
    return map;
  }, [optimization]);

  const evalById = useMemo(() => {
    const map = new Map();
    for (const e of analysis?.evaluations || []) map.set(e.block_request_id, e);
    return map;
  }, [analysis]);

  const requestById = useMemo(() => {
    const map = new Map();
    for (const r of requests) map.set(r.id, r);
    return map;
  }, [requests]);

  return (
    <PageShell
      activeKey="recommendation"
      onNavigate={onNavigate}
      completedKeys={completedKeys}
      topbarIcon={Activity}
      topbarLabel="Simulate & Validate Plan"
    >
      <HeroBanner
        title="Simulate & Validate Plan"
        subtitle="Independently re-checks the optimized plan and reports its real operational impact."
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
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {report ? "Re-run Simulation" : "Run Simulation"}
          </button>

          {report && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate("final")}
              className={cn(
                "px-6 sm:px-7 py-2 sm:py-2.5 rounded-lg text-base sm:text-lg font-semibold border transition-all duration-200",
                report
                  ? "border-[#3a83f7] bg-[#3a83f7] text-white hover:bg-[#3275e6] hover:border-[#3275e6] shadow-sm"
                  : "border-slate-200 bg-transparent text-slate-300 cursor-not-allowed"
              )}
            >
              Continue to Final Plan →
            </button>
          )}
        </div>
      </div>

      {requests.length === 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 mb-4 text-sm text-amber-700">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>No block requests yet. Go back and create a request, then generate a plan on Page 4 first.</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 mb-4 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!report && requests.length > 0 ? (
        <PreSimulateState onRun={handleRun} isLoading={isLoading} requestCount={requests.length} />
      ) : report ? (
        <>
          <SummaryStrip report={report} />
          <div className="space-y-5">
            {(report.block_results || []).map((blockResult) => (
              <SimulationCard
                key={blockResult.block_request_id}
                blockResult={blockResult}
                plan={planById.get(blockResult.block_request_id)}
                beforeEval={evalById.get(blockResult.block_request_id)}
                originalRequest={requestById.get(blockResult.block_request_id)}
              />
            ))}
          </div>
          <LimitationsPanel limitations={report.limitations} />
        </>
      ) : null}
    </PageShell>
  );
}
