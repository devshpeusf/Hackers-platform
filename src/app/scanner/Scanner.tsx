"use client";

import { useEffect, useRef, useState } from "react";
import PixelButton from "@/components/ui/PixelButton";
import PixelCard from "@/components/ui/PixelCard";
import { createQrDetector } from "@/lib/scanner-detector";
import { lookupScannerBadge } from "@/lib/scanner-lookup";
import { requestScannerCamera, ScannerSession, type ScannerState } from "@/lib/scanner-session";
import InstallHelp from "./InstallHelp";

const cameraMessages = {
  permission: "Camera permission is required. Allow camera access in your browser settings, then retry.",
  missing: "No camera was found. Connect a camera or use a phone with a camera.",
  busy: "The camera could not start. Close other apps using it, then retry.",
  unsupported: "Camera access is unavailable in this browser. Open this page in Safari or Chrome.",
  insecure: "A secure HTTPS connection is required for camera access on your phone.",
  decoder: "The scanner could not load. Check your connection, then retry.",
};

/** Token-free, accessible result presentation, also rendered by the Node tests. */
export function ScannerStatus({ state, onStart, onNext, onRetry }: {
  state: ScannerState; onStart: () => void; onNext: () => void; onRetry: () => void;
}) {
  let title = "READY TO SCAN";
  let detail = "Start your camera, then hold one attendee badge in view.";
  let color = "var(--color-accent-purple-light)";
  switch (state.kind) {
    case "starting": title = "STARTING CAMERA"; detail = "Allow camera access when your browser asks."; break;
    case "scanning": title = "HOLD BADGE IN VIEW"; detail = "Keep the QR code steady and well lit."; break;
    case "rearming": title = "GET READY"; detail = "Move the previous badge away, then show the next one."; break;
    case "verifying": title = "VERIFYING BADGE"; detail = "Please wait…"; break;
    case "found": title = "✓ BADGE FOUND"; detail = ""; color = "var(--color-accent-teal)"; break;
    case "not-found": title = "✕ BADGE NOT FOUND"; detail = "Ask the attendee to check their badge with an organizer."; color = "var(--color-accent-amber)"; break;
    case "verify-error": title = "UNABLE TO VERIFY BADGE"; detail = "Check your connection and try again."; color = "var(--color-accent-amber)"; break;
    case "access-error": title = state.signedOut ? "SIGN IN REQUIRED" : "STAFF ACCESS REQUIRED"; detail = "Camera stopped."; color = "var(--color-accent-amber)"; break;
    case "camera-error": title = "CAMERA / SCANNER UNAVAILABLE"; detail = cameraMessages[state.problem]; color = "var(--color-accent-amber)"; break;
  }
  const buttonClass = "min-h-14 w-full px-5 py-4 text-base focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-accent-teal";
  return (
    <PixelCard borderColor={color} className="p-5 sm:p-7">
      <div role="status" aria-live="polite" aria-atomic="true" className="min-h-28">
        <h2 className="font-pixel text-sm leading-loose" style={{ color }}>{title}</h2>
        {state.kind === "found" && <p className="mt-4 break-words text-3xl font-bold leading-tight text-text-primary sm:text-4xl">{state.name}</p>}
        {detail && <p className="mt-3 text-sm leading-relaxed text-text-secondary">{detail}</p>}
      </div>
      <div className="mt-5 flex flex-col gap-5">
        {(state.kind === "idle" || state.kind === "camera-error") && <PixelButton className={buttonClass} onClick={onStart}>{state.kind === "idle" ? "START CAMERA" : "RETRY CAMERA"}</PixelButton>}
        {state.kind === "verify-error" && <PixelButton className={buttonClass} onClick={onRetry}>TRY AGAIN</PixelButton>}
        {["found", "not-found", "verify-error"].includes(state.kind) && <PixelButton className={buttonClass} onClick={onNext}>SCAN NEXT</PixelButton>}
        {state.kind === "access-error" && state.signedOut && <a className="pixel-btn-solid block px-5 py-4 text-center font-bold text-surface-bg" href="/auth/signin?next=/scanner">SIGN IN</a>}
      </div>
    </PixelCard>
  );
}

export default function Scanner() {
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<ScannerSession | null>(null);
  const [state, setState] = useState<ScannerState>({ kind: "idle" });

  useEffect(() => {
    if (!video.current) return;
    const current = new ScannerSession(video.current, {
      requestCamera: requestScannerCamera,
      createDetector: () => createQrDetector(),
      lookup: lookupScannerBadge,
      schedule: (callback, delay) => window.setTimeout(callback, delay),
      cancel: (timer) => window.clearTimeout(timer as number),
      now: () => performance.now(),
    }, setState);
    session.current = current;
    const inactive = () => { if (document.hidden) current.stop(); };
    const pageHide = () => current.stop();
    document.addEventListener("visibilitychange", inactive);
    window.addEventListener("pagehide", pageHide);
    return () => {
      document.removeEventListener("visibilitychange", inactive);
      window.removeEventListener("pagehide", pageHide);
      current.dispose();
      session.current = null;
    };
  }, []);

  const active = !["idle", "camera-error", "access-error"].includes(state.kind);
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:py-12">
      <h1 className="font-pixel text-xl leading-loose text-text-primary">SCANNER</h1>
      <p className="mt-2 mb-7 text-sm text-text-muted">Online badge verification</p>
      <div className="relative mb-7 overflow-hidden rounded-xl border-2 border-border-default bg-surface-sidebar">
        <video ref={video} muted playsInline autoPlay aria-hidden="true" className="aspect-[4/3] w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[15%] rounded-xl border-2 border-accent-teal/70" />
        {!active && <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-bg/80 text-sm text-text-muted">CAMERA OFF</div>}
      </div>
      <ScannerStatus state={state} onStart={() => { void session.current?.start(); }} onNext={() => session.current?.scanNext()} onRetry={() => session.current?.retryLookup()} />
      {active && <button type="button" onClick={() => session.current?.stop()} className="mt-7 min-h-12 w-full px-5 py-3 text-sm font-bold text-text-secondary underline focus-visible:outline-2 focus-visible:outline-accent-teal">STOP CAMERA</button>}
      <InstallHelp />
    </main>
  );
}
