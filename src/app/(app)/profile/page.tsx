import PageHeading from "@/components/ui/PageHeading";
import PixelCard from "@/components/ui/PixelCard";
import PixelButton from "@/components/ui/PixelButton";
import Field from "@/components/ui/Field";
import { getCurrentHacker } from "@/lib/current-hacker";

type SectionProps = {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

function ProfileSection({ number, title, description, children }: SectionProps) {
  return (
    <div className="flex flex-col gap-9 px-7 py-8 sm:flex-row sm:gap-10 lg:px-8">
      <div className="w-full shrink-0 sm:w-[230px]">
        <div className="mb-2 card-title text-accent-pink">{number}</div>
        <div className="mb-2 card-text font-bold tracking-wide">{title}</div>
        <div className="card-meta text-text-muted">{description}</div>
      </div>
      <div className="flex flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}

export default async function ProfilePage() {
  const { person, application } = await getCurrentHacker();
  return (
    <div>
      <PageHeading title="PROFILE" />

      <PixelCard className="p-0">
        <div className="flex justify-end px-7 py-5 lg:px-8">
          <PixelButton className="px-[22px] py-[11px] text-[11px]">SAVE PROFILE CHANGES</PixelButton>
        </div>
        <div className="h-px bg-text-primary/8" />

        <ProfileSection number="01" title="BASICS" description="Your name and best contact details.">
          <div className="flex flex-col gap-4.5 sm:flex-row">
            <Field size="lg" className="flex-1" label="First Name" value={person.firstName} />
            <Field size="lg" className="flex-1" label="Last Name" value={person.lastName} />
          </div>
          <div className="flex flex-col gap-4.5 sm:flex-row">
            <Field size="lg" className="flex-1" label="Email" value={person.email} tone="secondary" />
            <Field size="lg" className="flex-1" label="Phone" optional value={person.phoneNum} tone="secondary" />
          </div>
        </ProfileSection>

        <div className="mx-7 h-px bg-text-primary/8 lg:mx-8" />

        <ProfileSection number="02" title="ABOUT YOU" description="Shirt size and demographic info.">
          <div className="flex flex-col gap-4.5 sm:flex-row">
            <Field size="lg" className="flex-1" label="Gender" optional value={application.gender ?? "Not provided"} />
            <Field size="lg" className="flex-1" label="Shirt Size" value={application.shirtSize ?? "Not provided"} />
          </div>
        </ProfileSection>

        <div className="mx-7 h-px bg-text-primary/8 lg:mx-8" />

        <ProfileSection number="03" title="ACADEMIC INFO" description="Your school, major, and graduation.">
          <div className="flex flex-col gap-4.5 sm:flex-row">
            <Field size="lg" className="flex-1" label="School" value={application.school} />
            <Field size="lg" className="flex-1" label="Major" value={application.major ?? "Not provided"} />
          </div>
          <div className="flex flex-col gap-4.5 sm:flex-row">
            <Field size="lg" className="flex-1" label="Graduation Date" value={application.graduation ?? "Not provided"} tone="secondary" />
            <div className="flex-1" />
          </div>
        </ProfileSection>
      </PixelCard>
    </div>
  );
}
