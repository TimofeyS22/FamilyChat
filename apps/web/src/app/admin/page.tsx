import { AdminShell } from "@/features/admin/admin-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminPage() {
  return <AdminShell />;
}
