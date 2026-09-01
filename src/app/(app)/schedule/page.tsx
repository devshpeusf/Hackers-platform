import PageHeading from "@/components/ui/PageHeading";
import TerminalWindow from "@/components/ui/TerminalWindow";
import { scheduleItems } from "@/lib/placeholder-data";

export default function SchedulePage() {
  return (
    <div>
      <PageHeading title="SCHEDULE" />

      <TerminalWindow filename="RUN-OF-SHOW.LOG" className="max-w-[700px]">
        <div className="px-6 pt-2.5 pb-5.5">
          {scheduleItems.map((row, i) => (
            <div
              key={row.time}
              className={
                "flex items-center gap-4.5 py-3" +
                (i < scheduleItems.length - 1 ? " border-b border-text-primary/7" : "")
              }
            >
              <span
                className={
                  "w-[78px] shrink-0 font-pixel text-[9px] " +
                  (row.highlighted ? "text-accent-teal" : "text-text-dim")
                }
              >
                {row.time}
              </span>
              <span className={"text-[13px] " + (row.highlighted ? "text-text-primary" : "text-text-secondary")}>
                {row.label}
              </span>
            </div>
          ))}
        </div>
      </TerminalWindow>
    </div>
  );
}
