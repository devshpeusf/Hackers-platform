"use client";

import { useRef, useState } from "react";

/**
 * The organizer email as selectable text plus a Copy button. A mailto: link
 * alone does nothing for anyone without a mail app set up, so the address is
 * always visible and copyable.
 */
export default function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (older browser, permissions): select the text so
      // Ctrl/Cmd+C still works.
      const node = textRef.current;
      if (!node) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span ref={textRef} className="card-text select-all break-all font-bold text-text-primary">
        {email}
      </span>
      <button
        type="button"
        onClick={copy}
        className="pixel-btn-outline bg-surface-bg px-3.5 py-2 font-body text-[11px] font-bold tracking-wide text-text-primary"
      >
        {copied ? "COPIED ✓" : "COPY"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Email address copied" : ""}
      </span>
    </div>
  );
}
