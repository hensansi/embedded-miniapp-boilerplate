import globalsCss from "../globals.css?url";

import { createRootRoute, Outlet, HeadContent, Scripts } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
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
      { title: "Aave Position" },
    ],
    links: [{ rel: "stylesheet", href: globalsCss }],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      style={
        {
          "--font-sans": "'Space Grotesk', sans-serif",
        } as React.CSSProperties
      }
    >
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
      <AppShell>
        <Outlet />
      </AppShell>
    </WalletProvider>
  );
}
