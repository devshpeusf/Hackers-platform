import { redirect } from "next/navigation";

/**
 * Entry point lands on the application flow — that's where a hacker arriving
 * from hackjam26.com's "Register Now" button belongs. The portal at
 * /dashboard is post-acceptance and reachable from the confirmation screen.
 */
export default function RootPage() {
  redirect("/apply");
}
