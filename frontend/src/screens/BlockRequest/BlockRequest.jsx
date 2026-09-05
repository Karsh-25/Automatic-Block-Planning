import React, { useState } from "react";
import {
  ClipboardList,
  Plus,
  Trash2,
  Pencil,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

import {
  HeroBanner,
  cn,
} from "../../components/layout/Layout";

import { resolveAssetLocation } from "../../config/assetStationMap";

// ============================================================
// CONFIG
// ============================================================

const ACTIVITY_TYPES = [
  "Track Maintenance",
  "Signal Maintenance",
  "Overhead Equipment",
  "Inspection",
];

const PRIORITIES = [
  "Low",
  "Medium",
  "High",
  "Critical",
];

const FLEXIBILITY_OPTIONS = [
  "Fixed",
  "±15 min",
  "±30 min",
  "±60 min",
];

const URGENCY_OPTIONS = [
  "Normal",
  "Urgent",
];

// Required team dropdown
const TEAM_OPTIONS = [
  "Bridge Inspection Team",
  "Track Maintenance Team",
  "Signal Team",
  "OHE Team",
];

const PRIORITY_STYLES = {
  Low: "bg-slate-100 text-slate-600",
  Medium: "bg-amber-100 text-amber-700",
  High: "bg-red-100 text-red-600",
  Critical: "bg-red-600 text-white",
};

// ============================================================
// EMPTY FORM
// ============================================================

// Section ID and Station Code are:
// 1. Auto-filled when Asset ID exists in assetStationMap.
// 2. Manually entered when Asset ID has no mapping.
//
// Backend/default fields:
// - block_request_id -> generated automatically
// - section_id       -> auto OR manually entered
// - station_code     -> auto OR manually entered
// - status           -> automatically "Pending"

const EMPTY_FORM = {
  activity: ACTIVITY_TYPES[0],
  assetId: "",
  location: {
    sectionId: "",
    stationCode: "",
  },
  duration: "",
  priority: "High",
  preferredStartTime: "",
  flexibility: FLEXIBILITY_OPTIONS[2],
  requiredTeam: "",
  urgency: "Normal",
};

// ============================================================
// REQUEST ID
// ============================================================

function nextRequestId(requests) {
  const numbers = requests
    .map((request) => {
      const match = String(request.id || "").match(/^BR-(\d+)$/);
      return match ? Number(match[1]) : 0;
    })
    .filter((number) => number > 0);

  const nextNumber =
    numbers.length > 0
      ? Math.max(...numbers) + 1
      : 1;

  return `BR-${String(nextNumber).padStart(3, "0")}`;
}

// ============================================================
// REQUEST FORM
// ============================================================

function RequestForm({
  form,
  setForm,
  onAdd,
  error,
  editing,
}) {
  const inputClass =
    "h-10 w-full box-border rounded-lg border border-slate-200 px-3 text-sm text-slate-800 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400";

  const selectClass = cn(
    inputClass,
    "appearance-none pr-9"
  );

  const labelClass =
    "text-xs font-medium text-slate-500 mb-1.5 block h-4";

  const Select = ({
    value,
    onChange,
    options,
  }) => (
    <div className="relative">
      <select
        className={selectClass}
        value={value}
        onChange={onChange}
      >
        {options.map((option) => (
          <option
            key={option}
            value={option}
          >
            {option}
          </option>
        ))}
      </select>

      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">

      {/* ======================================================
          ROW 1
          ====================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start mb-4">

        {/* Activity */}
        <div>
          <label className={labelClass}>
            Activity
          </label>

          <Select
            value={form.activity}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                activity: e.target.value,
              }))
            }
            options={ACTIVITY_TYPES}
          />
        </div>

        {/* Asset */}
        <div>
          <label className={labelClass}>
            Asset ID
          </label>

          <input
            className={inputClass}
            placeholder="e.g. AST-0157"
            value={form.assetId}
            onChange={(e) => {
              const assetId =
                e.target.value.toUpperCase();

              // Try automatic asset -> section/station mapping
              const resolved =
                resolveAssetLocation(assetId);

              setForm((f) => ({
                ...f,
                assetId,

                // If mapping exists, use it.
                // Otherwise create an editable empty location.
                location:
                  resolved || {
                    sectionId: "",
                    stationCode: "",
                  },
              }));
            }}
          />

          {/* Asset mapping status */}
          {form.assetId.trim() === "" ? (
            <div className="text-[10px] text-slate-400 mt-1">
              Section and station can be auto-filled from the asset.
            </div>
          ) : form.location?.sectionId &&
            form.location?.stationCode ? (
            <div className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
              <span className="font-medium">
                ✓ Auto-filled from asset
              </span>
            </div>
          ) : (
            <div className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle size={10} />
              <span>
                Asset not mapped — enter Section and Station manually.
              </span>
            </div>
          )}
        </div>

        {/* ==================================================
            Section ID
            Auto if possible, otherwise manual
            ================================================== */}

        <div>
          <label className={labelClass}>
            Section ID
          </label>

          <input
            className={inputClass}
            value={form.location?.sectionId || ""}
            placeholder="Auto from asset or enter manually"
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                location: {
                  ...(f.location || {}),
                  sectionId:
                    e.target.value.toUpperCase(),
                },
              }))
            }
          />
        </div>

        {/* ==================================================
            Station Code
            Auto if possible, otherwise manual
            ================================================== */}

        <div>
          <label className={labelClass}>
            Station Code
          </label>

          <input
            className={inputClass}
            value={form.location?.stationCode || ""}
            placeholder="Auto from asset or enter manually"
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                location: {
                  ...(f.location || {}),
                  stationCode:
                    e.target.value.toUpperCase(),
                },
              }))
            }
          />
        </div>

      </div>

      {/* ======================================================
          ROW 2
          ====================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start mb-4">

        {/* Duration */}
        <div>
          <label className={labelClass}>
            Duration (min)
          </label>

          <input
            type="number"
            min="1"
            className={inputClass}
            placeholder="45"
            value={form.duration}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                duration: e.target.value,
              }))
            }
          />
        </div>

        {/* Preferred Start */}
        <div>
          <label className={labelClass}>
            Preferred Start Time
          </label>

          <input
            type="time"
            className={inputClass}
            value={form.preferredStartTime}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                preferredStartTime: e.target.value,
              }))
            }
          />
        </div>

        {/* Priority */}
        <div>
          <label className={labelClass}>
            Priority
          </label>

          <Select
            value={form.priority}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                priority: e.target.value,
              }))
            }
            options={PRIORITIES}
          />
        </div>

        {/* Flexibility */}
        <div>
          <label className={labelClass}>
            Time Flexibility
          </label>

          <Select
            value={form.flexibility}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                flexibility: e.target.value,
              }))
            }
            options={FLEXIBILITY_OPTIONS}
          />
        </div>

      </div>

      {/* ======================================================
          ROW 3
          ====================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">

        {/* Required Team */}
        <div>
          <label className={labelClass}>
            Required Team
          </label>

          <Select
            value={form.requiredTeam}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                requiredTeam: e.target.value,
              }))
            }
            options={[
              "Select team",
              ...TEAM_OPTIONS,
            ]}
          />
        </div>

        {/* Urgency */}
        <div>
          <label className={labelClass}>
            Request Urgency
          </label>

          <Select
            value={form.urgency}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                urgency: e.target.value,
              }))
            }
            options={URGENCY_OPTIONS}
          />
        </div>

      </div>

      {/* ERROR */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 mt-3">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* ADD / UPDATE BUTTON */}
      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
        >
          <Plus size={16} />

          {editing
            ? "Update Request"
            : "Add Request"}
        </button>
      </div>

    </div>
  );
}

