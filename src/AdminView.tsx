import React, { useEffect, useRef, useState } from "react";

const API = "http://localhost:3010/api/lesson";

type JobStatus = "pending" | "processing" | "done" | "failed";

type Job = {
  id: string;
  filename: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
  outputFile?: string;
};

const STATUS_COLOR: Record<JobStatus, string> = {
  pending:    "rgba(255,200,50,0.85)",
  processing: "rgba(80,160,255,0.85)",
  done:       "rgba(60,200,100,0.85)",
  failed:     "rgba(220,70,70,0.85)",
};

const STATUS_ICON: Record<JobStatus, string> = {
  pending:    "⏳",
  processing: "⚙️",
  done:       "✅",
  failed:     "❌",
};

export default function AdminView() {
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lessonId, setLessonId] = useState("");
  const [msg, setMsg]           = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Poll status every 2s ──────────────────────────────────────────────────
  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function fetchStatus() {
    try {
      const r = await fetch(`${API}/status`);
      if (r.ok) setJobs(await r.json());
    } catch (_) {}
  }

  // ── Upload (supports multiple files) ────────────────────────────────────
  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(f => /\.(txt|md|markdown)$/i.test(f.name));
    if (list.length === 0) { setMsg("❌ Only .txt / .md files are accepted"); return; }
    setUploading(true);
    setMsg("");
    try {
      const fd = new FormData();
      // For single file with an ID override, honour it; otherwise derive from filename
      if (list.length === 1 && lessonId.trim()) {
        fd.append("lessonId", lessonId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"));
      }
      for (const f of list) fd.append("files", f);

      const r = await fetch(`${API}/upload`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Upload failed");

      if (data.queued) {
        setMsg(`✅ Queued ${data.queued.length} files for processing`);
      } else {
        setMsg(`✅ Uploaded as "${data.lessonId}" — processing started`);
      }
      setLessonId("");
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  // ── Delete job ────────────────────────────────────────────────────────────
  async function deleteJob(id: string) {
    await fetch(`${API}/${id}`, { method: "DELETE" });
    fetchStatus();
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  }

  const hasProcessing = jobs.some(j => j.status === "processing" || j.status === "pending");

  return (
    <div style={S.shell}>
      <div style={S.header}>
        <div>
          <div style={S.title}>🛠 Lesson Generator</div>
          <div style={S.subtitle}>
            Drop a lesson document (.txt / .md) — the AI converts it to a TypeScript lesson and the app updates live.
          </div>
        </div>
        {hasProcessing && <div style={S.spinnerBadge}>⚙️ Processing…</div>}
      </div>

      {/* ── Upload area ── */}
      <div
        style={{ ...S.dropzone, ...(dragging ? S.dropzoneActive : {}) }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.markdown"
          multiple
          style={{ display: "none" }}
          onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ""; }}
        />
        {uploading
          ? <span style={S.dropText}>⚙️ Uploading…</span>
          : <span style={S.dropText}>📄 Drop lesson file(s) here or click to browse<br/><span style={{ fontSize: 12, opacity: 0.55 }}>(.txt or .md · multiple files OK)</span></span>
        }
      </div>

      {/* ── Optional lesson ID override ── */}
      <div style={S.idRow}>
        <span style={S.idLabel}>Lesson ID (optional):</span>
        <input
          style={S.idInput}
          placeholder="e.g. italian-game  (auto-derived from filename if blank)"
          value={lessonId}
          onChange={e => setLessonId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
        />
      </div>

      {msg && <div style={{ ...S.msg, color: msg.startsWith("✅") ? "#5cd679" : "#e05555" }}>{msg}</div>}

      {/* ── Jobs list ── */}
      <div style={S.sectionTitle}>
        Jobs {jobs.length > 0 && <span style={S.badge}>{jobs.length}</span>}
      </div>

      {jobs.length === 0 && (
        <div style={S.empty}>No jobs yet — upload a lesson file to get started.</div>
      )}

      {jobs.map(job => (
        <div key={job.id} style={S.jobCard}>
          <div style={S.jobTop}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...S.statusBadge, color: STATUS_COLOR[job.status] }}>
                {STATUS_ICON[job.status]} {job.status.toUpperCase()}
              </span>
              <span style={S.jobId}>{job.id}</span>
            </div>
            <button
              style={S.deleteBtn}
              onClick={() => deleteJob(job.id)}
              title="Remove job"
            >✕</button>
          </div>

          <div style={S.jobMeta}>
            {new Date(job.createdAt).toLocaleTimeString()} — {job.filename}
          </div>

          {job.status === "processing" && (
            <div style={S.progressBar}>
              <div style={S.progressFill} />
            </div>
          )}

          {job.status === "done" && job.outputFile && (
            <div style={S.doneFile}>
              📁 {job.outputFile} — live in the Tutorial tab
            </div>
          )}

          {job.status === "failed" && job.error && (
            <div style={S.errorBox}>{job.error}</div>
          )}
        </div>
      ))}

      <div style={S.helpText}>
        <strong>How it works:</strong><br />
        1. Upload a .txt or .md file containing your lesson content with FENs<br />
        2. The AI reads it and generates a TypeScript lesson file<br />
        3. The file lands in <code>src/lessons/</code> — Vite picks it up instantly<br />
        4. Your new lesson appears in the Tutorial tab immediately — no restart needed
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  shell: {
    maxWidth: 780, margin: "0 auto", padding: "32px 24px",
    color: "rgba(255,255,255,0.9)",
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 28,
  },
  title:    { fontSize: 24, fontWeight: 800, marginBottom: 4 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.45)", maxWidth: 520, lineHeight: 1.5 },
  spinnerBadge: {
    fontSize: 13, padding: "6px 14px", borderRadius: 20,
    background: "rgba(80,160,255,0.15)", border: "1px solid rgba(80,160,255,0.35)",
    color: "rgba(120,190,255,0.9)", whiteSpace: "nowrap",
  },
  dropzone: {
    border: "2px dashed rgba(255,255,255,0.15)", borderRadius: 16,
    padding: "40px 20px", textAlign: "center", cursor: "pointer",
    transition: "all 0.15s", marginBottom: 16,
    background: "rgba(255,255,255,0.02)",
  },
  dropzoneActive: {
    borderColor: "rgba(255,200,50,0.6)", background: "rgba(255,200,50,0.06)",
  },
  dropText: { fontSize: 15, lineHeight: 1.8, color: "rgba(255,255,255,0.55)" },
  idRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 },
  idLabel: { fontSize: 13, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" },
  idInput: {
    flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, padding: "7px 12px", color: "rgba(255,255,255,0.85)", fontSize: 13,
  },
  msg: { fontSize: 13, marginBottom: 12, fontWeight: 600 },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)", marginBottom: 12, display: "flex", gap: 8,
    alignItems: "center",
  },
  badge: {
    fontSize: 11, padding: "1px 7px", borderRadius: 99,
    background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)",
  },
  empty: {
    fontSize: 13, color: "rgba(255,255,255,0.3)",
    textAlign: "center", padding: "24px 0",
  },
  jobCard: {
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12, padding: "14px 16px", marginBottom: 10,
  },
  jobTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  statusBadge: { fontSize: 12, fontWeight: 700, letterSpacing: 0.5 },
  jobId: { fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)" },
  jobMeta: { fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 },
  deleteBtn: {
    background: "none", border: "none", color: "rgba(255,255,255,0.25)",
    cursor: "pointer", fontSize: 14, padding: "2px 6px", borderRadius: 6,
  },
  progressBar: {
    height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)",
    overflow: "hidden", marginTop: 8,
  },
  progressFill: {
    height: "100%", width: "100%", borderRadius: 2,
    background: "linear-gradient(90deg, rgba(80,160,255,0.4) 0%, rgba(80,160,255,0.9) 50%, rgba(80,160,255,0.4) 100%)",
    animation: "shimmer 1.5s infinite",
  },
  doneFile: {
    fontSize: 12, color: "rgba(100,220,130,0.8)", marginTop: 6,
    fontFamily: "monospace",
  },
  errorBox: {
    fontSize: 12, color: "rgba(220,100,100,0.9)", marginTop: 6,
    background: "rgba(200,50,50,0.08)", borderRadius: 6, padding: "6px 10px",
    fontFamily: "monospace", whiteSpace: "pre-wrap",
  },
  helpText: {
    fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.8,
    marginTop: 28, padding: "16px 20px",
    background: "rgba(255,255,255,0.02)", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.06)",
  },
};
