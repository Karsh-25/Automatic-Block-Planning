import React, { useState } from "react";
import Upload from "./screens/Upload/Upload.jsx";
import BlockRequest from "./screens/BlockRequest/BlockRequest.jsx";
import AiAnalysis from "./screens/AiAnalysis/AiAnalysis.jsx";

export default function App() {
  const [step, setStep] = useState("upload");

  const [files, setFiles] = useState({});
  const [requests, setRequests] = useState([]);
  const [analysis, setAnalysis] = useState(null);

  const [completedSteps, setCompletedSteps] = useState([]);
  const markCompleted = (key) => {
    setCompletedSteps((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  // Placeholder aggregation until Phase 5 (the FastAPI layer) exists.
  // Once it's up, replace this with a real call — e.g.
  //   const raw = await fetch("/api/analyze", { method: "POST", body: JSON.stringify(requests) }).then(r => r.json())
  // where `raw` is a { [request_id]: candidateEval[] } map, i.e. exactly
  // what evaluate_candidates_for_request() returns per request, and then
  // run the SAME aggregation below over the real data instead of this
  // fabricated sample. The shape below matches evaluate_candidate()'s
  // real fields exactly (see constraint_engine.py / test_constraint_engine.py) —
  // only the numbers are placeholders.
  const runAnalysis = async (blockRequests) => {
    await new Promise((r) => setTimeout(r, 900));

    // Fabricated per-candidate results, same shape evaluate_candidate() returns.
    const sampleRaw = {
      "BR-001": [
        {
          request_id: "BR-001", start_time: "02:10", end_time: "02:55",
          duration_min: 45, is_preferred: true, feasible: false,
          conflicts: [
            { type: "TRAIN", train_id: "12951", train_name: "Mumbai Rajdhani", overlap_minutes: 22 },
          ],
        },
        {
          request_id: "BR-001", start_time: "03:20", end_time: "04:05",
          duration_min: 45, is_preferred: false, feasible: true,
          conflicts: [],
        },
      ],
      "BR-002": [
        {
          request_id: "BR-002", start_time: "01:00", end_time: "01:30",
          duration_min: 30, is_preferred: true, feasible: false,
          conflicts: [
            { type: "EXISTING_BLOCK", existing_block_id: "EB-014", block_type: "Signal Check", overlap_minutes: 12 },
            { type: "RESOURCE", team: "Signal Team", existing_block_id: "EB-014", overlap_minutes: 12 },
          ],
        },
      ],
      "BR-003": [
        {
          request_id: "BR-003", start_time: "23:50", end_time: "00:15",
          duration_min: 25, is_preferred: true, feasible: false,
          conflicts: [
            { type: "TRAIN", train_id: "22119", train_name: "Tejas Express", overlap_minutes: 8 },
          ],
        },
      ],
    };

    // --- Aggregation: this part is real logic, safe to keep once
    // sampleRaw is replaced by the actual API response. ---
    const allCandidates = Object.values(sampleRaw).flat();
    const allConflicts = allCandidates.flatMap((c) =>
      c.conflicts.map((conf) => ({ ...conf, requestId: c.request_id }))
    );

    const breakdownMap = {};
    for (const c of allConflicts) {
      breakdownMap[c.type] = (breakdownMap[c.type] || 0) + 1;
    }

    const topConflicts = [...allConflicts]
      .sort((a, b) => (b.overlap_minutes || 0) - (a.overlap_minutes || 0))
      .slice(0, 5);

    return {
      requestsAnalyzed: Object.keys(sampleRaw).length,
      candidatesEvaluated: allCandidates.length,
      feasibleCount: allCandidates.filter((c) => c.feasible).length,
      conflictsDetected: allConflicts.length,
      conflictBreakdown: Object.entries(breakdownMap).map(([type, count]) => ({ type, count })),
      topConflicts,
      summary:
        `Checked ${allCandidates.length} candidate window(s) across ${Object.keys(sampleRaw).length} request(s) ` +
        `against trains, existing blocks and resource availability. ` +
        `${allCandidates.filter((c) => c.feasible).length} feasible window(s) found, ` +
        `${allConflicts.length} conflict(s) detected.`,
    };
  };

  if (step === "upload") {
    return (
      <Upload
        files={files}
        setFiles={setFiles}
        completedKeys={completedSteps}
        onContinue={() => {
          markCompleted("upload");
          setStep("request");
        }}
        onNavigate={(key) => setStep(key)}
      />
    );
  }

  if (step === "request") {
    return (
      <BlockRequest
        requests={requests}
        setRequests={setRequests}
        completedKeys={completedSteps}
        onBack={() => setStep("upload")}
        onContinue={() => {
          markCompleted("request");
          setStep("analysis");
        }}
        onNavigate={(key) => setStep(key)}
      />
    );
  }

  if (step === "analysis") {
    return (
      <AiAnalysis
        requests={requests}
        analysis={analysis}
        onAnalyze={async (blockRequests) => {
          const result = await runAnalysis(blockRequests);
          setAnalysis(result);
          return result;
        }}
        completedKeys={completedSteps}
        onBack={() => setStep("request")}
        onContinue={() => {
          markCompleted("analysis");
          alert("Continue → Step 4 (Generate Optimal Plan, not built yet)");
        }}
        onNavigate={(key) => setStep(key)}
      />
    );
  }

  return null;
}