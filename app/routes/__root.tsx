import { createRootRoute, Outlet } from "@tanstack/react-router";
import { WalletProvider } from "@/components/wallet/WalletProvider";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <WalletProvider>
      <main style={{ minHeight: "100svh", padding: "16px" }}>
        <Outlet />
      </main>
    </WalletProvider>
  );
}
