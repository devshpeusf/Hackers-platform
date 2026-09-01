import type { ReactNode, CSSProperties } from "react";
import clsx from "@/lib/clsx";

type PixelChipProps = {
  children: ReactNode;
  /** Border accent color. Also used for text unless `textColor` is given. */
  color?: string;
  /** Text color, when it differs from the border (e.g. the team invite chip). */
  textColor?: string;
  className?: string;
};

/** Small pixel-font label chip, e.g. "HACKJAM '26" or "INVITE HJ26-7F3K". */
export default function PixelChip({ children, color, textColor, className }: PixelChipProps) {
  const style = color
    ? ({ "--chip-border": color, color: textColor ?? color } as CSSProperties)
    : undefined;

  return (
    <span
      className={clsx(
        "pixel-chip inline-block bg-surface-bg px-[10px] pt-[6px] pb-[5px] font-pixel text-[8px] tracking-widest",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}
