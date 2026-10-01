import type { Metadata } from "next";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = { title: "Fontes" };

export default function PlaylistsPage() {
  return <AdminView section="playlists" />;
}

