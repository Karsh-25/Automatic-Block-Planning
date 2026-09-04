import React, { useState } from "react";
import Upload from "./screens/Upload/Upload.jsx";
import BlockRequest from "./screens/BlockRequest/BlockRequest.jsx";
import AiAnalysis from "./screens/AiAnalysis/AiAnalysis.jsx";
import OptimizedPlan from "./screens/OptimizedPlan/OptimizedPlan.jsx";
import SimulationPlan from "./screens/Simulation/SimulationPlan.jsx";
import FinalPlan from "./screens/FinalPlan/FinalPlan.jsx";

export default function App() {
  const [step, setStep] = useState("upload");

  const [files, setFiles] = useState({});
  const [requests, setRequestsRaw] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [optimization, setOptimization] = useState(null);
  const [simulation, setSimulation] = useState(null);

  // Any change to requests (add / edit / delete) invalidates a
  // previously-run analysis, optimization AND simulation, since all
  // three were computed against the old request list. Wrapping the
  // setter here means every caller (BlockRequest's add/edit/delete
  // handlers) automatically clears all three stale results, regardless
  // of which navigation path is later used to reach AiAnalysis/
  // OptimizedPlan/SimulationPlan (Continue button, sidebar nav, etc).
  const setRequests = (updater) => {
    setRequestsRaw(updater);
    setAnalysis(null);
    setOptimization(null);
    setSimulation(null);
  };

  const [completedSteps, setCompletedSteps] = useState([]);
  const markCompleted = (key) => {
    setCompletedSteps((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  // Step 3 ("AI Analyses the Network") — calls the real FastAPI backend.
  // POST /api/analyze expects { requests: BlockRequestIn[] } (see
  // backend/app/main.py) and returns { evaluations: [...] } in exactly the
  // shape AiAnalysis.jsx's deriveStats/deriveTopSections/deriveTopConflicts/
  // deriveSummary expect (see the "BACKEND SHAPE -> UI DERIVATION" block at
  // the top of AiAnalysis.jsx). No client-side aggregation needed here —
  // the backend already returns the final per-request evaluations.
  const runAnalysis = async (blockRequests) => {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: blockRequests }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(
        `Analysis request failed (${response.status}): ${
          errorBody ? JSON.stringify(errorBody.detail ?? errorBody) : response.statusText
        }`
      );
    }

    return response.json();
  };

  // Step 4 ("Generate Optimal Plan") — calls the real FastAPI backend.
  // POST /api/optimize expects the exact same { requests: BlockRequestIn[] }
  // shape as /api/analyze (see backend/app/main.py), but runs the full
  // Phase 1 (all candidate offsets) -> Phase 2 -> Phase 3 OR-Tools pipeline
  // instead of only checking the preferred time. It returns:
  //   { solver_status, objective_value, scheduled_count, unscheduled_count,
  //     plans: [ block_optimizer.explain_entry() output, ... ] }
  // one entry of "plans" per request that was sent, in the same order.
  // No optimization logic runs in the browser — this only calls the
  // backend and returns exactly what it responds with.
  const runOptimize = async (blockRequests) => {
    const response = await fetch("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: blockRequests }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(
        `Optimization request failed (${response.status}): ${
          errorBody ? JSON.stringify(errorBody.detail ?? errorBody) : response.statusText
        }`
      );
    }

    return response.json();
  };

  // Step 5 ("Simulate & Validate Plan") — calls the real FastAPI backend.
  // POST /api/simulate expects the exact same { requests: BlockRequestIn[] }
  // shape as /api/analyze and /api/optimize (see backend/app/main.py).
  // It re-solves the same Phase 3 optimization (CP-SAT is deterministic,
  // so it reproduces the identical plan Page 4 showed for these same
  // requests) and feeds that real result straight into the existing
  // Phase 4 simulator. It returns simulator.SimulationReport.to_dict()
  // unchanged:
  //   { total_block_requests, scheduled_blocks, unscheduled_requests,
  //     affected_trains, total_simulated_delay_min, average_simulated_delay_min,
  //     maximum_simulated_delay_min, remaining_conflicts_count, affected_assets,
  //     block_results: [ simulator.BlockSimulationResult.to_dict(), ... ],
  //     limitations: [ ...simulator.SIMULATION_LIMITATIONS ] }
  // No simulation logic runs in the browser.
  const runSimulate = async (blockRequests) => {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: blockRequests }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(
        `Simulation request failed (${response.status}): ${
          errorBody ? JSON.stringify(errorBody.detail ?? errorBody) : response.statusText
        }`
      );
    }

    return response.json();
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
          setStep("optimize");
        }}
        onNavigate={(key) => setStep(key)}
      />
    );
  }

  if (step === "optimize") {
    return (
      <OptimizedPlan
        requests={requests}
        optimization={optimization}
        onOptimize={async (blockRequests) => {
          const result = await runOptimize(blockRequests);
          setOptimization(result);
          return result;
        }}
        completedKeys={completedSteps}
        onBack={() => setStep("analysis")}
        onContinue={() => {
          markCompleted("optimize");
          setStep("recommendation");
        }}
        onNavigate={(key) => setStep(key)}
      />
    );
  }

  if (step === "recommendation") {
    return (
      <SimulationPlan
        requests={requests}
        analysis={analysis}
        optimization={optimization}
        simulation={simulation}
        onSimulate={async (blockRequests) => {
          const result = await runSimulate(blockRequests);
          setSimulation(result);
          return result;
        }}
        completedKeys={completedSteps}
        onBack={() => setStep("optimize")}
        onContinue={() => {
          markCompleted("recommendation");
          setStep("final");
        }}
        onNavigate={(key) => setStep(key)}
      />
    );
  }

  if (step === "final") {
    return (
      <FinalPlan
        requests={requests}
        optimization={optimization}
        simulation={simulation}
        completedKeys={completedSteps}
        onBack={() => setStep("recommendation")}
        onNavigate={(key) => setStep(key)}
      />
    );
  }

  return null;
}