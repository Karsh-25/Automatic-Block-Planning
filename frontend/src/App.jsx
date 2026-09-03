import React, { useState } from "react";
import Upload from "./screens/Upload/Upload.jsx";
import BlockRequest from "./screens/BlockRequest/BlockRequest.jsx";

export default function App() {
  const [step, setStep] = useState("upload");

  // Lifted here (instead of living inside each screen) so switching
  // steps — including hitting Back — doesn't wipe what the user entered.
  const [files, setFiles] = useState({});
  const [requests, setRequests] = useState([]);

  // Tracks which steps the user has already advanced past, so the
  // sidebar keeps them unlocked even after navigating back to an
  // earlier step. Once a step is completed it stays completed.
  const [completedSteps, setCompletedSteps] = useState([]);

  const markCompleted = (key) => {
    setCompletedSteps((prev) => (prev.includes(key) ? prev : [...prev, key]));
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
          alert(`Continue → Step 3 (not built yet). ${requests.length} request(s) captured.`);
        }}
        onNavigate={(key) => setStep(key)}
      />
    );
  }

  return null;
}