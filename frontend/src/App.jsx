import React from "react";
import Step1_Upload from "./screens/Upload/Upload.jsx";

export default function App() {
  return (
    <Step1_Upload onContinue={() => alert("Continue → Step 2 (not built yet)")} />
  );
}