/**
 * Bits shared between the server-rendered landing (/apply) and the client
 * wizard (/apply/form). No "use client" — these are plain presentational
 * pieces, so both sides can import them.
 */

/** The pixel starfield + nebula wash, lifted from globals.css's body rule. */
export const STARFIELD =
  "bg-surface-bg bg-[radial-gradient(2px_2px_at_8%_15%,#f4f1fb,transparent),radial-gradient(2px_2px_at_22%_62%,#f4f1fb,transparent),radial-gradient(1.5px_1.5px_at_40%_22%,#f4f1fb,transparent),radial-gradient(2px_2px_at_65%_74%,#f4f1fb,transparent),radial-gradient(1.5px_1.5px_at_80%_18%,#f4f1fb,transparent),radial-gradient(2px_2px_at_92%_58%,#f4f1fb,transparent),radial-gradient(1.5px_1.5px_at_55%_8%,#f4f1fb,transparent),radial-gradient(1.5px_1.5px_at_30%_90%,#f4f1fb,transparent),radial-gradient(900px_700px_at_12%_0%,rgba(91,47,143,0.3),transparent_60%),radial-gradient(800px_650px_at_92%_88%,rgba(156,47,125,0.24),transparent_60%)]";

/** The three-dot teal divider used under every page heading. */
export function Dots() {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1 w-1 bg-accent-teal opacity-50" />
      <span className="h-1.5 w-1.5 bg-accent-teal" />
      <span className="h-1 w-1 bg-accent-teal opacity-50" />
    </div>
  );
}
