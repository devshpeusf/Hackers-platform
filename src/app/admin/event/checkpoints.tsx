import { CHECKPOINT_NAME_MAX } from "@/lib/scan-rules";
import { addCheckpoint, deleteCheckpoint, renameCheckpoint } from "./actions";

/**
 * The meals and workshops the scanner can scan for. A Server Component with
 * plain forms: rename and delete per row, add at the bottom. Check-in isn't
 * listed: it always exists.
 */

type Row = { id: string; name: string; kind: "MEAL" | "WORKSHOP"; count: number };

const INPUT =
  "field min-w-0 flex-1 px-3 py-2.5 font-body text-[13px] text-text-primary focus-visible:outline-2 focus-visible:outline-accent-pink";
const BUTTON =
  "pixel-btn-outline shrink-0 bg-surface-bg px-4 py-2.5 font-body text-[12px] font-bold tracking-wide text-text-primary";

export default function Checkpoints({ rows }: { rows: Row[] }) {
  return (
    <div className="flex flex-col gap-6">
      {(["MEAL", "WORKSHOP"] as const).map((kind) => {
        const list = rows.filter((r) => r.kind === kind);
        return (
          <section key={kind}>
            <h3 className="mb-3 font-pixel text-[10px] tracking-widest text-accent-teal">
              {kind === "MEAL" ? "MEALS" : "WORKSHOPS"}
            </h3>
            {list.length === 0 && <p className="mb-3 text-[13px] text-text-dim">None yet.</p>}
            <ul className="flex flex-col gap-3">
              {list.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2.5">
                  <form action={renameCheckpoint} className="flex min-w-0 flex-1 gap-2.5">
                    <input type="hidden" name="id" value={row.id} />
                    <input
                      name="name"
                      defaultValue={row.name}
                      required
                      maxLength={CHECKPOINT_NAME_MAX}
                      aria-label={`Rename ${row.name}`}
                      className={INPUT}
                    />
                    <button type="submit" className={BUTTON}>
                      RENAME
                    </button>
                  </form>
                  <span className="w-[86px] text-right text-[12px] tabular-nums text-text-muted">
                    {row.count} scanned
                  </span>
                  {row.count === 0 ? (
                    <form action={deleteCheckpoint}>
                      <input type="hidden" name="id" value={row.id} />
                      <button type="submit" className={BUTTON}>
                        DELETE
                      </button>
                    </form>
                  ) : (
                    // Keeps the rows lined up; scanned ones can't be deleted.
                    <span className="w-[76px]" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <form action={addCheckpoint} className="flex flex-wrap gap-2.5 border-t border-text-primary/8 pt-6">
        <select name="kind" defaultValue="MEAL" aria-label="Type" className={INPUT + " max-w-[150px] cursor-pointer"}>
          <option value="MEAL" className="bg-surface-card">Meal</option>
          <option value="WORKSHOP" className="bg-surface-card">Workshop</option>
        </select>
        <input
          name="name"
          required
          maxLength={CHECKPOINT_NAME_MAX}
          placeholder="e.g. Saturday lunch"
          aria-label="Name"
          className={INPUT}
        />
        <button
          type="submit"
          className="pixel-btn-solid shrink-0 px-5 py-2.5 font-body text-[12px] font-bold tracking-wide text-surface-bg"
        >
          ADD
        </button>
      </form>
    </div>
  );
}
