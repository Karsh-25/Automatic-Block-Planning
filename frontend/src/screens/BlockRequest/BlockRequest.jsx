import React, { useState } from "react";
import { ClipboardList, Plus, Trash2, Pencil, AlertCircle, ChevronDown } from "lucide-react";
import { PageShell, HeroBanner, cn } from "../../components/layout/Layout";

// ============================================================
// CONFIG
// ============================================================

const ACTIVITY_TYPES = ["Track Maintenance", "Signal Maintenance", "Overhead Equipment", "Inspection"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const PRIORITY_STYLES = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-red-100 text-red-600",
  CRITICAL: "bg-red-600 text-white",
};

const EMPTY_FORM = {
  activity: ACTIVITY_TYPES[0],
  section: "",
  duration: "",
  priority: "HIGH",
  flexibility: "",
};

function nextRequestId(count) {
  return `BR-${String(count + 1).padStart(3, "0")}`;
}

// ============================================================
// REQUEST FORM
// ============================================================

function RequestForm({ form, setForm, onAdd, error }) {
  // Fixed height + box-border on every control (inputs AND selects) so native
  // select rendering can't push its height/baseline out of line with the
  // text inputs next to it — that mismatch was the source of the row
  // "jumping" up/down between fields.
  const inputClass =
    "h-10 w-full box-border rounded-lg border border-slate-200 px-3 text-sm text-slate-800 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400";
  const selectClass = cn(inputClass, "appearance-none pr-9");
  const labelClass = "text-xs font-medium text-slate-500 mb-1.5 block h-4";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
        <div>
          <label className={labelClass}>Activity</label>
          <div className="relative">
            <select
              className={selectClass}
              value={form.activity}
              onChange={(e) => setForm((f) => ({ ...f, activity: e.target.value }))}
            >
              {ACTIVITY_TYPES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Section</label>
          <input
            className={inputClass}
            placeholder="e.g. Section A"
            value={form.section}
            onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
          />
        </div>

        <div>
          <label className={labelClass}>Duration (min)</label>
          <input
            type="number"
            min="1"
            className={inputClass}
            placeholder="45"
            value={form.duration}
            onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
          />
        </div>

        <div>
          <label className={labelClass}>Priority</label>
          <div className="relative">
            <select
              className={selectClass}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Time Flexibility (± min)</label>
          <input
            type="number"
            min="0"
            className={inputClass}
            placeholder="30"
            value={form.flexibility}
            onChange={(e) => setForm((f) => ({ ...f, flexibility: e.target.value }))}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 mt-3">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
        >
          <Plus size={16} />
          Add Request
        </button>
      </div>
    </div>
  );
}

// ============================================================
// REQUEST TABLE
// ============================================================

function RequestTable({ requests, onEdit, onDelete }) {
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-5 text-center">
        <ClipboardList size={26} className="text-slate-300" />
        <div className="text-sm font-medium text-slate-500">No block requests yet</div>
        <div className="text-xs text-slate-400">Add a maintenance request above to get started.</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
      {/* table-fixed + an explicit colgroup pins every column to a set
          width, so a long Activity/Section value can no longer squeeze
          the Action column and make its icons drift left over the row. */}
      <table className="w-full min-w-[720px] text-sm table-fixed">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[20%]" />
          <col className="w-[16%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3 font-medium">ID</th>
            <th className="px-4 py-3 font-medium">Activity</th>
            <th className="px-4 py-3 font-medium">Section</th>
            <th className="px-4 py-3 font-medium">Duration</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Flexibility</th>
            <th className="px-4 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-4 py-3 align-middle font-medium text-slate-700 truncate">{r.id}</td>
              <td className="px-4 py-3 align-middle text-slate-600 truncate">{r.activity}</td>
              <td className="px-4 py-3 align-middle text-slate-600 truncate">{r.section}</td>
              <td className="px-4 py-3 align-middle text-slate-600 truncate">{r.duration} min</td>
              <td className="px-4 py-3 align-middle">
                <span className={cn("inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap", PRIORITY_STYLES[r.priority])}>
                  {r.priority}
                </span>
              </td>
              <td className="px-4 py-3 align-middle text-slate-600 truncate">±{r.flexibility} min</td>
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
// MAIN SCREEN (Step 2: Create Block Request)
// ============================================================

/**
 * @param {{
 *   onContinue: (requests: object[]) => void,
 *   onBack?: () => void,
 *   onNavigate?: (stepKey: string) => void,
 * }} props
 */
export default function BlockRequest({ requests, setRequests, completedKeys, onContinue, onBack, onNavigate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const validate = () => {
    if (!form.section.trim()) return "Section is required.";
    if (!form.duration || Number(form.duration) <= 0) return "Duration must be a positive number.";
    if (form.flexibility === "" || Number(form.flexibility) < 0) return "Time flexibility must be 0 or more.";
    return "";
  };

  const handleAdd = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");

    if (editingId) {
      setRequests((prev) =>
        prev.map((r) => (r.id === editingId ? { ...r, ...form, duration: Number(form.duration), flexibility: Number(form.flexibility) } : r))
      );
      setEditingId(null);
    } else {
      setRequests((prev) => [
        ...prev,
        {
          id: nextRequestId(prev.length),
          ...form,
          duration: Number(form.duration),
          flexibility: Number(form.flexibility),
        },
      ]);
    }
    setForm(EMPTY_FORM);
  };

  const handleEdit = (id) => {
    const target = requests.find((r) => r.id === id);
    if (!target) return;
    setForm({
      activity: target.activity,
      section: target.section,
      duration: String(target.duration),
      priority: target.priority,
      flexibility: String(target.flexibility),
    });
    setEditingId(id);
  };

  const handleDelete = (id) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
  };

  const canContinue = requests.length > 0;

  return (
    <PageShell
      activeKey="request"
      onNavigate={onNavigate}
      completedKeys={completedKeys}
      topbarIcon={ClipboardList}
      topbarLabel="Create Block Request"
    >
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
    onClick={() => onContinue?.(requests)}
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

<RequestForm
  form={form}
  setForm={setForm}
  onAdd={handleAdd}
  error={error}
/>

<div className="mt-5">
  <RequestTable
    requests={requests}
    onEdit={handleEdit}
    onDelete={handleDelete}
  />
</div>
    </PageShell>
  );
}