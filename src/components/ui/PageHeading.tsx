import clsx from "@/lib/clsx";

type PageHeadingProps = {
  title: string;
  className?: string;
};

/** Pixel-font page title plus the three-dot teal divider under it. */
export default function PageHeading({ title, className }: PageHeadingProps) {
  return (
    <div className={clsx("mb-8", className)}>
      <h1 className="font-pixel text-[22px] text-text-primary">{title}</h1>
      <div className="mt-5 flex items-center gap-2">
        <span className="h-1 w-1 bg-accent-teal opacity-50" />
        <span className="h-1.5 w-1.5 bg-accent-teal" />
        <span className="h-1 w-1 bg-accent-teal opacity-50" />
      </div>
    </div>
  );
}
