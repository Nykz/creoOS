import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CreoOS | Creator workspace",
  description: "An operating system for creator businesses.",
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
