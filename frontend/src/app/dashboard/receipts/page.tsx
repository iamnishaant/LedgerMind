"use client";
import { useState, useCallback } from "react";
import { Upload, FileImage, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

type UploadStatus = "idle" | "uploading" | "processing" | "needs_review" | "completed" | "failed";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: UploadStatus;
  receiptId?: string;
  confidence?: number;
}

export default function ReceiptsPage() {
  const { businessId, authedFetch } = useBusiness();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

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
        const interval = setInterval(async () => {
          const r = await authedFetch(`/api/v1/receipts/${data.receipt_id}`);
          const d = await r.json();
          setFiles(prev => prev.map(f => f.id === localId ? { ...f, status: d.status, confidence: d.confidence } : f));
          if (["completed","failed","needs_review"].includes(d.status)) clearInterval(interval);
        }, 2000);
      } catch {
        setFiles(prev => prev.map(f => f.id === localId ? { ...f, status: "failed" } : f));
      }
    }
  }, [businessId, authedFetch]);

  const statusIcon = (s: UploadStatus) => {
    if (s === "completed") return <CheckCircle2 size={16} color="#2f8f52" />;
    if (s === "failed") return <X size={16} color="#b23a2e" />;
    if (s === "needs_review") return <AlertCircle size={16} color="#b9791c" />;
    return <Loader2 size={16} color="#9c6b1f" style={{ animation: "spin 1s linear infinite" }} />;
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#241c15" }}>Receipt Upload</h1>
        <p style={{ color: "#8a7a64", marginTop: "4px" }}>Drag & drop or click to upload receipts and invoices</p>
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
          border: `2px dashed ${isDragging ? "#b8862e" : "rgba(36,28,21,0.14)"}`,
          borderRadius: "16px", padding: "48px 24px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "12px",
          cursor: "pointer", transition: "border-color 0.2s ease, background 0.2s ease",
          background: isDragging ? "rgba(184,134,46,0.06)" : "#ffffff",
        }}>
        <motion.div animate={isDragging ? { y: -6 } : { y: 0 }} transition={{ type: "spring", stiffness: 300 }}>
          <Upload size={36} color="#9c6b1f" />
        </motion.div>
        <p style={{ color: "#241c15", fontWeight: 600 }}>Drop receipts here or click to browse</p>
        <p style={{ color: "#8a7a64", fontSize: "0.8rem" }}>JPG, PNG, PDF — max 10MB</p>
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
                <FileImage size={20} color="#8a7a64" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#241c15" }}>{f.name}</div>
                  <div style={{ fontSize: "0.72rem", color: "#8a7a64" }}>
                    {(f.size / 1024).toFixed(1)} KB
                    {f.confidence !== undefined && ` · Confidence: ${(f.confidence * 100).toFixed(0)}%`}
                  </div>
                </div>
                <span className={`badge badge-${f.status}`}>{f.status.replace("_", " ")}</span>
                {statusIcon(f.status)}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
