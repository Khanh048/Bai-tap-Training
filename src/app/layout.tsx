import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Hôm Nay Thế Nào?", template: "%s · Hôm Nay Thế Nào?" },
  description: "Sắp lịch theo năng lượng, không chỉ theo thời gian.",
};

export const viewport: Viewport = { themeColor: "#f8f4e8", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
