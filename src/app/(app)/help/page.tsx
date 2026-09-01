import PageHeading from "@/components/ui/PageHeading";
import TerminalWindow from "@/components/ui/TerminalWindow";
import Field from "@/components/ui/Field";
import PixelButton from "@/components/ui/PixelButton";

function ChevronDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-text-dim)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function HelpPage() {
  return (
    <div>
      <PageHeading title="HELP / REPORT AN ISSUE" />

      <TerminalWindow filename="NEW-REPORT.LOG" className="max-w-[640px]">
        <div className="flex flex-col gap-4.5 px-6.5 py-6">
          <Field label="Category" placeholder="Select a category..." rightIcon={<ChevronDown />} />
          <Field label="Title" placeholder="A brief, descriptive title..." />
          <Field label="Description" placeholder="Please provide as much detail as possible..." multiline />
          <Field label="Contact" optional placeholder="Discord handle or email..." />
          <PixelButton className="mt-1.5 self-start px-[22px] py-3 text-[11px]">SUBMIT REPORT</PixelButton>
        </div>
      </TerminalWindow>

      <div className="mt-4.5 max-w-[640px] text-xs text-text-dim">
        For urgent issues during the event, message an organizer directly in <a href="#">Discord</a>.
      </div>
    </div>
  );
}
