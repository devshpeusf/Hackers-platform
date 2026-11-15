"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import jsQR from "jsqr";
import clsx from "@/lib/clsx";
import PixelCard from "@/components/ui/PixelCard";
import { BLOCK_COPY, WARNING_COPY } from "@/lib/scan-rules";
import type { CheckpointSummary, HackerMatch, ScanResult } from "@/lib/check-in";
import { overviewAction, scanApplicationAction, scanBadgeAction, searchHackersAction } from "./actions";

/**
 * The badge scanner: pick what you're scanning for, point the phone camera at
 * a badge, read the result, tap SCAN NEXT. Name search covers a dead phone or
 * a QR that won't read.
 *
 * QR decoding is jsQR on frames drawn to a canvas, rather than the browser's
 * BarcodeDetector, because iPhone Safari doesn't have BarcodeDetector. The
 * camera pauses while a result is on screen, so one badge held up is one
 * scan, not one per frame.
 */

type Overview = { eventName: string; checkedIn: number; admitted: number; checkpoints: CheckpointSummary[] };

const MODE_KEY = "check-in-mode";
const SCAN_EVERY_MS = 200;
const MAX_FRAME_WIDTH = 640;

export default function Scanner({ initial }: { initial: Overview }) {
  const [overview, setOverview] = useState(initial);
  const [mode, setMode] = useState("CHECK_IN");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Remember the mode per device: the lunch table stays on lunch after a reload.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved && (saved === "CHECK_IN" || initial.checkpoints.some((c) => c.id === saved))) setMode(saved);
    } catch {}
  }, [initial.checkpoints]);

  const chooseMode = (value: string) => {
    setMode(value);
    setResult(null);
    try {
      localStorage.setItem(MODE_KEY, value);
    } catch {}
  };

  const selected = overview.checkpoints.find((c) => c.id === mode) ?? null;
  const modeLabel = selected ? selected.name : "Check-in";

  const finish = useCallback((next: ScanResult) => {
    setResult(next);
    try {
      navigator.vibrate?.(next.outcome === "ok" ? 60 : [80, 60, 80]);
    } catch {}
    void overviewAction().then((fresh) => fresh && setOverview(fresh));
  }, []);

  const onBadge = useCallback(
    (text: string) => startTransition(async () => finish(await scanBadgeAction(mode, text))),
    [mode, finish],
  );
  const onPick = (applicationId: string) =>
    startTransition(async () => finish(await scanApplicationAction(mode, applicationId)));

  return (
    <div className="flex flex-col gap-6">
      <PixelCard className="card-pad">
        <label htmlFor="scan-mode" className="card-label text-text-muted">
          SCANNING FOR
        </label>
        <div className="relative mt-3">
          <select
            id="scan-mode"
            value={mode}
            onChange={(e) => chooseMode(e.target.value)}
            className="field w-full cursor-pointer appearance-none px-4 py-3 pr-10 font-body card-text font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-accent-pink"
          >
            <option value="CHECK_IN" className="bg-surface-card">
              Check-in ({overview.checkedIn} of {overview.admitted})
            </option>
            {(["MEAL", "WORKSHOP"] as const).map((kind) => {
              const list = overview.checkpoints.filter((c) => c.kind === kind);
              if (!list.length) return null;
              return (
                <optgroup key={kind} label={kind === "MEAL" ? "Meals" : "Workshops"} className="bg-surface-card">
                  {list.map((c) => (
                    <option key={c.id} value={c.id} className="bg-surface-card">
                      {c.name} ({c.count})
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-dim)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        {overview.checkpoints.length === 0 && (
          <p className="mt-3 card-meta text-text-dim">No meals or workshops yet. Organizers add them on the event page.</p>
        )}
      </PixelCard>

      {result ? (
        <ResultCard result={result} modeLabel={modeLabel} onNext={() => setResult(null)} />
      ) : (
        <Camera paused={pending} onRead={onBadge} />
      )}

      <NameSearch mode={mode} disabled={pending} onPick={onPick} />
    </div>
  );
}

function Camera({ paused, onRead }: { paused: boolean; onRead: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"off" | "starting" | "on" | "blocked">("off");
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const start = async () => {
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("on");
    } catch {
      setState("blocked");
    }
  };

  // Turn the camera off when this unmounts (a result is showing, or the page closed).
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  // Remember that the camera was allowed, so SCAN NEXT reopens it straight away.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("check-in-camera") === "on") void start();
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (state === "on") sessionStorage.setItem("check-in-camera", "on");
    } catch {}
  }, [state]);

  useEffect(() => {
    if (state !== "on") return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let done = false;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (done || pausedRef.current || !ctx || !video || video.readyState < 2 || !video.videoWidth) return;
      const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
      if (code?.data) {
        done = true;
        onReadRef.current(code.data);
      }
    }, SCAN_EVERY_MS);
    return () => {
      done = true;
      clearInterval(timer);
    };
  }, [state]);

  return (
    <PixelCard className="card-pad">
      <div className="relative aspect-square w-full overflow-hidden bg-surface-bg">
        <video ref={videoRef} playsInline muted className={clsx("h-full w-full object-cover", state !== "on" && "hidden")} />
        {state === "on" && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] border-2 border-accent-teal/70" />
        )}
        {state !== "on" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {state === "blocked" ? (
              <p className="card-text text-text-muted">
                Camera blocked. Allow camera access for this site in your browser settings, or use name search below.
              </p>
            ) : (
              <button
                type="button"
                onClick={start}
                disabled={state === "starting"}
                className="pixel-btn-solid px-6 py-3 font-body text-sm font-bold tracking-wide text-surface-bg disabled:opacity-50"
              >
                {state === "starting" ? "STARTING…" : "START CAMERA"}
              </button>
            )}
          </div>
        )}
        {paused && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-bg/70 card-text font-bold text-text-primary">
            Checking…
          </div>
        )}
      </div>
    </PixelCard>
  );
}

