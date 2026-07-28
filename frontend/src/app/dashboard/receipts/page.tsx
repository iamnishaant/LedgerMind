"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { Upload, FileImage, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

type UploadStatus = "idle" | "uploading" | "pending" | "processing" | "needs_review" | "completed" | "failed";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: UploadStatus;
  receiptId?: string;
  confidence?: number | null;
  error?: string;
}

// Terminal states — polling stops here.
const DONE: UploadStatus[] = ["completed", "failed", "needs_review"];

const STATUS_LABEL: Record<UploadStatus, string> = {
  idle: "idle",
  uploading: "uploading",
  pending: "queued",
  processing: "working",
  needs_review: "needs review",
  completed: "completed",
  failed: "failed",
};

export default function ReceiptsPage() {
  const { businessId, authedFetch } = useBusiness();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const timers = useRef<Set<ReturnType<typeof setInterval>>>(new Set());

  // Clear any in-flight pollers if the user navigates away mid-processing.
  useEffect(() => () => { timers.current.forEach(clearInterval); timers.current.clear(); }, []);

  /**
   * Poll a receipt until it reaches a terminal state.
   *
   * Shared by upload AND post-approval resume: approving moves the receipt back
   * to `processing`, so polling has to start again — without this the row sat on
   * a spinner forever because the original poller had already stopped at
   * `needs_review`.
   */
  const pollUntilDone = useCallback((receiptId: string, localId: string) => {
    let polls = 0;
    // Must OUTLAST the backend watchdog (INGEST_TIMEOUT_SECONDS, 300s), or the
    // UI declares a timeout while the pipeline is still legitimately running
    // and would have resolved on its own moments later.
    const MAX_POLLS = 170;         // ~5.7 min at 2s
    const interval = setInterval(async () => {
      polls++;
      try {
        const r = await authedFetch(`/api/v1/receipts/${receiptId}`);
        if (!r.ok) throw new Error(`status check failed (${r.status})`);
        const d = await r.json();
        setFiles(prev => prev.map(f => f.id === localId
          ? { ...f, status: d.status as UploadStatus, confidence: d.confidence }
          : f));
        if (DONE.includes(d.status)) {
          clearInterval(interval); timers.current.delete(interval);
        } else if (polls >= MAX_POLLS) {
          clearInterval(interval); timers.current.delete(interval);
          setFiles(prev => prev.map(f => f.id === localId
            ? { ...f, status: "failed", error: "Timed out waiting for processing. Check the Audit Log for details." }
            : f));
        }
      } catch (err) {
        clearInterval(interval); timers.current.delete(interval);
        setFiles(prev => prev.map(f => f.id === localId
          ? { ...f, status: "failed", error: (err as Error).message }
          : f));
      }
    }, 2000);
    timers.current.add(interval);
  }, [authedFetch]);

  /** Called by a review row once the backend has accepted the correction. */
  const resumeAfterApproval = useCallback((localId: string, receiptId: string) => {
    setFiles(prev => prev.map(f => f.id === localId
      ? { ...f, status: "processing", error: undefined }
      : f));
    pollUntilDone(receiptId, localId);
  }, [pollUntilDone]);

  const handleFiles = useCallback(async (fileList: FileList) => {
    const newFiles = Array.from(fileList).map<UploadedFile>((f, i) => ({
      id: `${Date.now()}-${i}`, name: f.name, size: f.size, status: "uploading",
    }));
    setFiles(prev => [...newFiles, ...prev]);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const localId = newFiles[i].id;
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("business_id", businessId);
        const res = await authedFetch(`/api/v1/receipts/upload`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? "Upload failed");
        setFiles(prev => prev.map(f => f.id === localId ? { ...f, status: "processing", receiptId: data.receipt_id } : f));
        pollUntilDone(data.receipt_id, localId);
      } catch (err) {
        setFiles(prev => prev.map(f => f.id === localId
          ? { ...f, status: "failed", error: (err as Error).message }
          : f));
      }
    }
  }, [businessId, authedFetch, pollUntilDone]);

  const statusIcon = (s: UploadStatus) => {
    if (s === "completed") return <CheckCircle2 size={16} color="var(--color-success)" />;
    if (s === "failed") return <X size={16} color="var(--color-danger)" />;
    if (s === "needs_review") return <AlertCircle size={16} color="var(--color-warning)" />;
    return <Loader2 size={16} color="var(--color-primary-glow)" style={{ animation: "spin 1s linear infinite" }} />;
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)" }}>Receipt Upload</h1>
        <p style={{ color: "var(--color-text-dim)", marginTop: "4px" }}>Drag & drop or click to upload receipts and invoices</p>
      </Reveal>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ scale: 1.006 }}
        onDragEnter={() => setIsDragging(true)}
        onDragOver={e => e.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
        onClick={() => document.getElementById("file-input")?.click()}
        style={{
          border: `2px dashed ${isDragging ? "var(--color-primary-glow)" : "var(--color-stroke)"}`,
          borderRadius: "16px", padding: "48px 24px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
          cursor: "pointer", transition: "border-color 0.2s ease, background 0.2s ease",
          background: isDragging ? "var(--ghost-bg-hover)" : "var(--color-surface)",
        }}>
        <motion.div animate={isDragging ? { y: -6 } : { y: 0 }} transition={{ type: "spring", stiffness: 300 }}>
          <Upload size={36} color="var(--color-primary-glow)" />
        </motion.div>
        <p style={{ color: "var(--color-text)", fontWeight: 600 }}>Drop receipts here or click to browse</p>
        <p style={{ color: "var(--color-text-dim)", fontSize: "0.8rem" }}>JPG, PNG, PDF — max 10MB</p>
        <button className="btn-primary">Choose Files</button>
        <input id="file-input" type="file" multiple accept="image/*,.pdf" style={{ display: "none" }}
          onChange={e => e.target.files && handleFiles(e.target.files)} />
      </motion.div>

      {files.length > 0 && (
        <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <AnimatePresence initial={false}>
            {files.map(f => (
              <motion.div
                key={f.id}
                layout
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="glass-card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: "14px" }}>
                <FileImage size={20} color="var(--color-text-dim)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text)" }}>{f.name}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--color-text-dim)" }}>
                    {(f.size / 1024).toFixed(1)} KB
                    {/* Only render a real reading. A pending receipt has confidence
                        null, and `null !== undefined` is true — the old check showed
                        every queued receipt a misleading "Confidence: 0%". */}
                    {typeof f.confidence === "number" && ` · Confidence: ${(f.confidence * 100).toFixed(0)}%`}
                  </div>
                  {f.error && (
                    <div style={{ fontSize: "0.72rem", color: "var(--color-danger)", marginTop: 3 }}>{f.error}</div>
                  )}
                </div>
                <span className={`badge badge-${f.status}`}>{STATUS_LABEL[f.status] ?? f.status}</span>
                {statusIcon(f.status)}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Review queue — receipts the agents couldn't finish on their own.
          Most often the total couldn't be read; supplying it resumes the graph
          at the human-review breakpoint. */}
      {files.some(f => f.status === "needs_review") && (
        <div style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>
            Needs your review
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-dim)", marginBottom: 12 }}>
            The agents read these but weren&apos;t confident enough to book them. Confirm the total to finish.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {files.filter(f => f.status === "needs_review").map(f => (
              <ReviewRow key={f.id} file={f} onApproved={() => resumeAfterApproval(f.id, f.receiptId!)} />
            ))}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * One row of the review queue. Collects the total the OCR couldn't read and
 * POSTs it to /receipts/{id}/approve, which resumes the LangGraph run at the
 * human-review breakpoint and books the expense.
 */
function ReviewRow({ file, onApproved }: {
  file: UploadedFile;
  onApproved: () => void;
}) {
  const { authedFetch } = useBusiness();
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setErr("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await authedFetch(`/api/v1/receipts/${file.receiptId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          corrected_amount: value,
          ...(vendor.trim() ? { corrected_vendor: vendor.trim() } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail ?? `Approve failed (${r.status})`);
      // The backend has flipped the receipt back to `processing` and resumed the
      // graph — hand off so the parent restarts polling to completion.
      onApproved();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: "14px 18px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <AlertCircle size={18} color="var(--color-warning)" />
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {file.name}
        </div>
        {err && <div style={{ fontSize: "0.72rem", color: "var(--color-danger)", marginTop: 3 }}>{err}</div>}
      </div>
      <input
        type="number" step="0.01" min="0" inputMode="decimal"
        value={amount} onChange={e => setAmount(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
        placeholder="Total ₹" aria-label={`Total amount for ${file.name}`}
        disabled={saving}
        className="input" style={{ width: 120 }}
      />
      <input
        value={vendor} onChange={e => setVendor(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
        placeholder="Vendor (optional)" aria-label={`Vendor for ${file.name}`}
        disabled={saving}
        className="input" style={{ width: 160 }}
      />
      <button onClick={submit} disabled={saving} className="btn-primary"
        style={{ padding: "9px 18px", fontSize: "0.85rem", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving…" : "Approve"}
      </button>
    </div>
  );
}
