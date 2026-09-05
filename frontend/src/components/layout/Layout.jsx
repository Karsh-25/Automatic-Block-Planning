import React from "react";
import { CheckCircle2, LogOut } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { NAV_ITEMS } from "../../config/workflow";
import trainIcon from "../../assets/images/train-icon.png";
import trainBanner from "../../assets/images/train-banner.png";
import { useAuth } from "../../auth/AuthContext.jsx";

/** Joins conditional className fragments, skipping falsy values. */
export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

// ============================================================
// SIDEBAR — Accordion Vertical Stepper
// Active step blooms (larger + label), connectors auto-squeeze
// ============================================================

// Sizes for each step state. ACTIVE is 1.25x its previous value (52 -> 65).
const ACTIVE_SIZE = 65;
const COMPLETED_SIZE = 34;
const INACTIVE_SIZE = 30;

export function Sidebar({ items = NAV_ITEMS, activeKey, completedKeys = [], onNavigate }) {
  const activeIndex = items.findIndex((item) => item.key === activeKey);
  const { logout } = useAuth();

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 h-full justify-between bg-transparent select-none">

      {/* 1. LOGO */}
      <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-200/80 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
          <img src={trainIcon} alt="TrackSquad" className="w-6 h-6 object-contain brightness-0 invert" />
        </div>
        <div>
          <div className="text-slate-900 text-base font-bold leading-tight">TrackSquad</div>
          <div className="text-[11px] text-slate-400 font-medium leading-tight">AI Block Planning</div>
        </div>
      </div>

      {/* 2. ACCORDION STEPPER
          Key idea: connectors are flex-1 siblings of shrink-0 step nodes.
          When the active step grows (larger circle + label), connectors
          absorb the difference and shorten automatically — no JS math needed.

          NOTE on the two fixes below:
          - Container uses `py-5` (padding, not margin) + `overflow-visible` so the
            active ring never gets clipped by the container edge, even for the
            very first/last item.
          - The step-node wrapper uses `layout="position"` (not full `layout`) so it
            only animates position, not size/scale. Combined with removing `layout`
            from the button itself (it's fully driven by `animate` width/height),
            this stops Framer's automatic FLIP scale-correction from bleeding into
            sibling circles and making them look like they're "rescaling" too.
            Only the connector lines (which genuinely need to grow/shrink) keep
            full `layout`. */}
      <LayoutGroup id="sidebar-stepper">
        <div className="flex-1 flex flex-col items-center py-5 px-4 min-h-0 overflow-visible">
          {items.map((item, i) => {
            const Icon = item.icon;
            const isActive   = i === activeIndex;
            const isCompleted = completedKeys.includes(item.key) || i < activeIndex;
            const isReachable = isActive || isCompleted;

            const size = isActive ? ACTIVE_SIZE : isCompleted ? COMPLETED_SIZE : INACTIVE_SIZE;

            return (
              <React.Fragment key={item.key}>

                {/* ── Connector track ──────────────────────────────────── */}
                {/* flex-1 means it grows to fill whatever height is left   */}
                {/* after all step nodes take their (variable) space. Kept  */}
                {/* min-h small so it has more room to squeeze down when    */}
                {/* the active circle grows.                                */}
                {i > 0 && (
                  <motion.div
                    className="w-px flex-1 min-h-[4px] rounded-full"
                    initial={false}
                    animate={{
                      backgroundColor: i <= activeIndex ? "#10b981" : "#cbd5e1",
                    }}
                    transition={{ duration: 0.35 }}
                  />
                )}

                {/* ── Step node ──────────────────────────────────────────── */}
                {/* Plain div on purpose — no `layout` prop, so this node is
                    never part of Framer's shared FLIP tracking. Its position
                    still shifts smoothly because the browser's own flexbox
                    engine recalculates space every animation frame while the
                    active button's width/height is mid-animate below; nothing
                    here ever gets its own size/scale touched. */}
                <div className="flex flex-col items-center shrink-0">
                  {/* Circle button — size animates purely via `animate`, no
                      `layout` here, so it doesn't trigger FLIP scale-correction
                      on itself or its siblings. */}
                  <motion.button
                    type="button"
                    title={item.label}
                    aria-label={item.label}
                    aria-current={isActive ? "step" : undefined}
                    disabled={!isReachable}
                    onClick={() => isReachable && onNavigate?.(item.key)}
                    initial={false}
                    animate={{ width: size, height: size }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    style={{ borderRadius: "9999px" }}
                    className={cn(
                      "relative flex items-center justify-center shrink-0",
                      isActive
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/40 ring-4 ring-indigo-100"
                        : isCompleted
                        ? "bg-emerald-500 text-white shadow-sm hover:brightness-105"
                        : isReachable
                        ? "bg-white border-2 border-slate-300 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 shadow-xs"
                        : "bg-slate-50 border-2 border-slate-200 text-slate-300 cursor-not-allowed"
                    )}
                  >
                    {/* Outer ring slides to the current active node via layoutId */}
                    {isActive && (
                      <motion.span
                        layoutId="activeStepRing"
                        initial={false}
                        className="absolute -inset-[8px] rounded-full border-2 border-indigo-400/50 pointer-events-none"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}

                    {/* Icon / checkmark */}
                    <div className="relative z-10 flex items-center justify-center">
                      {isCompleted && !isActive ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <Icon size={isActive ? 26 : 14} />
                      )}
                    </div>
                  </motion.button>

                  {/* Label — expands below active step, collapses for others.
                      The extra height this adds causes adjacent connectors to shorten. */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.span
                        key={`label-${item.key}`}
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: "auto", marginTop: 6 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="text-[10px] font-bold text-indigo-700 text-center leading-tight max-w-[120px] overflow-hidden"
                        transition={{ duration: 0.22, ease: "easeInOut" }}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

              </React.Fragment>
            );
          })}
        </div>
      </LayoutGroup>

      {/* 3. LOGOUT */}
      <button
        type="button"
        onClick={logout}
        title="Logout"
        aria-label="Logout"
        className="bg-red-50 hover:bg-red-500 text-red-500 hover:text-white border border-red-200/80 p-3.5 rounded-2xl shadow-xs flex items-center justify-center gap-2 transition-all duration-200 group font-medium text-sm"
      >
        <LogOut size={18} className="transition-transform group-hover:-translate-x-0.5" />
        <span>Logout</span>
      </button>
    </aside>
  );
}

// ============================================================
// TOPBAR (Clean Floating Header inside Content Box)
// ============================================================

export function Topbar({ icon: Icon, label }) {
  const { user } = useAuth();
  const userName = user?.name || user?.email || "Account";
  const userInitial = userName.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-transparent border-b border-slate-100 shrink-0">
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium min-w-0">
        {Icon && <Icon size={15} className="text-slate-400 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button type="button" className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center shadow-xs">
            {userInitial}
          </span>
          <span className="hidden sm:block text-xs text-slate-700 font-medium">{userName}</span>
        </button>
      </div>
    </header>
  );
}

// ============================================================
// TRAIN BANNER & HERO
// ============================================================

export function TrainBanner({ className = "w-full h-full object-cover object-right" }) {
  return <img src={trainBanner} alt="Railway" className={className} />;
}

export function HeroBanner({ title, subtitle }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-50 via-blue-50 to-white border border-indigo-100 mb-5 h-[100px] sm:h-[110px] lg:h-[120px]">
      <div className="relative z-10 px-5 py-5 sm:px-7 sm:py-6 lg:px-8 lg:py-7 w-[68%] sm:w-[60%] lg:w-[55%]">
        <h1 className="font-bold text-slate-900 text-[15px] leading-[1.15] sm:text-2xl sm:leading-tight lg:text-3xl">
          {title}
        </h1>
        <p className="text-slate-500 mt-1.5 text-[8px] leading-relaxed sm:text-xs lg:text-sm">
          {subtitle}
        </p>
      </div>
      <div className="absolute inset-y-0 right-0 w-[43%] sm:w-[45%] lg:w-[45%] opacity-80 sm:opacity-90 pointer-events-none">
        <TrainBanner />
      </div>
    </div>
  );
}

// ============================================================
// PAGE SHELL (Aligned Container Layout)
// ============================================================

export function PageShell({ activeKey, onNavigate, completedKeys, topbarIcon, topbarLabel, children }) {
  return (
    <div className="flex h-screen bg-[#F4F6FE] p-4 gap-2 font-['Chakra_Petch'] overflow-hidden">
      {/* LEFT SIDEBAR */}
      <Sidebar activeKey={activeKey} onNavigate={onNavigate} completedKeys={completedKeys} />

      {/* RIGHT CONTENT PANEL WITH EMBEDDED TOPBAR */}
      <div className="flex flex-1 flex-col min-w-0 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <Topbar icon={topbarIcon} label={topbarLabel} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}