function ResultCard({ result, modeLabel, onNext }: { result: ScanResult; modeLabel: string; onNext: () => void }) {
  let color: string;
  let title: string;
  let lines: string[] = [];
  // Warnings (minor, no RSVP) don't block: they show in amber under a green result.
  let warnings: string[] = [];
  if (result.outcome === "error") {
    color = "var(--color-terminal-red)";
    title = "Something went wrong";
    lines = [result.message];
  } else if (result.outcome === "blocked") {
    color = "var(--color-terminal-red)";
    title = BLOCK_COPY[result.reason].title;
    lines = [BLOCK_COPY[result.reason].body];
    if (result.previous) {
      const at = new Date(result.previous.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      lines = [`Already scanned for ${modeLabel} at ${at} by ${result.previous.by}.`];
    }
  } else {
    color = "var(--color-terminal-green)";
    title = modeLabel === "Check-in" ? "Checked in" : `${modeLabel}: good to go`;
    warnings = result.warnings.map((w) => WARNING_COPY[w]);
  }
  const hacker = result.outcome === "error" ? null : result.hacker;

  return (
    <PixelCard borderColor={color} className="card-pad">
      <div role="status" aria-live="assertive">
        <div className="font-pixel text-base leading-[1.7] md:text-lg" style={{ color }}>
          {title.toUpperCase()}
        </div>
        {hacker && (
          <div className="mt-4">
            <div className="text-2xl font-bold break-words text-text-primary">{hacker.name}</div>
            <div className="card-meta text-text-muted">
              {hacker.discordUsername && `@${hacker.discordUsername} · `}
              {hacker.school}
            </div>
            {result.outcome !== "blocked" && hacker.diet !== null && (
              <div className="mt-3 card-text font-bold text-accent-amber">Diet: {hacker.diet || "no restrictions"}</div>
            )}
          </div>
        )}
        {lines.map((line) => (
          <p key={line} className="mt-3 card-text text-text-secondary">
            {line}
          </p>
        ))}
        {warnings.map((line) => (
          <p key={line} className="mt-3 border-l-[3px] border-accent-amber bg-accent-amber/6 px-3 py-2 card-text font-bold text-accent-amber">
            {line}
          </p>
        ))}
        <button
          type="button"
          onClick={onNext}
          autoFocus
          className="pixel-btn-solid mt-6 w-full px-6 py-4 font-body text-sm font-bold tracking-wide text-surface-bg"
        >
          SCAN NEXT
        </button>
      </div>
    </PixelCard>
  );
}

function NameSearch({ mode, disabled, onPick }: { mode: string; disabled: boolean; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  // Results remember which query they answer, so "no match" never shows
  // for a query that hasn't been searched yet.
  const [found, setFound] = useState<{ query: string; matches: HackerMatch[] }>({ query: "", matches: [] });
  const matches = query.trim().length >= 2 ? found.matches : [];
  const answered = found.query === query;

  useEffect(() => {
    if (query.trim().length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const list = await searchHackersAction(query);
      if (!stale) setFound({ query, matches: list });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <PixelCard className="card-pad">
      <label htmlFor="scan-search" className="card-label text-text-muted">
        NO QR? SEARCH BY NAME
      </label>
      <input
        id="scan-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name, Discord handle or email"
        autoComplete="off"
        className="field mt-3 w-full px-4 py-3 font-body card-text text-text-primary focus-visible:outline-2 focus-visible:outline-accent-pink"
      />
      {matches.length > 0 && (
        <ul className="mt-4 flex flex-col">
          {matches.map((m) => (
            <li key={m.applicationId} className="flex items-center justify-between gap-3 border-t border-text-primary/8 py-3">
              <div className="min-w-0">
                <div className="card-text font-bold break-words text-text-primary">{m.name}</div>
                <div className="card-meta text-text-muted">
                  {m.discordUsername && `@${m.discordUsername} · `}
                  {m.school}
                  {mode === "CHECK_IN" && m.checkedIn && " · checked in"}
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onPick(m.applicationId);
                  setQuery("");
                }}
                className="pixel-btn-outline shrink-0 bg-surface-bg px-4 py-2.5 font-body text-[12px] font-bold tracking-wide text-text-primary disabled:opacity-50"
              >
                {mode === "CHECK_IN" ? "CHECK IN" : "SCAN"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && answered && matches.length === 0 && (
        <p className="mt-3 card-meta text-text-dim">No admitted hacker matches that.</p>
      )}
    </PixelCard>
  );
}
