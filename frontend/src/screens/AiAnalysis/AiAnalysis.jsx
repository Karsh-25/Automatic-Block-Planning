import React, { useState } from "react";
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
// NETWORK IMPACT DIAGRAM
// ============================================================

function NetworkImpactOverview({ sections }) {
  // sections: { a: "Section A", b: "Section B", c: "Section C" }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="text-sm font-semibold text-slate-700 mb-4">Network Impact Overview</div>

      <div className="relative flex flex-col items-center gap-6 py-4">
        {/* A --- conflict --- C */}
        <div className="flex items-center w-full justify-between">
          <SectionNode label={sections.a} />
          <div className="flex-1 flex items-center justify-center relative">
            <div className="h-px w-full bg-red-300" />
            <div className="absolute w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center border-2 border-white shadow-sm">
              <AlertTriangle size={12} />
            </div>
          </div>
          <SectionNode label={sections.c} />
        </div>

        {/* connecting line down to B */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-px h-6 bg-amber-300" />
        </div>

        <div className="flex items-center justify-center relative w-full">
          <div className="h-px w-1/3 bg-amber-300" />
          <div className="absolute w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center border-2 border-white shadow-sm">
            <ShieldAlert size={12} />
          </div>
          <SectionNode label={sections.b} small />
          <div className="h-px w-1/3 bg-slate-200 border-dashed" style={{ borderTop: "1px dashed #cbd5e1", background: "none" }} />
        </div>
      </div>

      {/* LEGEND */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
        <LegendItem color="bg-red-400" label="Maintenance Request" />
        <LegendItem color="bg-amber-400" label="Signal Maintenance" />
        <LegendItem color="bg-slate-300" label="Other Sections" dashed />
        <LegendItem color="bg-blue-300" label="Train Route" dashed />
      </div>
    </div>
  );
}

function SectionNode({ label, small }) {
  return (
    <div
      className={cn(
        "shrink-0 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-medium text-center z-10",
        small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
      )}
    >
      {label}
    </div>
  );
}

function LegendItem({ color, label, dashed }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("inline-block w-3 h-0.5", dashed ? "border-t border-dashed border-current opacity-60" : color)} />
      <span>{label}</span>
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
        {conflicts.map((c, i) => (
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
        ))}
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
 * `analysis` shape expected once available (from the backend / ML + constraint
 * engine, per Developer 1 & 2's pipeline):
 * {
 *   affectedTrains: number,
 *   conflictsDetected: number,
 *   assetPriority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
 *   predictedDelayMin: number,
 *   sections: { a: string, b: string, c: string },
 *   topConflicts: [{ id, train, detail, delay }],
 *   summary: string,
 * }
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
              value={result.affectedTrains}
              sub="Trains will be impacted"
            />
            <StatCard
              icon={AlertTriangle}
              theme="red"
              label="Conflicts Detected"
              value={result.conflictsDetected}
              sub="Potential conflicts found"
            />
            <StatCard
              icon={ShieldAlert}
              theme="amber"
              label="Asset Priority"
              value={result.assetPriority}
              sub="Priority level involved"
            />
            <StatCard
              icon={Clock}
              theme="emerald"
              label="Predicted Delay"
              value={`${result.predictedDelayMin} min`}
              sub="Total predicted delay across network"
            />
          </div>

          {/* DIAGRAM + CONFLICTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <NetworkImpactOverview sections={result.sections} />
            <TopConflicts conflicts={result.topConflicts} />
          </div>

          {/* SUMMARY */}
          <AnalysisSummary text={result.summary} />
        </>
      )}
    </PageShell>
  );
}