import PageHeading from "@/components/ui/PageHeading";
import { getCurrentHacker } from "@/lib/current-hacker";
import ProfileForm from "./profile-form";

/**
 * The hacker's own profile. Values come from the session's person and
 * application (getCurrentHacker); only display values reach the client —
 * never the application id, which the save action resolves again itself.
 */
export default async function ProfilePage() {
  const { person, application } = await getCurrentHacker();
  return (
    <div>
      <PageHeading title="PROFILE" />
      <ProfileForm
        initial={{
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          phone: person.phoneNum,
          gender: application.gender ?? "",
          shirtSize: application.shirtSize ?? "",
          school: application.school,
          major: application.major ?? "",
          graduation: application.graduation ?? "",
        }}
      />
    </div>
  );
}
