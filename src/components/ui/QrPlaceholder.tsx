/**
 * Fake QR code — drawn entirely with CSS gradients + nested finder-pattern
 * squares, no data encoded. Visual placeholder only; a real QR library
 * (e.g. rendering the pass ID) comes later once check-in exists.
 */
export default function QrPlaceholder() {
  return (
    <div className="h-[188px] w-[188px] shrink-0 bg-text-primary p-3">
      <div
        className="relative h-[164px] w-[164px] opacity-85 [background-blend-mode:multiply]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, #07060d 0 6px, transparent 6px 13px), repeating-linear-gradient(90deg, #07060d 0 6px, transparent 6px 17px)",
        }}
      >
        <FinderPattern className="top-0 left-0" />
        <FinderPattern className="top-0 right-0" />
        <FinderPattern className="bottom-0 left-0" />
      </div>
    </div>
  );
}

function FinderPattern({ className }: { className: string }) {
  return (
    <div className={`absolute h-12 w-12 bg-text-primary ${className}`}>
      <div className="absolute inset-0 bg-surface-bg">
        <div className="absolute inset-[7px] bg-text-primary">
          <div className="absolute inset-[7px] bg-surface-bg" />
        </div>
      </div>
    </div>
  );
}
