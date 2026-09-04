import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  Train, ArrowRight, PlayCircle, Brain, TrendingUp, ShieldCheck,
  RefreshCw, Database, Clock, LogIn, UserPlus, ClipboardList, MapPin,
  Settings2, BarChart3, Mail, Phone, MapPinned, Lock, User, Eye, EyeOff,
  Menu, X,
} from "lucide-react";
import trainBanner from "./assets/images/train-banner.png";
import bottomImage from "./assets/images/Bottom.png";
import { useAuth } from "./auth/AuthContext.jsx";

/* ---------------------------------------------------------------
   Nav model — one source of truth for labels + the section they
   scroll to. Add an entry here and it shows up in both navs.
---------------------------------------------------------------- */
const NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it works" },
  { id: "contact", label: "Contact" },
];

const HEADER_OFFSET = 76;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* Works out which nav section counts as "active" for a given scroll
   position. A section's getBoundingClientRect().top + window.scrollY
   is its absolute position on the page — that's constant regardless
   of where the viewport currently is, so this can be called with a
   hypothetical/in-progress scroll position, not just the real one. */
function sectionForScrollY(scrollY) {
  const scrollPosition = scrollY + HEADER_OFFSET + 120;
  let current = "home";

  NAV_ITEMS.forEach(({ id }) => {
    const section = document.getElementById(id);
    if (!section) return;

    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    if (scrollPosition >= sectionTop) current = id;
  });

  return current;
}

/* smoothScrollTo now supports:
   - onComplete: fires once the animation reaches its target
   - isCancelled(): checked every frame; if it returns true the loop
     stops touching the scroll position immediately. This is what
     stops a superseded scroll (e.g. a second nav click mid-animation)
     from fighting the newer one for control of window.scrollTo.
   - onProgress(y): fires every frame with the y just scrolled to, so
     the caller can keep something (like the pill) in sync with the
     animation instead of only reacting once it finishes. */
