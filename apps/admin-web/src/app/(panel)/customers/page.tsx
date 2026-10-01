import type { Metadata } from "next";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = { title: "Clientes" };

export default function CustomersPage() {
  return <AdminView section="customers" />;
}

