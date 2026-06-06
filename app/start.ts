import { createMiddleware, createStart } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

const cspMiddleware = createMiddleware().server(async ({ next }) => {
  setResponseHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://*.gnosis.io https://*.vercel.app;"
  );
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [cspMiddleware],
}));
