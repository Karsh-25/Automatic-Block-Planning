import React from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import TrackSquadLanding from "./TrackSquadsLanding.jsx";
import App from "./App.jsx";

// Reads auth state and picks which "page" the person sees. Split out from
// AppRoot so it can sit inside AuthProvider and call useAuth().
function AuthGate() {
  const { user, loading } = useAuth();

  // Session-restore check (GET /api/auth/me) hasn't resolved yet — avoid
  // flashing the landing page for an instant before swapping to the app.
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center" style={{ background: "#F4F6FE" }}>
        <div className="text-sm font-medium text-slate-500">Loading…</div>
      </div>
    );
  }

  return user ? <App /> : <TrackSquadLanding />;
}

export default function AppRoot() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
