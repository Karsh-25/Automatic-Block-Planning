import React, { useState } from "react";
import Upload from "./screens/Upload/Upload.jsx";
import BlockRequest from "./screens/BlockRequest/BlockRequest.jsx";
import AiAnalysis from "./screens/AiAnalysis/AiAnalysis.jsx";

export default function App() {
  const [step, setStep] = useState("upload");

  const [files, setFiles] = useState({});
  const [requests, setRequestsRaw] = useState([]);
  const [analysis, setAnalysis] = useState(null);

  // Any change to requests (add / edit / delete) invalidates a
  // previously-run analysis, since the analysis was computed against
  // the old request list. Wrapping the setter here means every caller
  // (BlockRequest's add/edit/delete handlers) automatically clears the
  // stale result, regardless of which navigation path is later used to
  // reach the AiAnalysis screen (Continue button, sidebar nav, etc).
  const setRequests = (updater) => {
    setRequestsRaw(updater);
    setAnalysis(null);
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