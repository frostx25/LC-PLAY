import type { Metadata } from "next";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = { title: "Atividade" };

export default function LogsPage() {
  return <AdminView section="logs" />;
}
