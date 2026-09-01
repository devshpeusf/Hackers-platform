import PageHeading from "@/components/ui/PageHeading";
import PixelCard from "@/components/ui/PixelCard";
import PixelButton from "@/components/ui/PixelButton";
import Field from "@/components/ui/Field";
import { hacker } from "@/lib/placeholder-data";

type SectionProps = {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

function ProfileSection({ number, title, description, children }: SectionProps) {
  return (
    <div className="flex flex-col gap-9 px-6.5 py-7.5 sm:flex-row sm:gap-9">
      <div className="w-full shrink-0 sm:w-[200px]">
        <div className="mb-2 font-pixel text-[9px] text-accent-pink">{number}</div>
        <div className="mb-2 text-[13px] font-bold tracking-wide">{title}</div>
        <div className="text-xs leading-[1.6] text-text-muted">{description}</div>
      </div>
      <div className="flex flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div>
      <PageHeading title="PROFILE" />

      <PixelCard className="p-0">
        <div className="flex justify-end px-6.5 py-5">
          <PixelButton className="px-[22px] py-[11px] text-[11px]">SAVE PROFILE CHANGES</PixelButton>
        </div>
        <div className="h-px bg-text-primary/8" />

        <ProfileSection number="01" title="BASICS" description="Your name and best contact details.">
          <div className="flex flex-col gap-4.5 sm:flex-row">
            <Field className="flex-1" label="First Name" value={hacker.firstName} />
            <Field className="flex-1" label="Last Name" value={hacker.lastName} />
          </div>
          <div className="flex flex-col gap-4.5 sm:flex-row">
            <Field className="flex-1" label="Email" value={hacker.email} tone="secondary" />
            <Field className="flex-1" label="Phone" optional value={hacker.phone} tone="secondary" />
          </div>
        </ProfileSection>

        <div className="mx-6.5 h-px bg-text-primary/8" />

        <ProfileSection number="02" title="ABOUT YOU" description="Shirt size and demographic info.">
          <div className="flex flex-col gap-4.5 sm:flex-row">
            <Field className="flex-1" label="Gender" optional value={hacker.gender} />
            <Field className="flex-1" label="Shirt Size" value={hacker.shirtSize} />
          </div>
        </ProfileSection>

        <div className="mx-6.5 h-px bg-text-primary/8" />

        <ProfileSection number="03" title="ACADEMIC INFO" description="Your school, major, and graduation.">
          <div className="flex flex-col gap-4.5 sm:flex-row">
            <Field className="flex-1" label="School" value={hacker.school} />
            <Field className="flex-1" label="Major" value={hacker.major} />
          </div>
          <div className="flex flex-col gap-4.5 sm:flex-row">
            <Field className="flex-1" label="Graduation Date" value={hacker.graduationDate} tone="secondary" />
            <div className="flex-1" />
          </div>
        </ProfileSection>
      </PixelCard>
    </div>
  );
}
