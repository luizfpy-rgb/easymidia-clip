import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const DESCRIPTION =
  "De vídeo longo a Shorts publicados, no automático. IA encontra os trechos virais, renderiza com legendas karaokê e publica no seu cronograma.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.easymidia.io"),
  title: {
    default: "easymidia clip — Shorts no automático",
    template: "%s · easymidia clip",
  },
  description: DESCRIPTION,
  openGraph: {
    title: "easymidia clip — Shorts no automático",
    description: DESCRIPTION,
    url: "https://www.easymidia.io",
    siteName: "easymidia clip",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "easymidia clip" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "easymidia clip — Shorts no automático",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${spaceGrotesk.variable} antialiased`}>{children}</body>
    </html>
  );
}
