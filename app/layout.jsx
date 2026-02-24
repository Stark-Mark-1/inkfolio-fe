import "./globals.css";

export const metadata = {
  title: "Inkfolio",
  description: "Resume and portfolio utility",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-[#F1E9D2] text-[#111111] antialiased">
        {children}
      </body>
    </html>
  );
}
