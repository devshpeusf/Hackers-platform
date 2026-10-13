import { getCurrentHacker } from "@/lib/current-hacker";
import Dashboard from "./Dashboard";

export default async function DashboardPage() {
  const { fullName, application } = await getCurrentHacker();
  return <Dashboard fullName={fullName} diet={application.diet} />;
}
