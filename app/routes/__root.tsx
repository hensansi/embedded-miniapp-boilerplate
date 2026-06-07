import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { WalletProvider } from "@/components/wallet/WalletProvider";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <WalletProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </WalletProvider>
  );
}
