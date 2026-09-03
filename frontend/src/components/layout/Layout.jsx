import React from "react";
import { CheckCircle2, Settings, LogOut } from "lucide-react";
import { NAV_ITEMS } from "../../config/workflow";
import trainIcon from "../../assets/images/train-icon.png";
import trainBanner from "../../assets/images/train-banner.png";

/** Joins conditional className fragments, skipping falsy values. */
export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

// ============================================================
// SIDEBAR (shared across every step screen)
// ============================================================

/**
 * @param {{
 *   items?: typeof NAV_ITEMS,
 *   activeKey: string,
 *   completedKeys?: string[],
 *   onNavigate?: (key: string) => void,
 * }} props
 */
export function Sidebar({ items = NAV_ITEMS, activeKey, completedKeys = [], onNavigate }) {
  const activeIndex = items.findIndex((item) => item.key === activeKey);

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-[#0a0f24] text-slate-300">
      {/* LOGO */}
      <div className="flex items-center gap-1 px-5 pt-6 pb-6">
        <div className="w-10 h-10 flex items-center justify-center shrink-0">
          <img src={trainIcon} alt="" className="w-9 h-9 object-contain" />
        </div>
        <div>
          <div className="text-white text-lg font-bold leading-tight">TrackSquad</div>
          <div className="text-[12px] text-slate-400 leading-tight">AI Block Planning</div>
        </div>
      </div>

      {/* WORKFLOW */}
      <div className="px-3">
        <div className="px-3 mb-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          Planning Workflow
        </div>

        <nav className="space-y-1" aria-label="Planning workflow steps">
          {items.map((item, i) => {
            const Icon = item.icon;
            const isActive = i === activeIndex;
            const isCompleted = completedKeys.includes(item.key) || i < activeIndex;
            const isReachable = isActive || isCompleted;

            return (
              <div key={item.key} className="relative">
                {i < items.length - 1 && (
                  <div className="absolute left-[22px] top-[42px] h-3 w-px bg-slate-700" />
                )}

                <button
                  type="button"
                  aria-current={isActive ? "step" : undefined}
                  aria-disabled={!isReachable}
                  disabled={!isReachable}
                  onClick={() => isReachable && onNavigate?.(item.key)}
                  className={cn(
                    "relative z-10 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition text-left",
                    isActive
                      ? "bg-indigo-600/90 text-white font-medium shadow-sm"
                      : isReachable
                      ? "text-slate-400 hover:bg-white/5 hover:text-white"
                      : "text-slate-600 cursor-not-allowed opacity-60"
                  )}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                      isActive
                        ? "bg-white/20 text-white"
                        : isCompleted
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-slate-800 text-slate-500"
                    )}
                  >
                    {isCompleted && !isActive ? <CheckCircle2 size={13} /> : <Icon size={13} />}
                  </div>
                  <span>{item.label}</span>
                </button>
              </div>
            );
          })}
        </nav>
      </div>

      {/* BOTTOM MENU */}
      <div className="mt-auto px-3 pb-6 pt-4 border-t border-white/5 space-y-1">
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-white transition"
        >
          <Settings size={17} />
          Settings
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-white transition"
        >
          <LogOut size={17} />
          Logout
        </button>
      </div>
    </aside>
  );
}

// ============================================================
// TOPBAR (shared across every step screen)
// ============================================================

/**
 * @param {{ icon?: React.ComponentType, label: string, userName?: string }} props
 */
export function Topbar({ icon: Icon, label, userName = "Pushkar" }) {
  const userInitial = userName.trim().charAt(0).toUpperCase() || "P";

  return (
    <header className="flex items-center justify-between px-4 sm:px-6 h-14 bg-white border-b border-slate-200 shrink-0">
      <div className="flex items-center gap-2 text-sm text-slate-700 font-medium min-w-0">
        {Icon && <Icon size={16} className="text-slate-400 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <button type="button" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center">
            {userInitial}
          </span>
          <span className="hidden sm:block text-sm text-slate-700 font-medium">{userName}</span>
        </button>
      </div>
    </header>
  );
}

// ============================================================
// TRAIN BANNER (shared across every step's hero section)
// ============================================================

export function TrainBanner({ className = "w-full h-full object-cover object-right" }) {
  return <img src={trainBanner} alt="Railway" className={className} />;
}

/**
 * Standard hero block used at the top of every step screen: title + subtitle
 * on the left, train banner image bleeding off the right edge.
 * @param {{ title: string, subtitle: string }} props
 */
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
// PAGE SHELL — wraps Sidebar + Topbar + scrollable content
// ============================================================

/**
 * @param {{
 *   activeKey: string,
 *   onNavigate?: (key: string) => void,
 *   completedKeys?: string[],
 *   topbarIcon?: React.ComponentType,
 *   topbarLabel: string,
 *   children: React.ReactNode,
 * }} props
 */
export function PageShell({ activeKey, onNavigate, completedKeys, topbarIcon, topbarLabel, children }) {
  return (
    <div className="flex h-screen bg-[#F4F6FE]">
      <Sidebar activeKey={activeKey} onNavigate={onNavigate} completedKeys={completedKeys} />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar icon={topbarIcon} label={topbarLabel} />
        <main className="flex-1 overflow-y-auto px-2 pt-1 pb-4 sm:px-6 sm:pt-2 sm:pb-5 lg:px-8 lg:pt-2 lg:pb-5">
          {children}
        </main>
      </div>
    </div>
  );
}