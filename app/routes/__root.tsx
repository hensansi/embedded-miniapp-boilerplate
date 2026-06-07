import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { WalletProvider } from "@/components/wallet/WalletProvider";

const PLAYGROUND_URL =
  "https://circles.gnosis.io/playground?url=https://aave-miniapp.sites.deploybase.eu";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  useEffect(() => {
    if (window.self === window.top) {
      window.location.replace(PLAYGROUND_URL);
    }
  }, []);

  return (
    <WalletProvider>
      <main className="min-h-screen p-3 sm:p-4">
        <Outlet />
      </main>
    </WalletProvider>
  );
}