// ============================================================
// REQUEST TABLE
// ============================================================

function RequestTable({
  requests,
  onEdit,
  onDelete,
}) {
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-5 text-center">

        <ClipboardList
          size={26}
          className="text-slate-300"
        />

        <div className="text-sm font-medium text-slate-500">
          No block requests yet
        </div>

        <div className="text-xs text-slate-400">
          Add a maintenance request above to get started.
        </div>

      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">

      <table className="w-full min-w-[940px] text-sm table-fixed">

        <colgroup>
          <col className="w-[8%]" />
          <col className="w-[14%]" />
          <col className="w-[11%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[9%]" />
          <col className="w-[16%]" />
        </colgroup>

        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">

            <th className="px-4 py-3 font-medium">
              ID
            </th>

            <th className="px-4 py-3 font-medium">
              Activity
            </th>

            <th className="px-4 py-3 font-medium">
              Asset
            </th>

            <th className="px-4 py-3 font-medium">
              Section / Station
            </th>

            <th className="px-4 py-3 font-medium">
              Duration
            </th>

            <th className="px-4 py-3 font-medium">
              Preferred
            </th>

            <th className="px-4 py-3 font-medium">
              Priority
            </th>

            <th className="px-4 py-3 font-medium">
              Flex
            </th>

            <th className="px-4 py-3 font-medium text-right">
              Action
            </th>

          </tr>
        </thead>

        <tbody>
          {requests.map((r) => (
            <tr
              key={r.id}
              className="border-t border-slate-100"
            >

              <td className="px-4 py-3 align-middle font-medium text-slate-700 truncate">
                {r.id}
              </td>

              <td className="px-4 py-3 align-middle text-slate-600 truncate">
                {r.activity}
              </td>

              <td className="px-4 py-3 align-middle text-slate-600 truncate">
                {r.assetId}
              </td>

              <td className="px-4 py-3 align-middle text-slate-600 truncate">
                {r.section_id && r.station_code
                  ? `${r.section_id} / ${r.station_code}`
                  : "—"}
              </td>

              <td className="px-4 py-3 align-middle text-slate-600 truncate">
                {r.duration} min
              </td>

              <td className="px-4 py-3 align-middle text-slate-600 truncate">
                {r.preferredStartTime}
              </td>

              <td className="px-4 py-3 align-middle">

                <span
                  className={cn(
                    "inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap",
                    PRIORITY_STYLES[r.priority]
                  )}
                >
                  {r.priority}
                </span>

              </td>

              <td className="px-4 py-3 align-middle text-slate-600 truncate">
                {r.flexibility}
              </td>

              <td className="px-4 py-3 align-middle">

                <div className="flex items-center justify-end gap-2">

                  <button
                    type="button"
                    onClick={() => onEdit(r.id)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                    aria-label={`Edit ${r.id}`}
                  >
                    <Pencil size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(r.id)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                    aria-label={`Delete ${r.id}`}
                  >
                    <Trash2 size={14} />
                  </button>

                </div>

              </td>

            </tr>
          ))}
        </tbody>

      </table>

    </div>
  );
}

