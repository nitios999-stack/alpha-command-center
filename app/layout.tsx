import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = protocol + "://" + host;

  return {
    metadataBase: new URL(origin),
    title: "ALPHA Command Center",
    description: "ศูนย์สั่งการกำลัง รปภ. และติดตามวางบิล",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "ALPHA Command Center",
      description: "ศูนย์สั่งการกำลัง รปภ. และติดตามวางบิล",
      images: [{ url: "/og.png", width: 1729, height: 910, alt: "ALPHA Command Center" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ALPHA Command Center",
      description: "ศูนย์สั่งการกำลัง รปภ. และติดตามวางบิล",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
