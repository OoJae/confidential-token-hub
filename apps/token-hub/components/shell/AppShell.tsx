"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { AddressChip } from "@cipher/ui";
import { REGISTRY } from "@cipher/addresses";
import { useNetwork } from "@/lib/network";
import { ConnectButton } from "./ConnectButton";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { SessionBadge } from "./SessionBadge";

const NAV = [
  { href: "/", label: "Explorer" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/faucet", label: "Faucet" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { chainId } = useNetwork();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-surface-200 bg-surface-50/90 backdrop-blur dark:border-surface-800 dark:bg-surface-950/90">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-accent-strong font-mono text-sm font-bold text-white">
              T
            </span>
            <span className="hidden text-sm font-semibold tracking-tight sm:block">Token Hub</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "rounded-chip px-3 py-1.5 text-sm transition-colors",
                  (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
                    ? "bg-surface-100 font-medium text-surface-950 dark:bg-surface-800 dark:text-surface-50"
                    : "text-surface-500 hover:text-surface-800 dark:hover:text-surface-200",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SessionBadge />
            <NetworkSwitcher />
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>

      <footer className="border-t border-surface-200 dark:border-surface-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 text-xs text-surface-500 sm:px-6">
          <span>Confidential Token Wrappers Registry</span>
          <AddressChip address={REGISTRY[chainId]} chainId={chainId} />
          <span className="ml-auto">
            Built on the{" "}
            <a
              href="https://docs.zama.org/protocol"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-surface-700 dark:hover:text-surface-300"
            >
              Zama Protocol
            </a>{" "}
            · ERC-7984
          </span>
        </div>
      </footer>
    </div>
  );
}
