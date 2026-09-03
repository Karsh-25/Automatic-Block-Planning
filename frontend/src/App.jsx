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

  // Placeholder until Developer 1/2's real API is wired in. Swap this
  // for an actual fetch("/api/analyze", { body: requests }) call —
  // the shape returned must match what AiAnalysis.jsx expects (see the
  // JSDoc on that component for the exact fields).
  const runAnalysis = async (blockRequests) => {
    await new Promise((r) => setTimeout(r, 900)); // simulated processing time
    return {
      affectedTrains: 18,
      conflictsDetected: 5,
      assetPriority: "HIGH",
      predictedDelayMin: 42,
      sections: { a: "Section A", b: "Section B", c: "Section C" },
      topConflicts: [
        { id: 1, train: "Train 12951 (NDLS – BCT)", detail: "vs Track Maintenance (Section A)", delay: "22 min" },
        { id: 2, train: "Train 12008 (BCT – NDLS)", detail: "vs Signal Maintenance (Section B)", delay: "12 min" },
        { id: 3, train: "Train 22119 (BSB – BCT)", detail: "vs Track Maintenance (Section A)", delay: "8 min" },
      ],
      summary:
        "AI has analyzed all inputs including train schedules, asset health, block requests and operational constraints to identify impacts, conflicts, asset priorities and delay predictions.",
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