// ============================================================
// MAIN SCREEN
// ============================================================

export default function BlockRequest({
  requests,
  setRequests,
  completedKeys,
  onContinue,
  onBack,
  onNavigate,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  // ==========================================================
  // VALIDATION
  // ==========================================================

  const validate = () => {

    // Asset ID is still required
    if (!form.assetId.trim()) {
      return "Asset ID is required.";
    }

    // Section ID can be auto-filled OR manually entered
    if (!form.location?.sectionId?.trim()) {
      return "Section ID is required.";
    }

    // Station Code can be auto-filled OR manually entered
    if (!form.location?.stationCode?.trim()) {
      return "Station Code is required.";
    }

    if (
      !form.duration ||
      Number(form.duration) <= 0
    ) {
      return "Duration must be a positive number.";
    }

    if (!form.preferredStartTime) {
      return "Preferred start time is required.";
    }

    if (
      !form.requiredTeam ||
      form.requiredTeam === "Select team"
    ) {
      return "Required team is required.";
    }

    return "";
  };

  // ==========================================================
  // ADD / UPDATE REQUEST
  // ==========================================================

  const handleAdd = () => {

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");

    if (editingId) {

      // ======================================================
      // UPDATE EXISTING REQUEST
      // ======================================================

      setRequests((prev) =>
        prev.map((r) =>
          r.id === editingId
            ? {
                ...r,
                ...form,

                duration: Number(form.duration),

                // Backend-named fields
                section_id:
                  form.location?.sectionId || "",

                station_code:
                  form.location?.stationCode || "",

                // Always keep status Pending
                status: "Pending",
              }
            : r
        )
      );

      setEditingId(null);

    } else {

      // ======================================================
      // ADD NEW REQUEST
      // ======================================================

      setRequests((prev) => [
        ...prev,

        {
          id: nextRequestId(prev),

          ...form,

          duration: Number(form.duration),

          // Backend-named fields
          // These can come from auto mapping OR manual entry.
          section_id:
            form.location?.sectionId || "",

          station_code:
            form.location?.stationCode || "",

          // Backend/default field
          status: "Pending",
        },
      ]);
    }

    // Reset form after add/update
    setForm(EMPTY_FORM);
  };

  // ==========================================================
  // EDIT REQUEST
  // ==========================================================

  const handleEdit = (id) => {

    const target = requests.find(
      (r) => r.id === id
    );

    if (!target) return;

    setForm({
      activity:
        target.activity ||
        ACTIVITY_TYPES[0],

      assetId:
        target.assetId || "",

      // Prefer saved backend values.
      // If unavailable, try automatic asset mapping.
      location:
        target.section_id || target.station_code
          ? {
              sectionId:
                target.section_id || "",

              stationCode:
                target.station_code || "",
            }
          : resolveAssetLocation(
              target.assetId || ""
            ) || {
              sectionId: "",
              stationCode: "",
            },

      duration:
        target.duration !== undefined
          ? String(target.duration)
          : "",

      priority:
        target.priority || "High",

      preferredStartTime:
        target.preferredStartTime || "",

      flexibility:
        target.flexibility ||
        FLEXIBILITY_OPTIONS[2],

      requiredTeam:
        target.requiredTeam || "",

      urgency:
        target.urgency || "Normal",
    });

    setEditingId(id);
    setError("");
  };

  // ==========================================================
  // DELETE REQUEST
  // ==========================================================

  const handleDelete = (id) => {

    setRequests((prev) =>
      prev.filter((r) => r.id !== id)
    );

    if (editingId === id) {
      setEditingId(null);
      setForm(EMPTY_FORM);
      setError("");
    }
  };

  // ==========================================================
  // CONTINUE
  // ==========================================================

  const canContinue =
    requests.length > 0;

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <>

      <HeroBanner
        title="Create Block Request"
        subtitle="Add the maintenance activities and block requirements you need scheduled."
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
          onClick={() =>
            onContinue?.(requests)
          }
          className={cn(
            "px-6 sm:px-7 py-2 sm:py-2.5 rounded-lg text-base sm:text-lg font-semibold border transition-all duration-200",

            canContinue
              ? "border-[#3a83f7] bg-[#3a83f7] text-white hover:bg-[#3275e6] hover:border-[#3275e6] shadow-sm"
              : "border-red-300 bg-transparent text-red-400 cursor-not-allowed"
          )}
        >
          Continue →
        </button>

      </div>

      {/* FORM */}

      <RequestForm
        form={form}
        setForm={setForm}
        onAdd={handleAdd}
        error={error}
        editing={Boolean(editingId)}
      />

      {/* REQUEST TABLE */}

      <div className="mt-5">
        <RequestTable
          requests={requests}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

    </>
  );
}