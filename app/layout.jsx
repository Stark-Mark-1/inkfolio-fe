import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Inkfolio",
  description: "Resume and portfolio utility",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} bg-[#F1E9D2] text-[#111111] antialiased`}>
        {children}
      </body>
    </html>
  );
}
