import React, { useState } from "react";

interface User { id: number; username: string; }

interface Props {
  onAuth: (token: string, user: User) => void;
}

export default function AuthView({ onAuth }: Props) {
  const [mode,     setMode]     = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      onAuth(data.token, data.user);
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gbc-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="gbc-title" style={{ textAlign: "center" }}>♟ Chess</div>

        <div className="gbc-btn-row" style={{ justifyContent: "center" }}>
          <button
            className={`gbc-btn${mode === "login" ? " active" : ""}`}
            onClick={() => { setMode("login"); setError(""); }}
          >Login</button>
          <button
            className={`gbc-btn${mode === "register" ? " active" : ""}`}
            onClick={() => { setMode("register"); setError(""); }}
          >Register</button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="gbc-section">{mode === "login" ? "Sign In" : "Create Account"}</div>

          <input
            className="gbc-input"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            className="gbc-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
          />

          {error && <div className="gbc-error">{error}</div>}

          <button
            className="gbc-btn primary"
            type="submit"
            disabled={loading}
          >
            {loading ? "…" : mode === "login" ? "▶ Login" : "★ Create Account"}
          </button>
        </form>

        <div className="gbc-hint" style={{ textAlign: "center" }}>
          {mode === "login"
            ? "No account? Click Register above."
            : "Already have one? Click Login above."}
        </div>
      </div>
    </div>
  );
}
