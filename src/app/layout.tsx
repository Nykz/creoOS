import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CreoOS | Creator workspace",
  description: "Creator-business operating system with role-aware workspace tools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
