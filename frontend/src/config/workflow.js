import {
  Train,
  Activity,
  ClipboardList,
  Construction,
  UploadCloud,
  Cpu,
  CalendarClock,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";

/** Datasets required before block planning can begin (Step 1 of the workflow). */
export const DATASETS = [
  {
    key: "timetable",
    label: "Train Timetable",
    icon: Train,
    hint: "Train No., station-wise arrival/departure",
    requiredColumns: ["Train No.", "Station Code", "Arrival time", "Departure time"],
  },
  {
    key: "asset_health",
    label: "Asset Health",
    icon: Activity,
    hint: "Condition score, risk score per asset",
    // Matches asset_health_data_dictionary.md exactly.
    requiredColumns: [
      "asset_id",
      "asset_type",
      "section_id",
      "nearest_station_code",
      "age_years",
      "condition_score",
      "failure_count_24m",
      "days_since_last_maintenance",
      "usage_percent",
      "criticality",
    ],
  },
  {
    key: "block_requests",
    label: "Maintenance Requests",
    icon: ClipboardList,
    hint: "Block requests with priority & duration",
    // Matches block_request_data_dictionary.md / candidate_generator.py's
    // _REQUIRED_COLUMNS exactly — keep these two in sync if the backend
    // schema changes.
    requiredColumns: [
      "block_request_id",
      "asset_id",
      "section_id",
      "station_code",
      "maintenance_type",
      "requested_duration_min",
      "priority",
      "preferred_start_time",
      "time_flexibility",
      "required_team",
      "request_urgency",
      "status",
    ],
  },
  {
    key: "existing_blocks",
    label: "Existing Blocks",
    icon: Construction,
    hint: "Currently scheduled maintenance blocks",
    requiredColumns: ["existing_block_id", "section_id", "start_time", "end_time"],
  },
];

/**
 * The full planning workflow, in order. Shared by the Sidebar on every
 * step screen so the navigation stays identical across the app.
 *   1. upload         -> Upload / Select Railway Data
 *   2. request         -> Create Block Request
 *   3. analysis         -> AI Analyses the Network
 *   4. optimize         -> Generate Optimal Plan
 *   5. recommendation   -> Explainable Recommendation
 *   6. final            -> Final Plan
 */
export const NAV_ITEMS = [
  { key: "upload", label: "Upload Data", icon: UploadCloud },
  { key: "request", label: "Block Request", icon: ClipboardList },
  { key: "analysis", label: "AI Analysis", icon: Cpu },
  { key: "optimize", label: "Optimize Plan", icon: CalendarClock },
  { key: "recommendation", label: "Recommendation", icon: Lightbulb },
  { key: "final", label: "Final Plan", icon: CheckCircle2 },
];