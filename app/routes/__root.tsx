import globalsCss from "../globals.css?url";

import { createRootRoute, Outlet, HeadContent, Scripts } from "@tanstack/react-router";
import { WalletProvider } from "@/components/wallet/WalletProvider";

const FRAME_ANCESTORS = "'self' https://*.gnosis.io https://*.vercel.app";

export const Route = createRootRoute({
  loader: async () => {
    if (import.meta.env.SSR) {
      const { setResponseHeader } = await import("@tanstack/react-start/server");
      setResponseHeader("Content-Security-Policy", `frame-ancestors ${FRAME_ANCESTORS};`);
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Aave V3 — Gnosis" },
    ],
    links: [{ rel: "stylesheet", href: globalsCss }],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-full">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <WalletProvider>
      <main className="min-h-screen p-3 sm:p-4">
        <Outlet />
      </main>
    </WalletProvider>
  );
}
