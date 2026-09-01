"use client";

import { useMemo, useRef, useState } from "react";
import { allCourses, getCourse } from "@/lib/catalog";
import { extractPdfText } from "@/lib/pdf";
import { parseTranscript } from "@/lib/transcript";
import { isPending, type CourseStatus, type TakenCourse } from "@/lib/types";

type Mode = "upload" | "search";

interface Props {
  taken: TakenCourse[];
  onReplace: (courses: TakenCourse[], meta?: { csa?: number }) => void;
  onAdd: (course: TakenCourse) => void;
  onRemove: (index: number) => void;
  onToggleStatus: (index: number) => void;
}

export function RecordPanel({ taken, onReplace, onAdd, onRemove, onToggleStatus }: Props) {
  const [mode, setMode] = useState<Mode>("upload");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const takenCodes = new Set(taken.map((t) => t.code));
    return allCourses
      .filter((c) => !takenCodes.has(c.code))
      .filter((c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      .slice(0, 40);
  }, [query, taken]);

  async function handleFile(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const text = file.type === "application/pdf" || file.name.endsWith(".pdf")
        ? await extractPdfText(file)
        : await file.text();
      applyTranscript(text);
    } catch {
      setMessage({
        tone: "warn",
        text: "Could not read that file. You can add your courses with Search instead.",
      });
    } finally {
      setBusy(false);
    }
  }

  function applyTranscript(text: string) {
    const parsed = parseTranscript(text);
    if (!parsed.rows.length) {
      setMessage({
        tone: "warn",
        text: "No course rows found. Check that this is a UATX transcript, or add courses by search.",
      });
      return;
    }
    onReplace(
      parsed.rows.map(({ code, title, credits, term, status, grade }) => ({
        code,
        title,
        credits,
        term,
        status,
        grade,
      })),
      { csa: parsed.cumulativeCsa },
    );
    const completed = parsed.rows.filter((r) => r.status === "completed").length;
    const pending = parsed.rows.filter((r) => isPending(r.status)).length;
    const notCounting = parsed.rows.length - completed - pending;
    setMessage({
      tone: parsed.warnings.length ? "warn" : "ok",
      text:
        `Read ${parsed.rows.length} courses: ${completed} completed, ${pending} in progress` +
        (notCounting > 0 ? `, ${notCounting} not counting` : "") +
        (parsed.reportedEarnedCredits !== undefined ? `, ${parsed.reportedEarnedCredits} earned credits.` : ".") +
        (parsed.warnings.length ? ` ${parsed.warnings.join(" ")}` : ""),
    });
  }

  return (
    <div className="panel">
      <div className="panel-body">
        <p className="eyebrow">Your record</p>
        <div className="mode-tabs" role="tablist" aria-label="How to add courses">
          {(["upload", "search"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              className="btn"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setMessage(null);
              }}
            >
              {m === "upload" ? "Upload transcript" : "Search"}
            </button>
          ))}
        </div>

        <div style={{ marginTop: "0.8rem" }}>
          {mode === "upload" && (
            <div
              className={`dropzone${dragging ? " is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
            >
              <p style={{ margin: "0 0 0.6rem" }}>
                {busy ? "Reading your transcript…" : "Drop your UATX transcript PDF here"}
              </p>
              <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={busy}>
                Choose a file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,text/plain,application/pdf"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
              <p style={{ margin: "0.7rem 0 0", fontSize: "0.76rem" }}>
                Read in your browser. Nothing is uploaded anywhere.
              </p>
              <TranscriptHint />
            </div>
          )}

          {mode === "search" && (
            <div>
              <label htmlFor="course-search" style={{ display: "block", marginBottom: "0.35rem" }}>
                Search the 2026-2027 catalog and the old one.
              </label>
              <p className="group-note" style={{ margin: "0 0 0.5rem" }}>
                Add a course you have taken, or waive one you have been excused from.
              </p>
              <input
                id="course-search"
                className="search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="MATH 210, or “linear algebra”"
                autoComplete="off"
              />
              {results.length > 0 && (
                <ul className="results">
                  {results.map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        className="result-btn"
                        onClick={() => {
                          onAdd({ code: c.code, title: c.title, credits: c.credits, status: "completed" });
                          setQuery("");
                        }}
                      >
                        <span className="mono">{c.code}</span> {c.title}{" "}
                        <span style={{ color: "var(--slate-light)" }}>
                          {c.credits} cr{c.catalog === "legacy" ? " · old catalog" : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-quiet waive-btn"
                        title={`Waive ${c.code}. It stops being required and earns no credit.`}
                        onClick={() => {
                          onAdd({ code: c.code, title: c.title, credits: c.credits, status: "waived" });
                          setQuery("");
                        }}
                      >
                        Waive
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim().length >= 2 && results.length === 0 && (
                <p style={{ color: "var(--slate)", fontSize: "0.8rem" }}>No matching course.</p>
              )}
            </div>
          )}
        </div>

        {message && (
          <p className={`note${message.tone === "warn" ? " note-warn" : ""}`} style={{ marginTop: "0.8rem" }} role="status">
            {message.text}
          </p>
        )}

        <RecordList taken={taken} onRemove={onRemove} onToggleStatus={onToggleStatus} />

        {taken.length > 0 && (
          <div className="btn-row" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn btn-quiet" onClick={() => onReplace([])}>
              Remove all courses
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_DISPLAY: Record<CourseStatus, { label: string; className: string }> = {
  completed: { label: "Done", className: "" },
  "in-progress": { label: "In progress", className: " mark-progress" },
  incomplete: { label: "Incomplete", className: " mark-progress" },
  failed: { label: "Failed", className: " mark-failed" },
  withdrawn: { label: "Withdrawn", className: " mark-neutral" },
  audit: { label: "Audited", className: " mark-neutral" },
  waived: { label: "Waived", className: " mark-waived" },
};

function RecordList({
  taken,
  onRemove,
  onToggleStatus,
}: {
  taken: TakenCourse[];
  onRemove: (i: number) => void;
  onToggleStatus: (i: number) => void;
}) {
  if (!taken.length) return null;

  const groups = new Map<string, { course: TakenCourse; index: number }[]>();
  taken.forEach((course, index) => {
    const key = course.term ?? "Courses";
    const list = groups.get(key) ?? [];
    list.push({ course, index });
    groups.set(key, list);
  });

  const totalEarned = taken
    .filter((t) => t.status === "completed")
    .reduce((n, t) => n + (t.credits ?? getCourse(t.code)?.credits ?? 3), 0);
  const waived = taken.filter((t) => t.status === "waived").length;
  const notCounting = taken.filter(
    (t) => t.status !== "completed" && t.status !== "waived" && !isPending(t.status),
  ).length;

  return (
    <div style={{ marginTop: "1.4rem" }}>
      <p className="eyebrow" style={{ marginBottom: "0.2rem" }}>
        {taken.length} courses · {totalEarned} credits earned
        {waived > 0 ? ` · ${waived} waived` : ""}
        {notCounting > 0 ? ` · ${notCounting} not counting` : ""}
      </p>
      {[...groups.entries()].map(([term, rows]) => (
        <div className="term-group" key={term}>
          <p className="eyebrow">{term}</p>
          <ul className="record">
            {rows.map(({ course, index }) => (
              <li key={`${course.code}-${index}`}>
                <div>
                  <span className="mono code">{course.code}</span>
                  <span className="name">{course.title ?? getCourse(course.code)?.title ?? ""}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <button
                    type="button"
                    className={`mark${STATUS_DISPLAY[course.status].className}`}
                    style={{ cursor: "pointer", background: "none" }}
                    onClick={() => onToggleStatus(index)}
                    title={
                      course.grade
                        ? `Grade ${course.grade}. Click to change how this counts.`
                        : "Click to cycle: done, in progress, failed, waived"
                    }
                  >
                    {STATUS_DISPLAY[course.status].label}
                    {course.grade && course.grade !== "IP" ? ` ${course.grade}` : ""}
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => onRemove(index)}
                    aria-label={`Remove ${course.code}`}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Where the file comes from. Populi buries the export five clicks deep, and
 * the path is the one thing a first-time visitor is missing, so it opens on
 * hover; the button underneath keeps it reachable by keyboard and by touch,
 * where hover never happens.
 */
const POPULI_PATH = ["My Profile", "Student", "Transcript", "Transcript Actions", "Export Transcript"];

function TranscriptHint() {
  const [pinned, setPinned] = useState(false);

  return (
    <div className={`hint${pinned ? " is-pinned" : ""}`}>
      <button
        type="button"
        className="hint-trigger"
        aria-expanded={pinned}
        onClick={() => setPinned((open) => !open)}
      >
        Where do I find it?
      </button>
      <div className="hint-bubble" role="note">
        <span className="hint-title">In Populi</span>
        <ol className="hint-steps">
          {POPULI_PATH.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
