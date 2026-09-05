import React, { useState, useRef } from "react";
import Upload from "./screens/Upload/Upload.jsx";
import BlockRequest from "./screens/BlockRequest/BlockRequest.jsx";
import AiAnalysis from "./screens/AiAnalysis/AiAnalysis.jsx";
import OptimizedPlan from "./screens/OptimizedPlan/OptimizedPlan.jsx";
import SimulationPlan from "./screens/Simulation/SimulationPlan.jsx";
import FinalPlan from "./screens/FinalPlan/FinalPlan.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import { PageShell } from "./components/layout/Layout";
import { UploadCloud, ClipboardList, Cpu, CalendarClock, Activity, CheckCircle2 } from "lucide-react";

// Canonical left-to-right order of the workflow. Used only to figure out
// whether a step change is "forward" or "backward" so the slide direction
// matches — e.g. jumping straight to "optimize" from the sidebar still
// slides in from the right, and going Back always slides in from the left.
const STEP_ORDER = ["upload", "request", "analysis", "optimize", "recommendation", "final"];

export default function App() {
  const { authFetch } = useAuth();

  const [step, setStep] = useState("upload");
  // +1 = moving forward through STEP_ORDER, -1 = moving backward.
  // Ref (not state) because we only need it read at the moment of the
  // transition, not to trigger a render.
  const directionRef = useRef(1);

  const goToStep = (nextStep) => {
    const currentIndex = STEP_ORDER.indexOf(step);
    const nextIndex = STEP_ORDER.indexOf(nextStep);
    directionRef.current = nextIndex >= currentIndex ? 1 : -1;
    setStep(nextStep);
  };

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
  // Uses authFetch (from AuthContext) so the request carries the logged-in
  // person's token — the backend can now scope/attribute requests per user.
  const runAnalysis = async (blockRequests) => {
    const response = await authFetch("/api/analyze", {
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
    const response = await authFetch("/api/optimize", {
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
    const response = await authFetch("/api/simulate", {
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

  // Same six branches as before, just reading from `step` — the actual
  // rendering/wrapping in AnimatePresence happens once, below, so none of
  // this needs to change when screens are added or reordered.
  const renderScreen = () => {
    if (step === "upload") {
      return (
        <Upload
          files={files}
          setFiles={setFiles}
          completedKeys={completedSteps}
          onContinue={() => {
            markCompleted("upload");
            goToStep("request");
          }}
          onNavigate={(key) => goToStep(key)}
        />
      );
    }

    if (step === "request") {
      return (
        <BlockRequest
          requests={requests}
          setRequests={setRequests}
          completedKeys={completedSteps}
          onBack={() => goToStep("upload")}
          onContinue={() => {
            markCompleted("request");
            goToStep("analysis");
          }}
          onNavigate={(key) => goToStep(key)}
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
          onBack={() => goToStep("request")}
          onContinue={() => {
            markCompleted("analysis");
            goToStep("optimize");
          }}
          onNavigate={(key) => goToStep(key)}
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
          onBack={() => goToStep("analysis")}
          onContinue={() => {
            markCompleted("optimize");
            goToStep("recommendation");
          }}
          onNavigate={(key) => goToStep(key)}
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
          onBack={() => goToStep("optimize")}
          onContinue={() => {
            markCompleted("recommendation");
            goToStep("final");
          }}
          onNavigate={(key) => goToStep(key)}
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
          onBack={() => goToStep("recommendation")}
          onNavigate={(key) => goToStep(key)}
        />
      );
    }

    return null;
  };

  const SCREEN_META = {
    upload: { icon: UploadCloud, label: "Upload / Select Railway Data" },
    request: { icon: ClipboardList, label: "Create Block Request" },
    analysis: { icon: Cpu, label: "AI Analyses the Network" },
    optimize: { icon: CalendarClock, label: "Generate Optimal Plan" },
    recommendation: { icon: Activity, label: "Simulate & Validate Plan" },
    final: { icon: CheckCircle2, label: "Final Plan" },
  };

  const screenMeta = SCREEN_META[step];

  return (
    <PageShell
      activeKey={step}
      onNavigate={goToStep}
      completedKeys={completedSteps}
      topbarIcon={screenMeta.icon}
      topbarLabel={screenMeta.label}
      transitionKey={step}
      direction={directionRef.current}
    >
      {renderScreen()}
    </PageShell>
  );
}
