import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "Lịch năng lượng" };

export default function DashboardPage() {
  return <Dashboard />;
}
