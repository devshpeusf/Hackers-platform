"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import clsx from "@/lib/clsx";
import { BODY_MAX, SUBJECT_MAX } from "@/lib/broadcast-format";
import { previewAction, sendBroadcastAction, sendTestAction, type EmailActionState } from "./actions";

type AudienceOption = { key: string; label: string; description: string; count: number };

const idle: EmailActionState = { status: "idle" };

/**
 * Compose an announcement. Preview and "send test to me" are free to use;
 * Send asks once more with the exact number of people, since there's no
 * unsend.
 */
export default function Composer({ audiences }: { audiences: AudienceOption[] }) {
  const [audience, setAudience] = useState(audiences[0]?.key ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [preview, runPreview, previewing] = useActionState(previewAction, idle);
  const [test, runTest, testing] = useActionState(sendTestAction, idle);
  const [sent, runSend, sending] = useActionState(sendBroadcastAction, idle);

  const selected = audiences.find((a) => a.key === audience);

  // A successful send clears the form so it can't be sent twice by accident.
  useEffect(() => {
    if (sent.status === "ok") {
      setSubject("");
      setBody("");
      setConfirming(false);
    }
  }, [sent]);

  const busy = previewing || testing || sending;

  return (
    <form ref={formRef} className="flex flex-col gap-7" onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-col gap-3">
        <label htmlFor="broadcast-audience" className="card-label text-text-muted">
          1 · WHO GETS IT
        </label>
        <div className="relative max-w-[520px]">
          <select
            id="broadcast-audience"
            name="audience"
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value);
              setConfirming(false);
            }}
            className="field w-full cursor-pointer appearance-none px-4 py-3 pr-10 font-body card-text text-text-primary focus-visible:outline-2 focus-visible:outline-accent-pink"
          >
            {audiences.map((a) => (
              <option key={a.key} value={a.key} className="bg-surface-card text-text-primary">
                {a.label} ({a.count})
              </option>
            ))}
          </select>
          {/* Native arrow hidden (appearance-none) so it matches the theme. */}
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
        {selected && (
          <p className="card-meta text-text-dim">
            {selected.description}{" "}
            <span className="tabular-nums text-text-secondary">
              {selected.count} {selected.count === 1 ? "person" : "people"} right now.
            </span>
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 card-label text-text-muted">2 · THE MESSAGE</legend>
        <label htmlFor="broadcast-subject" className="card-meta text-text-muted">
          Subject
        </label>
        <input
          id="broadcast-subject"
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={SUBJECT_MAX}
          placeholder="Parking is set for Saturday"
          className="field px-4 py-3 font-body card-text text-text-primary placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent-pink"
        />
        <label htmlFor="broadcast-body" className="mt-2 card-meta text-text-muted">
          Message <span className="text-text-dim">· it starts with “Hi [first name],” automatically</span>
        </label>
        <textarea
          id="broadcast-body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={10}
          placeholder={"Quick update before the weekend:\n\n- Park in **Lot 18**\n- Check-in opens at **8:30am**\n\nSee you there!"}
          className="field resize-y px-4 py-3 font-body card-text leading-[1.7] text-text-primary placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent-pink"
        />
        <p className="card-meta text-text-dim">
          Formatting: <code className="text-text-secondary">**bold**</code> · a line starting with{" "}
          <code className="text-text-secondary">- </code> becomes a bullet · links become clickable · a blank line starts a new
          paragraph. <span className="tabular-nums">{body.length}/{BODY_MAX}</span>
        </p>
      </fieldset>

      <div className="flex flex-col gap-3">
        <span className="card-label text-text-muted">3 · CHECK IT, THEN SEND</span>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => formRef.current && runPreview(new FormData(formRef.current))}
            className="pixel-btn-outline bg-surface-bg px-4 py-2.5 font-body text-[12px] font-bold tracking-wide text-text-primary disabled:opacity-50"
          >
            {previewing ? "RENDERING…" : "PREVIEW"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => formRef.current && runTest(new FormData(formRef.current))}
            className="pixel-btn-outline bg-surface-bg px-4 py-2.5 font-body text-[12px] font-bold tracking-wide text-text-primary disabled:opacity-50"
          >
            {testing ? "SENDING…" : "SEND TEST TO ME"}
          </button>
          {!confirming ? (
            <button
              type="button"
              disabled={busy || !selected || selected.count === 0}
              onClick={() => setConfirming(true)}
              className="pixel-btn-solid px-[22px] py-2.5 font-body text-[12px] font-bold tracking-wide text-surface-bg disabled:opacity-50"
            >
              SEND TO {selected?.count ?? 0}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3 border-l-[3px] border-accent-amber bg-accent-amber/6 px-3.5 py-2.5">
              <span className="card-meta text-text-secondary">
                Send to <strong className="text-text-primary">{selected?.count} people</strong> in “{selected?.label}”? There&apos;s no
                unsend.
              </span>
              <button
                type="button"
                disabled={sending}
                onClick={() => formRef.current && runSend(new FormData(formRef.current))}
                className="pixel-btn-solid px-4 py-2 font-body text-[12px] font-bold tracking-wide text-surface-bg disabled:opacity-50"
              >
                {sending ? "QUEUEING…" : "YES, SEND"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="card-meta text-text-muted hover:text-text-primary">
                Cancel
              </button>
            </div>
          )}
        </div>

        {[preview, test, sent].map((s, i) =>
          s.status === "ok" || s.status === "error" ? (
            <p key={i} role={s.status === "error" ? "alert" : "status"} className={clsx("card-meta", s.status === "error" ? "text-terminal-red" : "text-accent-teal")}>
              {s.message}
            </p>
          ) : null,
        )}
      </div>

      {preview.status === "preview" && (
        <div className="flex flex-col gap-2">
          <span className="card-label text-text-muted">PREVIEW · ADDRESSED TO YOU</span>
          {/* sandboxed: the rendered email can't run anything here */}
          <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[620px] w-full max-w-[640px] border-2 border-border-default bg-white" />
        </div>
      )}
    </form>
  );
}
