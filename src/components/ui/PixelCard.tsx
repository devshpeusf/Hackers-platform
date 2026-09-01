import type { ReactNode, CSSProperties } from "react";
import clsx from "@/lib/clsx";

type PixelCardProps = {
  children: ReactNode;
  /** Accent color for the offset border. Defaults to the theme's default border color. */
  borderColor?: string;
  /** Adds the hover lift used on clickable dashboard tiles. */
  clickable?: boolean;
  className?: string;
  onClick?: () => void;
};

/**
 * The chunky offset-shadow card used throughout the app. Border color is
 * driven by the --pc-border CSS custom property (see .pixel-card in
 * globals.css) so each instance can pick its own accent without a new
 * class per color.
 */
export default function PixelCard({
  children,
  borderColor,
  clickable = false,
  className,
  onClick,
}: PixelCardProps) {
  const style = borderColor ? ({ "--pc-border": borderColor } as CSSProperties) : undefined;

  return (
    <div
      className={clsx("pixel-card", clickable && "clickable cursor-pointer", className)}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
