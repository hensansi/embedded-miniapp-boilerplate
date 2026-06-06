# Miniapps Boilerplate — Agent Guide

This is a starter template for building [Circles](https://aboutcircles.com) miniapps. A miniapp is a web app that loads inside the Circles host (https://circles.gnosis.io/playground) via an iframe; the host injects a wallet and your app drives interactions through the SDK. The boilerplate ships with the minimum plumbing — wallet provider, sign-in demo, profile lookup, layout — so a developer can clone it and start writing business logic immediately.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | **TanStack Start** + **TanStack Router** | Vite-based SSR; file-based routing in `app/routes/` |
| Language | **TypeScript 6** | Strict mode on; path alias `@/*` → project root |
| Styling | **Tailwind v4** + **shadcn/ui** | shadcn uses Base UI (`@base-ui/react`), not Radix. No `tailwind.config.js` — theme tokens live in `app/globals.css` under `@theme inline { … }` |
| Package manager | **pnpm** | Lock at `pnpm-lock.yaml`; never mix with npm/yarn |
| Theme | Light only | No `.dark { … }` block. Do not add `dark:` Tailwind variants unless explicitly asked |
| Circles SDKs | `@aboutcircles/miniapp-sdk` + `@aboutcircles/sdk` | See "Working with the Circles SDKs" below |

## Project structure

```
app/
  routes/
    __root.tsx              Root layout: CSP header + <WalletProvider><AppShell>
    index.tsx               Dashboard (ConnectionCard + SignInDemo + NavCards)
    profile.tsx             Profile lookup
    actions.tsx             sendTransactions code sample
  routeTree.gen.ts          Auto-generated — do not edit by hand
  router.tsx                createRouter() wired to routeTree.gen.ts
  start.ts                  TanStack Start entry + CSP middleware
  globals.css               Tailwind v4 + shadcn tokens (light only)
  server/
    profile.ts              createServerFn example (profile lookup)
components/
  brand/CirclesLogo.tsx     Inline-SVG brand mark
  layout/
    AppShell.tsx            Grid: header + sidebar (md+) + main
    Header.tsx              Logo, crumb, MobileNav, WalletStatus
    Sidebar.tsx             Desktop nav (md+), driven by lib/nav.ts
    MobileNav.tsx           Hamburger + Sheet drawer (below md)
    CurrentPage.tsx         Page crumb in header
    NavCards.tsx            Dashboard link-cards
    PageNav.tsx             Prev/next sibling nav at bottom of sub-pages
  wallet/
    WalletProvider.tsx      Client context + useWallet hook, subscribes to onWalletChange
    WalletStatus.tsx        Badge with shortened address
    ConnectionCard.tsx      Full connection details card
    SignInDemo.tsx          signMessage() demo
  profile/
    ProfileLookup.tsx       Profile lookup via getProfile server function
  ui/                       shadcn primitives — DO NOT hand-edit; regenerate via CLI
hooks/
  use-wallet.ts             Re-export of useWallet
lib/
  utils.ts                  cn() + shortenAddress(addr, chars=4)
  nav.ts                    NAV array — single source of truth for sidebar/drawer/page-nav
```

## Working with the Circles SDKs

There are two packages with distinct roles. Get this wrong and the app will silently misbehave.

### `@aboutcircles/miniapp-sdk` — host bridge

Used for everything that talks to the Circles host (the user's wallet and Safe).

```ts
import {
  onWalletChange,      // (cb: (address: string | null) => void) => unsubscribe
  isMiniappMode,       // () => boolean — true when running inside the host iframe
  sendTransactions,    // (txs: { to, data?, value? }[]) => Promise<string[]>
  signMessage,         // (msg, signatureType?) => Promise<{ signature, verified }>
  onAppData,           // host can pass extra app data via ?data=
} from '@aboutcircles/miniapp-sdk';
```

**Rules:**
- **There is no "Connect" button.** The host pushes the wallet via `onWalletChange`. Outside the host (`pnpm dev` standalone), the callback never fires — the "Not connected" state is expected, not a bug.
- **The SDK touches `window` and `parent`.** Dynamically import it inside a `useEffect`. Never top-level import it — you will get `window is not defined` at SSR time. See `WalletProvider.tsx` for the canonical pattern.
- **`onWalletChange` returns an unsubscribe function.** Call it in the effect cleanup or you will leak subscriptions on hot reload.

### `@aboutcircles/sdk` — read/write Circles data

Used to query the Circles indexer and protocol state (avatars, profiles, balances, trust, transfers).

**For READ operations, use `sdk.rpc.profile.getProfileView(address)`. Do NOT use `sdk.getAvatar(address)`.**

```ts
// ✅ Correct — degrades gracefully for unregistered addresses
const sdk = new Sdk();
const view = await sdk.rpc.profile.getProfileView(address);
// → { avatarInfo?, profile?, trustStats, v2Balance?, v1Balance? }
if (view.avatarInfo) {
  if (view.avatarInfo.cidV0) {
    const full = await sdk.rpc.profile.getProfileByCid(view.avatarInfo.cidV0);
    // → richer Profile { name, description, imageUrl, previewImageUrl, location }
  }
} else {
  // not registered — show a friendly message, don't treat as an error
}

// ❌ Wrong — throws "Avatar not found" even on valid avatars with empty cidV0Digest
const avatar = await sdk.getAvatar(address);
const profile = await avatar.profile.get();
```

Use `sdk.getAvatar()` only when you need a write-capable `Avatar` instance (`trust.add`, `transfer.direct`, `personalToken.mint`, etc.). Never for reads.

**Balance formatting:** `view.v2Balance` is already a decimal CRC string (e.g. `"1219.71…"`). Do not divide by `1e18`.

### Default RPC endpoint

`new Sdk()` defaults to Gnosis Chain mainnet via `https://rpc.aboutcircles.com/`. No configuration needed.

## Wallet context

`WalletProvider.tsx` wraps `onWalletChange` in a React context and is mounted once in `app/routes/__root.tsx`. Anywhere downstream:

```tsx
import { useWallet } from '@/hooks/use-wallet';

const { address, isConnected, isMiniappHost } = useWallet();
```

- `address: string | null` — treat as opaque; checksumming varies by host
- `isConnected: boolean` — `!!address`
- `isMiniappHost: boolean` — `true` only inside the Circles iframe

## Navigation

The sidebar, mobile drawer, crumb, and prev/next page nav are all driven by one source — [`lib/nav.ts`](lib/nav.ts). To add a route, edit `NAV` and create `app/routes/<route>.tsx`.

```ts
export const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/profile', label: 'Profile' },
  { href: '/actions', label: 'Actions' },
];
```

The dashboard (`/`) intentionally has no `<PageNav />` — `NavCards` serves that purpose. Sub-pages include `<PageNav />` at the bottom.

## Routing

Routes use TanStack Router's file-based convention. Each route file exports a `Route` constant:

```tsx
// app/routes/my-page.tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/my-page')({
  component: MyPage,
});

function MyPage() { … }
```

After adding or renaming a route file, run `pnpm generate-routes` to regenerate `app/routeTree.gen.ts`. The dev server does this automatically on file changes, but the build does not.

## Server functions

Use `createServerFn` from `@tanstack/react-start` for server-side logic (database calls, SDK reads that shouldn't run in the browser, etc.). See `app/server/profile.ts` for the pattern.

```ts
import { createServerFn } from '@tanstack/react-start';

export const myFn = createServerFn({ method: 'GET' })
  .inputValidator((input: { foo: string }) => input)
  .handler(async ({ data }) => {
    // runs on server only
  });
```

Call it from a component like a regular async function — TanStack Start handles the serialization.

## Styling

- **Tailwind v4.** `app/globals.css` imports `tailwindcss` and `shadcn/tailwind.css` and defines tokens under `@theme inline { … }`. There is no `tailwind.config.js`.
- **shadcn primitives** in `components/ui/`. Do not hand-edit them. Regenerate with `pnpm dlx shadcn@latest add <name> --overwrite`.
- **shadcn uses Base UI** (`@base-ui/react`), not Radix. Trigger components accept a `render={<Button … />}` prop, not `asChild`. See `MobileNav.tsx` for an example.
- **Light mode only.** Do not write `dark:` variants.

## Common workflows

### Add a new route

1. Create `app/routes/<name>.tsx` with `createFileRoute('/<name>')`.
2. Add `{ href: '/<name>', label: '…' }` to `NAV` in `lib/nav.ts`.
3. Add `<PageNav />` at the bottom unless the page has its own navigation affordance.
4. Run `pnpm generate-routes` if the dev server isn't running.

### Add a shadcn component

```bash
pnpm dlx shadcn@latest add <name>
```

### Add a Circles SDK call

1. Read the typed signature in `node_modules/@aboutcircles/sdk/dist/**/*.d.ts`.
2. For client-side calls, dynamically import inside a `useEffect`. For server-side calls, use a `createServerFn`.
3. Handle the unregistered case explicitly — `getProfileView` returns `{ avatarInfo: undefined }`, not an error.
4. Probe unfamiliar RPC methods before wiring UI:
   ```bash
   curl -s -X POST https://rpc.aboutcircles.com/ -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"circles_<method>","params":[…]}'
   ```

## Commands

```bash
pnpm dev              # http://localhost:3000
pnpm build            # production build (Vite + Nitro)
pnpm start            # run the built app
pnpm lint             # ESLint
pnpm generate-routes  # regenerate app/routeTree.gen.ts
```

## Running inside the Circles playground

1. Deploy to Vercel (or any HTTPS host).
2. Open `https://circles.gnosis.io/playground?url=<your-deploy-url>`.
3. The host injects a Safe address. `onWalletChange` fires, the badge flips, and `signMessage`/`sendTransactions` start working.

The CSP `frame-ancestors` header is set in `app/start.ts` middleware. If you deploy to a domain outside `*.gnosis.io` and `*.vercel.app`, add it to the allowlist there.

For permanent marketplace placement, open a PR against [`aboutcircles/CirclesMiniapps`](https://github.com/aboutcircles/CirclesMiniapps) adding an entry to `static/miniapps.json`.

## Gotchas — read before changing things

- **Do not add a "Connect wallet" button.** The host is the wallet UI.
- **Do not top-level import either Circles SDK.** Always dynamically import inside a `useEffect` or a `createServerFn` handler.
- **Do not use `sdk.getAvatar()` for read flows** — use `sdk.rpc.profile.getProfileView()`.
- **Do not divide `v2Balance` by `1e18`** — it is already a decimal string.
- **Do not hand-edit `components/ui/*`** — regenerate via the shadcn CLI.
- **Do not edit `app/routeTree.gen.ts`** — it is auto-generated by TanStack Router.
- **Do not add `dark:` Tailwind variants** unless dark mode is explicitly requested.
- **Do not run `pnpm dev` in the background without need.** Use `pkill -f "vite"` to clean up orphaned servers.
- **Do not commit `.env.local`** — only `.env.example` is tracked.
