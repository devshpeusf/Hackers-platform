import { getCurrentHacker } from "@/lib/current-hacker";
import { getTeamView } from "@/lib/teams";
import Team from "./Team";

export default async function TeamPage() {
  const { application } = await getCurrentHacker();
  // Display data only — names, handles, the invite code. No ids reach the browser.
  const team = await getTeamView(application.id);
  return <Team team={team} />;
}