function smoothScrollTo(targetY, duration = 900, onComplete, isCancelled, onProgress) {
  const startY = window.scrollY;
  const distance = targetY - startY;
  const startTime = performance.now();

  function step(now) {
    if (isCancelled && isCancelled()) return;

    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const y = startY + distance * easeInOutCubic(t);

    window.scrollTo(0, y);
    if (onProgress) onProgress(y);

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      window.scrollTo(0, targetY);
      if (onProgress) onProgress(targetY);
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(step);
}

/* ---------------------------------------------------------------
   PillNav — a background pill that slides + stretches to whichever
   item is active, with a springy overshoot so it feels bouncy
   rather than mechanical. Position/width are measured off the
   real DOM nodes, so it always lines up regardless of label length.
---------------------------------------------------------------- */
function PillNav({ activeId, onSelect }) {
  const containerRef = useRef(null);
  const btnRefs = useRef({});
  const [pill, setPill] = useState(null);

  const measure = (id) => {
    const btn = btnRefs.current[id];
    const container = containerRef.current;
    if (!btn || !container) return;
    const c = container.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    setPill({ left: b.left - c.left, width: b.width });
  };

  useLayoutEffect(() => {
    measure(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    const onResize = () => measure(activeId);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  return (
    <nav
      ref={containerRef}
      className="relative hidden md:flex items-center"
      style={{ gap: 4, height: 44 }}
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            left: pill.left,
            width: pill.width,
            top: 3,
            height: 38,
            background: "var(--signal)",
            transition:
              "left 380ms cubic-bezier(0.22, 1, 0.36, 1), width 380ms cubic-bezier(0.22, 1, 0.36, 1)",
            boxShadow: "0 3px 10px rgba(225,163,60,0.4)",
          }}
        />
      )}
      {NAV_ITEMS.map(({ id, label }) => {
        const isActive = id === activeId;
        return (
          <button
            key={id}
            ref={(el) => (btnRefs.current[id] = el)}
            type="button"
            onClick={() => onSelect(id)}
            className="pill-btn relative rounded-full font-semibold"
            style={{
              padding: "0 18px",
              height: 44,
              fontSize: 14,
              color: isActive ? "#171208" : "var(--ink)",
              zIndex: 1,
            }}
          >
            <span className="pill-label inline-block">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ---------------------------------------------------------------
   Small building blocks
---------------------------------------------------------------- */
function Readout({ icon: Icon, value, label }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={18} style={{ color: "var(--signal)" }} />
      <div>
        <div className="font-bold" style={{ fontFamily: "var(--display)", fontSize: 20, color: "#fff" }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: "#9FB0C2" }}>{label}</div>
      </div>
    </div>
  );
}

function FeatureRow({ icon: Icon, title, text, last }) {
  return (
    <div
      className="flex gap-4 py-6"
      style={{ borderBottom: last ? "none" : "1px solid var(--line)" }}
    >
      <div
        className="shrink-0 flex items-center justify-center rounded-xl"
        style={{ width: 46, height: 46, background: "var(--rail)" }}
      >
        <Icon size={20} color="#fff" />
      </div>
      <div>
        <h3 className="font-bold mb-1" style={{ color: "var(--ink)" }}>{title}</h3>
        <p style={{ color: "var(--steel)", fontSize: 15, lineHeight: 1.6, maxWidth: 440 }}>{text}</p>
      </div>
    </div>
  );
}

function StatTile({ value, label }) {
  return (
    <div style={{ borderLeft: "3px solid var(--signal)", paddingLeft: 16 }}>
      <div className="font-bold" style={{ fontFamily: "var(--display)", fontSize: 26, color: "var(--rail)" }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: "var(--steel)" }}>{label}</div>
    </div>
  );
}

/* Track schematic — the hero visual. Segments encode block status
   (clear / planned / maintenance); a single marker glides across it
   on a slow loop as the one deliberate motion moment on the page. */
function TrackSchematic() {
  const blocks = [
    { w: 70, status: "clear" },
    { w: 46, status: "planned" },
    { w: 90, status: "clear" },
    { w: 40, status: "maintenance" },
    { w: 64, status: "clear" },
    { w: 54, status: "planned" },
  ];
  const colors = {
    clear: "#2E7D5B",
    planned: "var(--signal)",
    maintenance: "#B34635",
  };
  let x = 20;
  const segs = blocks.map((b) => {
    const seg = { ...b, x };
    x += b.w + 6;
    return seg;
  });
  const totalW = x + 20;

  return (
    <div>
      <svg viewBox={`0 0 ${totalW} 96`} width="100%" height="120" style={{ overflow: "visible" }}>
        <line x1="16" y1="52" x2={totalW - 16} y2="52" stroke="var(--line)" strokeWidth="10" strokeLinecap="round" />
        {segs.map((s, i) => (
          <rect key={i} x={s.x} y="45" width={s.w} height="14" rx="4" fill={colors[s.status]} />
        ))}
        {segs.map((s, i) => (
          <circle key={`d-${i}`} cx={s.x + s.w / 2} cy="30" r="4" fill={colors[s.status]} opacity="0.55" />
        ))}
        <g style={{ animation: "glide 7s ease-in-out infinite" }}>
          <circle cx="20" cy="52" r="9" fill="var(--ink)" />
          <circle cx="20" cy="52" r="9" fill="none" stroke="#fff" strokeWidth="2" />
        </g>
      </svg>
      <div className="flex gap-5 mt-3 flex-wrap" style={{ fontSize: 12, color: "var(--steel)" }}>
        {Object.entries(colors).map(([k, c]) => (
          <div key={k} className="flex items-center gap-2">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: "inline-block" }} />
            <span className="capitalize">{k}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes glide {
          0% { transform: translateX(0); }
          45% { transform: translateX(${totalW - 56}px); }
          50% { transform: translateX(${totalW - 56}px); }
          95% { transform: translateX(0); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function AuthPage({ type, onBack, onSwitch }) {
  const login = type === "login";
  const [show, setShow] = useState(false);
  const { login: doLogin, signup: doSignup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the user flips between login/signup so
  // stale values (and errors) from one mode don't leak into the other.
  useEffect(() => {
    setName("");
    setEmail("");
    setPassword("");
    setAgreed(false);
    setError("");
    setSubmitting(false);
  }, [type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!login && !agreed) {
      setError("Please agree to the terms & conditions to continue.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      if (login) {
        await doLogin({ email, password });
      } else {
        await doSignup({ name, email, password });
      }
      // On success, AuthContext's user state flips to non-null and
      // AppRoot swaps this page out for the main app automatically —
      // nothing to navigate here.
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="h-screen w-full flex items-center justify-center px-5 relative overflow-hidden"
      style={{
        "--ink": "#12181F",
        "--paper": "#F3F5F4",
        "--panel": "#101A27",
        "--rail": "#1F3A5F",
        "--signal": "#E1A33C",
        "--steel": "#5C6B79",
        "--line": "#DFE4E2",
        "--display": "'Chakra Petch', sans-serif",

        backgroundImage: `url(${bottomImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",

        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Background overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(16,26,39,0.82), rgba(31,58,95,0.68))",
        }}
      />

      {/* Subtle gold glow */}
      <div
        className="absolute"
        style={{
          width: 350,
          height: 350,
          right: "-120px",
          top: "-120px",
          borderRadius: "50%",
          background: "rgba(225,163,60,0.10)",
          filter: "blur(60px)",
        }}
      />

      {/* Main wrapper */}
      <div className="relative z-10 w-full max-w-md">

        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-3 font-semibold"
          style={{
            color: "#fff",
            fontSize: 14,
          }}
        >
          ← Back
        </button>

        {/* Card */}
        <div
          className="rounded-2xl"
          style={{
            background: "rgba(255,255,255,0.97)",
            border: "1px solid rgba(255,255,255,0.55)",
            boxShadow: "0 25px 70px rgba(0,0,0,0.40)",
            padding: "24px 28px",
          }}
        >

          {/* BRAND */}
          <div className="flex items-center gap-3 mb-4">

            <div
              className="flex items-center justify-center rounded-xl"
              style={{
                width: 42,
                height: 42,
                background: "#E8F0FA",
              }}
            >
              <Train
                size={21}
                strokeWidth={2.2}
                style={{
                  color: "var(--rail)",
                }}
              />
            </div>

            <div>
              <div
                className="font-bold leading-tight"
                style={{
                  fontFamily: "var(--display)",
                  fontSize: 18,
                  color: "var(--ink)",
                }}
              >
                TrackSquad
              </div>

              <div
                style={{
                  fontSize: 10,
                  color: "var(--steel)",
                  marginTop: 1,
                }}
              >
                AI block planning
              </div>
            </div>

          </div>

          {/* HEADING */}
          <h1
            className="font-bold mb-1"
            style={{
              fontFamily: "var(--display)",
              fontSize: 27,
              lineHeight: 1.15,
              color: "var(--ink)",
            }}
          >
            {login ? "Welcome back" : "Create your account"}
          </h1>

          <p
            className="mb-2"
            style={{
              color: "var(--steel)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {login
              ? "Log in to keep planning smarter railways."
              : "Start planning smarter railways with TrackSquad."}
          </p>

          <form onSubmit={handleSubmit}>
            {/* NAME */}
            {!login && (
              <label className="block mb-3">
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--ink)" }}
                >
                  Full name
                </span>

                <div className="relative mt-1">
                  <User
                    className="absolute left-3 top-3"
                    size={15}
                    style={{ color: "var(--steel)" }}
                  />

                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    className="w-full rounded-lg pl-9 pr-3 py-2.5 outline-none"
                    style={{
                      border: "1px solid var(--line)",
                      background: "#fff",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                    placeholder="Your name"
                  />
                </div>
              </label>
            )}

            {/* EMAIL */}
            <label className="block mb-3">
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--ink)" }}
              >
                Email
              </span>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg px-3 py-2.5 mt-1 outline-none"
                style={{
                  border: "1px solid var(--line)",
                  background: "#fff",
                  fontSize: 13,
                  color: "var(--ink)",
                }}
                placeholder="you@company.com"
              />
            </label>

            {/* PASSWORD */}
            <label className="block mb-3">
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--ink)" }}
              >
                Password
              </span>

              <div className="relative mt-1">

                <Lock
                  className="absolute left-3 top-3"
                  size={15}
                  style={{ color: "var(--steel)" }}
                />

                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={login ? undefined : 8}
                  autoComplete={login ? "current-password" : "new-password"}
                  className="w-full rounded-lg pl-9 pr-10 py-2.5 outline-none"
                  style={{
                    border: "1px solid var(--line)",
                    background: "#fff",
                    fontSize: 13,
                    color: "var(--ink)",
                  }}
                  placeholder="Password"
                />

                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-2.5"
                  style={{
                    color: "var(--steel)",
                  }}
                >
                  {show ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>

              </div>
            </label>

            {/* TERMS */}
            {!login && (
              <label
                className="flex items-center gap-2 mb-4"
                style={{
                  color: "var(--steel)",
                  fontSize: 11,
                }}
              >
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  style={{
                    accentColor: "var(--rail)",
                  }}
                />

                <span>
                  I agree to the terms & conditions.
                </span>
              </label>
            )}

            {/* ERROR */}
            {error && (
              <p
                className="mb-2"
                style={{
                  color: "#B3261E",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {error}
              </p>
            )}

            {/* BUTTON */}
            <button
              type="submit"
              disabled={submitting}
              className="cta-btn w-full font-semibold rounded-lg text-white"
              style={{
                background: "var(--rail)",
                padding: "11px 16px",
                fontSize: 14,
                boxShadow: "0 5px 14px rgba(31,58,95,0.25)",
                opacity: submitting ? 0.75 : 1,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting
                ? login
                  ? "Logging in…"
                  : "Creating account…"
                : login
                ? "Log in"
                : "Create account"}
            </button>
          </form>

          {/* SWITCH */}
          <p
            className="text-center mt-3"
            style={{
              color: "var(--steel)",
              fontSize: 12,
            }}
          >
            {login
              ? "Don't have an account?"
              : "Already have an account?"}{" "}

            <button
              onClick={onSwitch}
              className="font-semibold"
              style={{
                color: "var(--rail)",
              }}
            >
              {login ? "Sign up" : "Log in"}
            </button>
          </p>

        </div>

        {/* Bottom branding */}
        <div
          className="text-center mt-1"
          style={{
            color: "rgba(255,255,255,0.65)",
            fontSize: 10,
          }}
        >
          TrackSquad · AI-powered railway block planning
        </div>

      </div>
    </div>
  );
}
/* ---------------------------------------------------------------
   Main page
---------------------------------------------------------------- */
export default function TrackSquadLanding() {
  const [page, setPage] = useState("home");
  const [activeId, setActiveId] = useState("home");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Tracks whether a click-triggered scroll animation is currently
  // in flight, so the scroll-position scrollspy below knows to stay
  // quiet and let the click "own" the pill until it arrives.
  const isAutoScrolling = useRef(false);

  // Incremented on every goTo() call. Lets a stale animation frame
  // loop or onComplete callback recognize it's been superseded by a
  // newer click and back off instead of fighting for scroll control.
  const scrollRunId = useRef(0);

  const goTo = (id) => {
    setMobileOpen(false);

    const el = document.getElementById(id);
    if (!el) return;

    const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;

    const runId = ++scrollRunId.current;
    isAutoScrolling.current = true;

    smoothScrollTo(
      y,
      1000,
      () => {
        // A newer click already took over — don't finalize this one.
        if (scrollRunId.current !== runId) return;

        setActiveId(id);

        // Small buffer before scrollspy resumes, so trailing scroll
        // events from the animation itself don't immediately override
        // the destination we just landed on.
        setTimeout(() => {
          if (scrollRunId.current === runId) isAutoScrolling.current = false;
        }, 100);
      },
      () => scrollRunId.current !== runId,
      (currentY) => {
        // Keep the pill riding along with the animation itself, so it
        // travels through whatever sections it passes instead of
        // sitting still and snapping to the destination at the end.
        if (scrollRunId.current !== runId) return;
        const passing = sectionForScrollY(currentY);
        setActiveId((prev) => (prev === passing ? prev : passing));
      }
    );
  };

  // Scrollspy based on actual scroll position rather than
  // IntersectionObserver. This avoids two sections both reporting as
  // "intersecting" mid-scroll, and — combined with isAutoScrolling —
  // stays silent while a click-triggered scroll is still animating.
  useEffect(() => {
    if (page !== "home") return;

    let ticking = false;

    const updateActiveSection = () => {
      if (isAutoScrolling.current) {
        ticking = false;
        return;
      }

      const currentSection = sectionForScrollY(window.scrollY);
      setActiveId((previous) => (previous === currentSection ? previous : currentSection));
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateActiveSection);
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateActiveSection(); // set initial section

    return () => window.removeEventListener("scroll", handleScroll);
  }, [page]);

  if (page === "login" || page === "signup") {
    return (
      <AuthPage
        type={page}
        onBack={() => setPage("home")}
        onSwitch={() => setPage(page === "login" ? "signup" : "login")}
      />
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        "--ink": "#12181F",
        "--paper": "#F3F5F4",
        "--panel": "#101A27",
        "--rail": "#1F3A5F",
        "--signal": "#E1A33C",
        "--steel": "#5C6B79",
        "--line": "#DFE4E2",
        "--display": "'Chakra Petch', sans-serif",
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        .pill-btn { transition: transform 160ms ease; }
        .pill-btn:hover .pill-label { animation: wobble 480ms ease; }
        .pill-btn:active { transform: scale(0.94); }
        @keyframes wobble {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(-6deg); }
          55% { transform: rotate(5deg); }
          80% { transform: rotate(-2deg); }
          100% { transform: rotate(0deg); }
        }
        .cta-btn { transition: transform 160ms cubic-bezier(0.34,1.6,0.5,1); }
        .cta-btn:hover { transform: translateY(-2px); }
        .cta-btn:active { transform: scale(0.96) translateY(0); }
      `}</style>

      {/* HEADER */}
      <header
        className="sticky top-0 z-50"
        style={{ background: "rgba(243,245,244,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--line)" }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6" style={{ height: 72 }}>
          <button onClick={() => goTo("home")} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--rail)" }}>
              <Train size={20} color="#fff" />
            </div>
            <div className="text-left">
              <div className="font-bold leading-tight" style={{ fontFamily: "var(--display)" }}>TrackSquad</div>
              <div style={{ fontSize: 11, color: "var(--steel)" }}>AI block planning</div>
            </div>
          </button>

          <PillNav activeId={activeId} onSelect={goTo} />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage("login")}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold"
              style={{ color: "var(--rail)", border: "1px solid var(--rail)" }}
            >
              <LogIn size={15} /> Log in
            </button>
            <button
              onClick={() => setPage("signup")}
              className="cta-btn flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white"
              style={{ background: "var(--rail)" }}
            >
              <UserPlus size={15} /> Sign up
            </button>
            <button className="md:hidden p-2" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle menu">
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden px-6 pb-4 flex flex-col gap-1" style={{ borderTop: "1px solid var(--line)" }}>
            {NAV_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => goTo(id)}
                className="text-left py-2.5 font-medium rounded-lg px-3"
                style={{
                  background: activeId === id ? "var(--signal)" : "transparent",
                  color: activeId === id ? "#171208" : "var(--ink)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* HERO */}
      <section id="home" className="max-w-6xl mx-auto px-6 pt-16 pb-14">
        <div className="grid md:grid-cols-2 gap-14 items-center">
          <div>
            

            <h1
              className="font-bold mb-6"
              style={{ fontFamily: "var(--display)", fontSize: 44, lineHeight: 1.12, letterSpacing: "-0.01em" }}
            >
              Plan your railway's next block before the last one closes.
            </h1>

            <p className="mb-9" style={{ color: "var(--steel)", fontSize: 17, lineHeight: 1.65, maxWidth: 460 }}>
              TrackSquad reads track occupancy, maintenance windows and traffic demand together, then proposes
              the block plan a dispatcher would have taken an hour to build by hand.
            </p>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => setPage("signup")}
                className="cta-btn flex items-center gap-2 font-semibold px-6 py-3.5 rounded-xl text-white"
                style={{ background: "var(--rail)" }}
              >
                Get started <ArrowRight size={17} />
              </button>
              <button
                onClick={() => goTo("how-it-works")}
                className="cta-btn flex items-center gap-2 font-semibold px-6 py-3.5 rounded-xl"
                style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
              >
                <PlayCircle size={17} /> See how it works
              </button>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid var(--line)" }}>
            <img
              src={trainBanner}
              alt="TrackSquad train banner"
              className="w-full object-cover"
              style={{ height: 160, display: "block" }}
            />
            <div className="p-7">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold" style={{ fontSize: 13, color: "var(--steel)" }}>Block A — schematic view</span>
                <span style={{ fontSize: 12, color: "var(--steel)" }}>Live</span>
              </div>
              <TrackSchematic />
            </div>
          </div>
        </div>

        {/* DISPATCH BOARD */}
        <div className="mt-14 rounded-2xl px-8 py-7 grid grid-cols-2 md:grid-cols-4 gap-8" style={{ background: "var(--panel)" }}>
          <Readout icon={Database} value="4+" label="Datasets integrated" />
          <Readout icon={Brain} value="AI" label="Powered insights" />
          <Readout icon={TrendingUp} value="95%" label="Planning efficiency" />
          <Readout icon={Clock} value="24/7" label="System availability" />
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-14">
          <div>
            <h2 className="font-bold mb-5" style={{ fontFamily: "var(--display)", fontSize: 30 }}>
              Built for planners who need clarity, not another dashboard
            </h2>
            <p className="mb-4" style={{ color: "var(--steel)", lineHeight: 1.7 }}>
              TrackSquad takes the guesswork out of block planning. Planners get one view of track availability,
              maintenance windows, and traffic demand — instead of stitching it together across spreadsheets
              and radio calls.
            </p>
            <p style={{ color: "var(--steel)", lineHeight: 1.7 }}>
              It learns from historical and live data to recommend block plans that cut conflicts and delays
              before they reach the timetable.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 content-start">
            <StatTile value="10k+" label="Blocks planned" />
            <StatTile value="120+" label="Rail routes covered" />
            <StatTile value="30%" label="Fewer conflicts" />
            <StatTile value="24/7" label="Live monitoring" />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20" style={{ background: "#fff", borderTop: "1px solid var(--line)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-bold mb-10" style={{ fontFamily: "var(--display)", fontSize: 30 }}>
            Everything a dispatcher's desk needs
          </h2>
          <div className="grid md:grid-cols-2 md:gap-x-16">
            <FeatureRow icon={Brain} title="AI-powered analysis" text="Models trained on prior block plans flag the options least likely to conflict with live traffic." />
            <FeatureRow icon={TrendingUp} title="Data-driven decisions" text="Occupancy, maintenance, and demand data feed one recommendation instead of three separate reports." />
            <FeatureRow icon={ShieldCheck} title="Reliable by design" text="Every proposed plan is checked against safety and signalling rules before it reaches a planner." last />
            <FeatureRow icon={RefreshCw} title="End-to-end automation" text="Requests, scheduling, and plan optimisation run without manual hand-offs between teams." last />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — connected timeline, echoing the track motif */}
      <section id="how-it-works" className="py-20" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-bold mb-14" style={{ fontFamily: "var(--display)", fontSize: 30 }}>
            From request to plan, four stops
          </h2>
          <div className="relative grid md:grid-cols-4 gap-10">
            <div
              className="hidden md:block absolute"
              style={{ top: 19, left: "12%", right: "12%", height: 3, background: "var(--line)" }}
            />
            {[
              { icon: ClipboardList, title: "Submit a request", text: "Log a maintenance or block request in seconds." },
              { icon: MapPin, title: "Analyse track data", text: "Traffic and availability are cross-referenced automatically." },
              { icon: Settings2, title: "Generate the plan", text: "TrackSquad proposes the block plan with the fewest conflicts." },
              { icon: BarChart3, title: "Monitor & adjust", text: "Track performance live and refine the next plan from it." },
            ].map((s, i) => (
              <div key={s.title} className="relative">
                <div
                  className="relative z-10 flex items-center justify-center rounded-full mb-5"
                  style={{ width: 40, height: 40, background: "var(--signal)", color: "#171208", fontWeight: 700, fontFamily: "var(--display)" }}
                >
                  {i + 1}
                </div>
                <s.icon size={20} style={{ color: "var(--rail)", marginBottom: 10 }} />
                <h3 className="font-bold mb-2">{s.title}</h3>
                <p style={{ color: "var(--steel)", fontSize: 14, lineHeight: 1.6 }}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section
        id="contact"
        className="relative py-20 overflow-hidden"
        style={{
          backgroundImage: `url(${bottomImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Dark overlay for readability */}
        <div
          className="absolute inset-0"
          style={{
            background: "rgba(8, 20, 38, 0.72)",
          }}
        />

        {/* Contact content */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-14">
          <div style={{ color: "#fff" }}>
            <h2
              className="font-bold mb-5"
              style={{
                fontFamily: "var(--display)",
                fontSize: 30,
              }}
            >
              Let's talk about your railway network
            </h2>

            <p
              className="mb-8"
              style={{
                color: "#D7E0E8",
                lineHeight: 1.7,
              }}
            >
              Have a question about block planning, or want to see it run on
              your own corridor? Reach out.
            </p>

            <div className="space-y-4" style={{ color: "#fff" }}>
              <div className="flex items-center gap-3">
                <Mail size={18} style={{ color: "var(--signal)" }} />
                hello@tracksquad.ai
              </div>

              <div className="flex items-center gap-3">
                <Phone size={18} style={{ color: "var(--signal)" }} />
                +1 (555) 010-2030
              </div>

              <div className="flex items-center gap-3">
                <MapPinned size={18} style={{ color: "var(--signal)" }} />
                142 Rail Yard Ave, Suite 400
              </div>
            </div>
          </div>

          <div
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: "rgba(255,255,255,0.96)",
              backdropFilter: "blur(6px)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <input
              className="w-full rounded-lg px-4 py-3 outline-none"
              style={{ border: "1px solid var(--line)" }}
              placeholder="Your name"
            />

            <input
              className="w-full rounded-lg px-4 py-3 outline-none"
              style={{ border: "1px solid var(--line)" }}
              placeholder="you@company.com"
            />

            <textarea
              rows="4"
              className="w-full rounded-lg px-4 py-3 outline-none"
              style={{ border: "1px solid var(--line)" }}
              placeholder="Your message"
            />

            <button
              type="button"
              className="cta-btn w-full font-semibold py-3 rounded-lg text-white"
              style={{ background: "var(--rail)" }}
            >
              Send message
            </button>
          </div>
        </div>
      </section>

      <footer className="text-center py-7" style={{ background: "var(--panel)", color: "#7C8CA0", fontSize: 13 }}>
        © {new Date().getFullYear()} TrackSquad. All rights reserved.
      </footer>
    </div>
  );
}