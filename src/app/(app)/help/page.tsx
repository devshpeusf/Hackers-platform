import { redirect } from "next/navigation";
import { getCurrentHacker } from "@/lib/current-hacker";

/**
 * The help page was replaced by the "Need help?" box on the guide: questions
 * go to Discord, private concerns by email. There's no in-app help form —
 * storing reports and an organizer inbox didn't fit before the event.
 *
 * Kept as a redirect so old links and bookmarks still land somewhere useful.
 * Still checks portal access first, like every portal page.
 */
export default async function HelpPage() {
  await getCurrentHacker();
  redirect("/guide#help");
}
