import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Devanagari, Noto_Sans_Gujarati } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Hindi and Gujarati letters. Not preloaded: the browser fetches them only on a page that shows that script.
const deva = Noto_Sans_Devanagari({ variable: "--font-deva", subsets: ["devanagari"], preload: false });
const gujr = Noto_Sans_Gujarati({ variable: "--font-gujr", subsets: ["gujarati"], preload: false });

export const metadata: Metadata = {
  title: { default: "Hotel Desk", template: "%s · Hotel Desk" },
  description: "Daily counter, expenses, payroll and partner reports for the hotel.",
  // Opened from the iPhone home screen: full screen, no Safari bars.
  appleWebApp: { capable: true, title: "Hotel Desk", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0b3527" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${deva.variable} ${gujr.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
