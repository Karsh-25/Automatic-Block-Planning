import React, { useMemo } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock3,
  ShieldCheck,
  Gauge,
  Wrench,
  ListChecks,
  Download,
  TrainFront,
  Sparkles,
  ArrowDown,
  ArrowUp,
  Info,
  MapPin,
} from "lucide-react";
import { PageShell, cn } from "../../components/layout/Layout";

// Step 6 intentionally does not invent a separate "final-plan" API.
// It renders the real POST /api/optimize and POST /api/simulate responses
// already held in App state from Steps 4 and 5. The supplied mockup contains
// KPIs such as "Asset Availability", "Maintenance Efficiency" and "Overall
// Efficiency" that this project's backend does not define. Those labels are
// therefore replaced with metrics the existing backend genuinely exposes.

function metricTone(direction) {
  return direction === "up"
    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
    : direction === "down"
    ? "bg-red-50 text-red-600 border-red-100"
    : "bg-slate-50 text-slate-700 border-slate-100";
}

function Metric({ icon: Icon, label, value, direction, detail }) {
  const Arrow = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : null;
  return (
    <div className="flex items-center gap-4 min-h-[94px]">
      <div className={cn("w-14 h-14 rounded-full border flex items-center justify-center shrink-0", metricTone(direction))}>
        <Icon size={25} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-600">{label}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <div className={cn("text-2xl font-bold", direction === "up" ? "text-emerald-600" : direction === "down" ? "text-red-600" : "text-slate-800")}>
            {value}
          </div>
          {Arrow && <Arrow size={22} className={direction === "up" ? "text-emerald-600" : "text-red-500"} />}
        </div>
        {detail && <div className="text-[11px] text-slate-400 mt-0.5">{detail}</div>}
      </div>
    </div>
  );
}

function StatusChip({ scheduled }) {
  return scheduled ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
      <CheckCircle2 size={12} /> Scheduled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-full px-2.5 py-1">
      <XCircle size={12} /> Not Scheduled
    </span>
  );
}

