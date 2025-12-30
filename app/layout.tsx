import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "🦔 什錦雜貨鋪 ETF - Portfolio Tracker",
  description: "個人投資組合追蹤工具 - 追蹤台股、美股與加密貨幣",
  keywords: ["ETF", "投資", "Portfolio", "台積電", "美股", "比特幣"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className={inter.className}>
        <div className="min-h-screen gradient-bg">
          {children}
        </div>
      </body>
    </html>
  );
}
