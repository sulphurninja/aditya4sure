import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ADITYA", template: "%s · ADITYA" },
  description: "Aditya's second brain.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#07070a",
  colorScheme: "dark light",
};

// Applies saved theme + accent before first paint (no flash). Static string, no user input.
const themeScript = `try{var d=document.documentElement,t=localStorage.getItem('aditya-theme'),a=localStorage.getItem('aditya-accent');d.dataset.theme=(t==='light'||t==='dark')?t:'dark';if(/^(ember|lavender|lime|ocean|sakura)$/.test(a||''))d.dataset.accent=a}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" data-accent="ember" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="grain min-h-full">
        <div className="aurora" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: "var(--panel-solid)", color: "var(--text)", border: "1px solid var(--line-strong)", borderRadius: 16 },
          }}
        />
      </body>
    </html>
  );
}
