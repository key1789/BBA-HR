import type { Metadata } from "next";
import { getSessionContext } from "@/lib/auth-context";
import { cookies } from "next/headers";
import "./globals.css";

import { Nunito } from "next/font/google";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apotrik",
  description: "Platform HR untuk operasional dan monitoring apotek",
  icons: {
    icon: "/apotrik-logo.png",
    apple: "/apotrik-logo.png",
  },
  openGraph: {
    title: "Apotrik",
    description: "Platform HR untuk operasional dan monitoring apotek",
    url: "https://bba-system.vercel.app",
    siteName: "Apotrik",
    images: [
      {
        url: "https://bba-system.vercel.app/api/og",
        width: 1200,
        height: 630,
        alt: "Apotrik",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Apotrik",
    description: "Platform HR untuk operasional dan monitoring apotek",
    images: ["https://bba-system.vercel.app/api/og"],
  },
};

import { Toaster } from "sonner";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/shared/navigation-progress";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const hasAuthCookies = cookieStore
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"));
  const session = hasAuthCookies ? await getSessionContext() : null;
  const activeMembership = session?.activeMembership;
  void activeMembership;
  
  return (
    <html
      lang="en"
      className={`${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <Toaster position="top-right" richColors theme="light" />
        {children}
      </body>
    </html>
  );
}