function RequestResult({ plan, simulationResult }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-800">{plan.request_id}</span>
            <span className="text-xs text-slate-500">{plan.maintenance_type}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <MapPin size={11} /> {plan.section_id} · {plan.station_code}
          </div>
        </div>
        <StatusChip scheduled={plan.scheduled} />
      </div>

      {plan.scheduled ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
          <div><span className="text-slate-400">Window</span><div className="font-semibold text-slate-700">{plan.selected_window?.start_time}–{plan.selected_window?.end_time}</div></div>
          <div><span className="text-slate-400">Asset risk</span><div className="font-semibold text-slate-700">{plan.asset_risk?.predicted_risk_score ?? "—"}</div></div>
          <div><span className="text-slate-400">Optimization score</span><div className="font-semibold text-slate-700">{plan.score?.total_score ?? "—"}</div></div>
          <div><span className="text-slate-400">Simulation status</span><div className="font-semibold text-slate-700">{simulationResult?.remaining_conflicts?.length ?? 0} remaining conflict(s)</div></div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
          <div className="text-xs font-semibold text-red-700">No feasible maintenance window found</div>
          <div className="text-xs text-red-600 mt-1 leading-relaxed">{plan.reason}</div>
          {Object.keys(plan.rejected_conflict_breakdown || {}).length > 0 && (
            <div className="text-[11px] text-red-500 mt-1.5">
              {Object.entries(plan.rejected_conflict_breakdown).map(([type, count]) => `${type}: ${count}`).join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FinalPlan({
  requests = [],
  optimization,
  simulation,
  onBack,
  onNavigate,
  completedKeys,
}) {
  const simById = useMemo(() => {
    const m = new Map();
    for (const row of simulation?.block_results || []) m.set(row.block_request_id, row);
    return m;
  }, [simulation]);

  const requestById = useMemo(() => {
    const m = new Map();
    for (const request of requests || []) m.set(request.request_id, request);
    return m;
  }, [requests]);

  const total = simulation?.total_block_requests ?? requests.length;
  const scheduled = simulation?.scheduled_blocks ?? optimization?.scheduled_count ?? 0;
  const unscheduled = simulation?.unscheduled_requests ?? optimization?.unscheduled_count ?? 0;
  const coverage = total > 0 ? ((scheduled / total) * 100).toFixed(total > 10 ? 0 : 1) : "0";
  const affectedAssets = simulation?.affected_assets?.length ?? 0;

  const getPlanRows = () => (optimization?.plans || []).map((plan) => {
    const request = requestById.get(plan.request_id) || {};
    return {
      requestId: plan.request_id ?? request.request_id ?? "",
      activity: plan.maintenance_type ?? request.maintenance_type ?? "",
      asset: plan.asset_id ?? request.asset_id ?? "",
      section: plan.section_id ?? request.section_id ?? "",
      station: plan.station_code ?? request.station_code ?? "",
      window: plan.scheduled
        ? `${plan.selected_window?.start_time ?? ""} - ${plan.selected_window?.end_time ?? ""}`
        : "No feasible window",
      duration: plan.scheduled
        ? (plan.duration_minutes ?? plan.selected_window?.duration_minutes ?? request.duration_minutes ?? "")
        : "",
      team: plan.required_team ?? request.required_team ?? "",
      priority: plan.priority ?? request.priority ?? "",
      status: plan.scheduled ? "Scheduled" : "Not Scheduled",
      reason: plan.scheduled
        ? "Recommended by the optimized plan"
        : (plan.reason || "No feasible maintenance window found"),
    };
  });

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    if (!optimization || !simulation) return;

    const rows = getPlanRows();
    const headers = [
      "Request ID", "Activity", "Asset ID", "Section", "Station",
      "Recommended Block", "Duration (min)", "Required Team", "Priority", "Status", "Reason",
    ];
    const esc = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    // SpreadsheetML is a real Excel-readable workbook format.
    // It keeps this project dependency-free while avoiding a fake JSON export.
    const cells = (values) => values.map((value) => `<Cell><Data ss:Type="String">${esc(value)}</Data></Cell>`).join("");
    const headerXml = cells(headers);
    const rowXml = rows.map((r) => cells([
      r.requestId, r.activity, r.asset, r.section, r.station, r.window,
      r.duration, r.team, r.priority, r.status, r.reason,
    ])).map((row) => `<Row>${row}</Row>`).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Block Plan">
    <Table>
      <Row>${headerXml}</Row>
      ${rowXml}
    </Table>
  </Worksheet>
</Workbook>`;

    downloadBlob(
      new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" }),
      "AI-Optimized-Block-Plan.xls"
    );
  };

  const downloadPdf = () => {
    if (!optimization || !simulation) return;

    const rows = getPlanRows();
    const lines = [
      "AI-OPTIMIZED BLOCK PLAN",
      "",
      `PLAN SUMMARY`,
      `Total Requests: ${total}`,
      `Scheduled: ${scheduled}`,
      `Not Scheduled: ${unscheduled}`,
      `Simulated Delay: ${simulation.total_simulated_delay_min ?? 0} min`,
      `Remaining Conflicts: ${simulation.remaining_conflicts_count ?? 0}`,
      `Plan Coverage: ${coverage}%`,
      `Affected Assets: ${affectedAssets}`,
      "",
      "RECOMMENDED BLOCK SCHEDULE",
      "",
    ];

    rows.forEach((r) => {
      lines.push(`${r.requestId} - ${r.status}`);
      lines.push(`Activity: ${r.activity || "—"}`);
      lines.push(`Asset: ${r.asset || "—"}`);
      lines.push(`Section / Station: ${r.section || "—"} / ${r.station || "—"}`);
      lines.push(`Block: ${r.window}${r.duration ? ` | Duration: ${r.duration} min` : ""}`);
      lines.push(`Team: ${r.team || "—"} | Priority: ${r.priority || "—"}`);
      if (r.status !== "Scheduled") lines.push(`Reason: ${r.reason}`);
      lines.push("");
    });

    lines.push("Generated from the real optimizer and simulation responses.");
    lines.push("This is a decision-support plan for railway planners.");

    const escapePdf = (text) => String(text)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/[^\x20-\x7E]/g, " ");

    const wrap = (text, max = 88) => {
      const words = String(text).split(/\s+/);
      const out = [];
      let current = "";
      for (const word of words) {
        if (!current) current = word;
        else if ((current + " " + word).length <= max) current += " " + word;
        else { out.push(current); current = word; }
      }
      if (current) out.push(current);
      return out.length ? out : [""];
    };

    const logicalLines = lines.flatMap((line) => wrap(line));
    const linesPerPage = 46;
    const pages = [];
    for (let i = 0; i < logicalLines.length; i += linesPerPage) pages.push(logicalLines.slice(i, i + linesPerPage));

    const objects = [];
    const addObject = (body) => { objects.push(body); return objects.length; };
    const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const pageIds = [];
    const contentIds = [];

    pages.forEach((pageLines, pageIndex) => {
      const commands = ["BT", "/F1 10 Tf", "50 760 Td", "14 TL"];
      pageLines.forEach((line, index) => {
        if (index === 0 && pageIndex === 0) commands.push("/F1 16 Tf");
        else if (index === 1 && pageIndex === 0) commands.push("/F1 10 Tf");
        commands.push(`(${escapePdf(line)}) Tj`, "0 -14 Td");
      });
      commands.push("ET");
      const stream = commands.join("\n");
      contentIds.push(addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
      pageIds.push(addObject(""));
    });

    const pagesId = addObject("");
    const catalogId = addObject("");
    pages.forEach((_, i) => {
      objects[pageIds[i] - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;
    });
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((obj, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;

    downloadBlob(new Blob([pdf], { type: "application/pdf" }), "AI-Optimized-Block-Plan.pdf");
  };

  const ready = Boolean(optimization && simulation);

  return (
    <PageShell
      activeKey="final"
      onNavigate={onNavigate}
      completedKeys={completedKeys}
      topbarIcon={CheckCircle2}
      topbarLabel="Final Plan"
    >
      <div className="flex items-center justify-between mt-3 mb-4">
        <div className="inline-flex items-center gap-2">
          <span className="text-lg font-semibold text-slate-800">Final Plan</span>
        </div>
        {ready && (
          <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm">
            <CheckCircle2 size={15} className="fill-emerald-600 text-white" /> Plan Generated Successfully
          </span>
        )}
      </div>

      {!ready ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 px-5 text-center">
          <AlertTriangle size={30} className="mx-auto text-amber-500 mb-3" />
          <div className="text-base font-semibold text-slate-700">Final plan data is not available yet</div>
          <div className="text-sm text-slate-400 mt-1 max-w-lg mx-auto">
            Complete optimization and simulation first. This page only displays real backend results and does not fabricate missing values.
          </div>
          <button type="button" onClick={onBack} className="mt-5 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">← Back to Simulation</button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-center gap-3 py-6 border-b border-slate-100">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><TrainFront size={30} /></div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">AI-OPTIMIZED BLOCK PLAN</h1>
              <Sparkles size={20} className="text-indigo-500" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 px-6 sm:px-8 py-4">
              <div className="md:pr-8">
                <Metric icon={Clock3} label="Simulated Delay" value={`${simulation.total_simulated_delay_min} min`} direction="down" detail="backend overlap-minutes proxy; not real-world delay propagation" />
                <Metric icon={AlertTriangle} label="Remaining Conflicts" value={simulation.remaining_conflicts_count} direction="down" detail="independent simulation re-verification" />
                <Metric icon={XCircle} label="Unscheduled Requests" value={unscheduled} direction="down" detail={`${total} total block request(s)`} />
              </div>
              <div className="md:pl-8">
                <Metric icon={ShieldCheck} label="Scheduled Blocks" value={scheduled} direction="up" detail="executed by the simulated optimized plan" />
                <Metric icon={Gauge} label="Plan Coverage" value={`${coverage}%`} direction="up" detail={`${scheduled} scheduled ÷ ${total} total`} />
                <Metric icon={Wrench} label="Affected Assets" value={affectedAssets} direction="up" detail="unique scheduled asset IDs from simulation" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-blue-50 px-5 sm:px-7 py-5 mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3 max-w-2xl">
              <div className="text-indigo-500 text-4xl leading-none">“</div>
              <div className="text-sm sm:text-base text-slate-700 leading-relaxed">
                We don't replace the railway planner. We provide a decision-support recommendation backed by the project's real constraint engine, ML asset-risk inference, OR-Tools optimization, and simulation validation.
              </div>
            </div>
            <div className="hidden md:flex w-24 h-16 rounded-xl bg-white/70 border border-indigo-100 items-center justify-center">
              <TrainFront size={48} className="text-indigo-600" />
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
              <ListChecks size={16} className="text-slate-500" />
              <h2 className="text-sm font-bold text-slate-800">Request Outcomes</h2>
              <span className="text-xs text-slate-400">({optimization.plans?.length || 0})</span>
            </div>
            <div className="space-y-3">
              {(optimization.plans || []).map((plan) => (
                <RequestResult key={plan.request_id} plan={plan} simulationResult={simById.get(plan.request_id)} />
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 pb-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={onBack} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700">← Back</button>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={!ready} onClick={downloadPdf} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-slate-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  <Download size={15} /> Download PDF
                </button>
                <button type="button" disabled={!ready} onClick={downloadExcel} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-slate-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  <Download size={15} /> Download Excel
                </button>
              </div>
            </div>
            <div className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold shadow-sm">
              <CheckCircle2 size={16} /> Plan Ready for Planner Review
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 mb-4 text-xs text-slate-500">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>The screenshot's Asset Availability, Asset Downtime, Maintenance Efficiency and Overall Efficiency KPIs are not defined by the current backend, so this implementation does not invent them. It uses only metrics returned by the real optimizer/simulator, plus the explicitly shown Plan Coverage ratio.</span>
          </div>
        </>
      )}
    </PageShell>
  );
}
