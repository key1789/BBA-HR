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
  title: "BBA HR Platform",
  description: "Platform HR untuk operasional dan monitoring apotek",
  icons: {
    icon: "/bba-logo.png",
    apple: "/bba-logo.png",
  },
};

import { Toaster } from "sonner";

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
        <Toaster position="top-right" richColors theme="light" />
        {children}
      </body>
    </html>
  );
}
