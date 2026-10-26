import { requireVolunteerOrAbove } from "@/lib/scanner-access";
import Scanner from "./Scanner";

export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  await requireVolunteerOrAbove();

  return <Scanner />;
}
