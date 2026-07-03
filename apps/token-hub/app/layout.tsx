import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token Hub — Confidential Token Explorer",
  description:
    "Etherscan-grade explorer for the Zama Confidential Token Wrappers Registry (ERC-7984).",
};

import { AppShell } from "@/components/shell/AppShell";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
