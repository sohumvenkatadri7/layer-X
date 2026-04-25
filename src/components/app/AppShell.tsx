import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ArrowLeftRight, Compass, User, Settings, Gem } from "lucide-react";
import { ContextPanel } from "./ContextPanel";
import { WalletConnector } from "./WalletConnector";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/transactions", label: "Transactions", icon: ArrowLeftRight, exact: false },
  { to: "/app/explorer", label: "Explorer", icon: Compass, exact: false },
  { to: "/app/assets", label: "Assets", icon: Gem, exact: false },
  { to: "/app/launch", label: "Launch", icon: Settings, exact: false },
  { to: "/app/identity", label: "Identity", icon: User, exact: false },
  { to: "/app/settings", label: "Settings", icon: Settings, exact: false },
] as const;

export function AppShell({ children }: { children?: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isExplorerRoute = pathname.startsWith("/app/explorer");
  const isLaunchRoute = pathname.startsWith("/app/launch");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden w-[220px] shrink-0 flex-col bg-sidebar md:flex">
        <div className="px-6 pt-6 pb-10">
          <Link to="/" className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-primary glow-primary-sm" />
            <span className="font-mono text-sm font-medium tracking-tight">layer X</span>
          </Link>
        </div>

        <nav className="flex-1 px-3">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to} className="relative">
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-primary glow-primary-sm"
                    />
                  )}
                  <Link
                    to={item.to}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-6 py-6">
          {/* <div className="text-xs text-muted-foreground">Wallet</div> */}
          {/* <div className="mt-1 text-sm font-medium text-foreground">@prajwal</div> */}
          <div className="mt-3">
            <WalletConnector />
          </div>
        </div>
      </aside>

      {/* Center */}
      <main className="flex-1 min-w-0 animate-enter">{children ?? <Outlet />}</main>

      {/* Right context panel */}
      {/* {!isExplorerRoute ? <ContextPanel /> : null} */}
      {!(isExplorerRoute || isLaunchRoute) ? <ContextPanel /> : null}
      {/* {!isLaunchRoute ? <ContextPanel /> : null} */}
    </div>
  );
}
