import { getCurrentHacker } from "@/lib/current-hacker";
import Team from "./Team";

export default async function TeamPage() {
  const { fullName } = await getCurrentHacker();
  return <Team fullName={fullName} />;
}
