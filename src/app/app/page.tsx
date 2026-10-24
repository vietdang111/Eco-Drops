import type { Metadata } from "next";
import { AppDashboard } from "@/components/app-dashboard";

export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <AppDashboard />;
}
