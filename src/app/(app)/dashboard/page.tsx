import { getCurrentHacker } from "@/lib/current-hacker";
import { getBadgeSvg } from "@/lib/badge";
import { mainVenue, parseLocations } from "@/lib/event-guide";
import Dashboard from "./Dashboard";

export default async function DashboardPage() {
  const { fullName, application } = await getCurrentHacker();
  // Only the rendered SVG crosses to the client — never the application id
  // or the raw token. This only reads the badge issued during acceptance.
  const badgeSvg = await getBadgeSvg(application.id);
  // Just what the dashboard shows (name, dates, main venue), not the whole
  // event row.
  const { name, startDate, endDate, locations, discordUrl, contactEmail } = application.event;
  const event = { name, startDate, endDate, venueName: mainVenue(parseLocations(locations)), discordUrl, contactEmail };
  return (
    <Dashboard
      fullName={fullName}
      status={application.status}
      rsvpStatus={application.rsvpStatus}
      event={event}
      diet={application.diet ?? "Not provided"}
      badgeSvg={badgeSvg}
    />
  );
}
