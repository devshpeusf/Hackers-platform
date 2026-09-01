import PageHeading from "@/components/ui/PageHeading";
import PixelCard from "@/components/ui/PixelCard";
import { guideCards } from "@/lib/placeholder-data";

export default function GuidePage() {
  return (
    <div>
      <PageHeading title="HACKER GUIDE" />

      <div className="grid max-w-[900px] grid-cols-1 gap-6 sm:grid-cols-2">
        <PixelCard borderColor="var(--color-accent-teal)" className="p-6">
          <span className="font-pixel text-[8px] tracking-wide text-accent-teal">{guideCards.venue.title}</span>
          <div className="mt-3.5 text-[13px] leading-[1.8]">
            {guideCards.venue.lines.map((line, i) => (
              <span key={line}>
                {line}
                {i < guideCards.venue.lines.length - 1 && <br />}
              </span>
            ))}
          </div>
        </PixelCard>

        <PixelCard borderColor="var(--color-accent-purple)" className="p-6">
          <span className="font-pixel text-[8px] tracking-wide text-accent-purple-light">{guideCards.wifi.title}</span>
          <div className="mt-3.5 text-[13px] leading-[1.8]">
            Network: <span className="text-accent-purple-light">{guideCards.wifi.network}</span>
            <br />
            Password: <span className="text-accent-purple-light">{guideCards.wifi.password}</span>
          </div>
        </PixelCard>

        <PixelCard borderColor="var(--color-accent-magenta)" className="p-6">
          <span className="font-pixel text-[8px] tracking-wide text-accent-pink-light">
            {guideCards.whatToBring.title}
          </span>
          <div className="mt-3.5 text-[13px] leading-[1.9]">
            {guideCards.whatToBring.items.map((item, i) => (
              <span key={item}>
                [ ] {item}
                {i < guideCards.whatToBring.items.length - 1 && <br />}
              </span>
            ))}
          </div>
        </PixelCard>

        <PixelCard borderColor="var(--color-accent-amber)" className="p-6">
          <span className="font-pixel text-[8px] tracking-wide text-accent-amber">
            {guideCards.codeOfConduct.title}
          </span>
          <div className="mt-3.5 text-[13px] leading-[1.8]">
            {guideCards.codeOfConduct.body}{" "}
            <a href="#">{guideCards.codeOfConduct.linkLabel}</a>.
          </div>
        </PixelCard>
      </div>
    </div>
  );
}
