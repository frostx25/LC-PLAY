import type { Metadata } from "next";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = { title: "Alertas" };

export default function AlertsPage() {
  return <AdminView section="alerts" />;
}
