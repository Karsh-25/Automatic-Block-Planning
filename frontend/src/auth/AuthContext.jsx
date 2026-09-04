import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "tracksquad_token";
const USER_KEY = "tracksquad_user";

// Real backend contract (FastAPI, running at http://127.0.0.1:8000):
//   POST /api/auth/signup { name, email, password } -> { access_token, token_type, user }
//   POST /api/auth/login  { email, password }        -> { access_token, token_type, user }
//   GET  /api/auth/me     (Authorization header)      -> user
//
// There is NO /api/auth/logout endpoint. The backend is stateless JWT, so
// logout is purely a client-side reset (clear localStorage + state) — no
// request is made. If server-side token revocation is added later, it
// belongs in a separate backend change, not here.
//
// `user` is { id, name, email, created_at }.

const API_BASE_URL = "http://127.0.0.1:8000";

// Turns a failed auth response into a clean, user-facing message —
// just the backend's `detail` text (e.g. "Invalid email or password."),
// with no HTTP status code and no JSON quoting/braces around it. FastAPI's
// `detail` is normally a plain string, so that's the common case; the
// JSON.stringify fallback only kicks in for the rare structured-error
// shape, so callers never see something like `Login failed (401): "..."`.
async function parseError(response) {
  const body = await response.json().catch(() => null);
  const detail = body?.detail ?? body;

  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      // fall through to the generic message below
    }
  }
  return "Something went wrong. Please try again.";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  // On first mount, if a token survived from a previous session, verify
  // it against the backend and restore the user — otherwise every page
  // refresh would bounce a logged-in person back to the landing page.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error("Session expired");

        const me = await response.json();
        if (!cancelled) {
          setUser(me);
          localStorage.setItem(USER_KEY, JSON.stringify(me));
        }
      } catch {
        // Stored token is invalid/expired — drop it and fall back to
        // logged-out instead of retrying it forever.
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    const { access_token, user: loggedInUser } = await response.json();
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(loggedInUser));
    setToken(access_token);
    setUser(loggedInUser);
  }, []);

  const signup = useCallback(async ({ name, email, password }) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    // Signup returns the same { access_token, user } shape as login, so a
    // new account lands the person straight in the app with no separate
    // "now go log in" step.
    const { access_token, user: newUser } = await response.json();
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(access_token);
    setUser(newUser);
  }, []);

  // Stateless JWT backend — there is no /api/auth/logout to call. Logout is
  // just clearing the locally stored token/user; AppRoot's AuthGate reacts
  // to `user` becoming null and swaps back to TrackSquadLanding on its own.
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Wraps fetch with the Authorization header attached AND the real
  // backend's base URL prepended, so any screen that needs to call an
  // authenticated backend route (analyze/optimize/simulate, etc.) doesn't
  // have to repeat either the header or the base-URL logic itself.
  // Callers keep using relative paths, e.g. authFetch("/api/analyze"),
  // and it becomes http://127.0.0.1:8000/api/analyze under the hood.
  const authFetch = useCallback(
    (path, options = {}) => {
      const headers = { ...(options.headers || {}) };
      if (token) headers.Authorization = `Bearer ${token}`;
      const url = /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path}`;
      return fetch(url, { ...options, headers });
    },
    [token]
  );

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}