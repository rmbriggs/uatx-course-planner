"use client";

import { useMemo, useRef, useState } from "react";
import { allCourses, getCourse } from "@/lib/catalog";
import { extractPdfText } from "@/lib/pdf";
import { parseCodeList, parseTranscript } from "@/lib/transcript";
import type { TakenCourse } from "@/lib/types";

type Mode = "upload" | "paste" | "search";

interface Props {
  taken: TakenCourse[];
  onReplace: (courses: TakenCourse[]) => void;
  onAdd: (course: TakenCourse) => void;
  onRemove: (index: number) => void;
  onToggleStatus: (index: number) => void;
}

export function RecordPanel({ taken, onReplace, onAdd, onRemove, onToggleStatus }: Props) {
  const [mode, setMode] = useState<Mode>("upload");
  const [query, setQuery] = useState("");
  const [pasted, setPasted] = useState("");
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
        text: "Could not read that file. Open the PDF, copy the text, and paste it instead.",
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
    onReplace(parsed.rows.map(({ code, title, credits, term, status }) => ({ code, title, credits, term, status })));
    const completed = parsed.rows.filter((r) => r.status === "completed").length;
    const pending = parsed.rows.length - completed;
    setMessage({
      tone: parsed.warnings.length ? "warn" : "ok",
      text:
        `Read ${parsed.rows.length} courses (${completed} completed, ${pending} in progress)` +
        (parsed.reportedEarnedCredits !== undefined
          ? `, ${parsed.reportedEarnedCredits} earned credits.`
          : ".") +
        (parsed.warnings.length ? ` ${parsed.warnings.join(" ")}` : ""),
    });
  }

  return (
    <div className="panel">
      <div className="panel-body">
        <p className="eyebrow">Your record</p>
        <div className="btn-row" role="tablist" aria-label="How to add courses">
          {(["upload", "paste", "search"] as Mode[]).map((m) => (
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
              {m === "upload" ? "Upload transcript" : m === "paste" ? "Paste" : "Search"}
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
            </div>
          )}

          {mode === "paste" && (
            <div>
              <label htmlFor="paste-box" style={{ display: "block", marginBottom: "0.35rem" }}>
                Paste transcript text, or a list of course codes.
              </label>
              <textarea
                id="paste-box"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"INF 1100, ALT 1010, STM 2102\n\n…or the full text copied out of your transcript."}
              />
              <div className="btn-row" style={{ marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const asTranscript = parseTranscript(pasted);
                    if (asTranscript.rows.length) {
                      applyTranscript(pasted);
                      return;
                    }
                    const codes = parseCodeList(pasted);
                    if (!codes.length) {
                      setMessage({ tone: "warn", text: "No course codes recognized in that text." });
                      return;
                    }
                    onReplace(codes);
                    setMessage({ tone: "ok", text: `Added ${codes.length} courses.` });
                  }}
                >
                  Read these courses
                </button>
                <button type="button" className="btn" onClick={() => setPasted("")}>
                  Clear
                </button>
              </div>
            </div>
          )}

          {mode === "search" && (
            <div>
              <label htmlFor="course-search" style={{ display: "block", marginBottom: "0.35rem" }}>
                Search the 2026-2027 catalog and the old one.
              </label>
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

  return (
    <div style={{ marginTop: "1.4rem" }}>
      <p className="eyebrow" style={{ marginBottom: "0.2rem" }}>
        {taken.length} courses · {totalEarned} credits earned
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
                    className={`mark${course.status === "in-progress" ? " mark-progress" : ""}`}
                    style={{ cursor: "pointer", background: "none" }}
                    onClick={() => onToggleStatus(index)}
                    title="Switch between completed and in progress"
                  >
                    {course.status === "in-progress" ? "In progress" : "Done"}
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
