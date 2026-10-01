import type { Metadata } from "next";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = { title: "Dispositivos" };

export default function DevicesPage() {
  return <AdminView section="devices" />;
}

