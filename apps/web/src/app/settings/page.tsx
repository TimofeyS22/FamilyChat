import type { Viewport } from "next";

import { SettingsShell } from "@/features/settings/settings-shell";

export const viewport: Viewport = {
  themeColor: "#e7f4ff",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SettingsPage() {
  return <SettingsShell />;
}
