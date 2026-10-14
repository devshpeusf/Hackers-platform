import { getCurrentHacker } from "@/lib/current-hacker";
import { getBadgeSvg } from "@/lib/badge";
import Dashboard from "./Dashboard";

export default async function DashboardPage() {
  const { fullName, application } = await getCurrentHacker();
  // Only the rendered SVG crosses to the client — never the application id
  // or the raw token.
  const badgeSvg = await getBadgeSvg(application.id);
  return <Dashboard fullName={fullName} diet={application.diet} badgeSvg={badgeSvg} />;
}
