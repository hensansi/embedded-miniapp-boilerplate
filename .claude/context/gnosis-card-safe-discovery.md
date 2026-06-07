# Gnosis Card Safe Discovery

## The Bug

`TopUpSheet` queries `/owners/${safeAddress}/safes/` to find the destination card safe. This returns empty because the card safe is **not owned by the source safe** in the standard Gnosis Safe sense. The destination shows "—".

## Confirmed Addresses (dev environment)

| Role | Address |
|------|---------|
| Signer (EOA) | `0xd9e33BE7FC0D979F395e46Dd5fe1bA8063481543` |
| Source safe (Aave) | `0xb064b39f18A49ddA2659A504b6A2194d48B4B631` |
| Card safe | `0xA3B36C493c414b9314E214B59F8379a8EE5aC4Fe` |
| Delay module clone | `0xd1A9f6CF9fb4e383bD27A61cC591C86D9a813514` |
| Roles module clone | `0xCD39E4C6EF3CCd1D957996200273383D1DB0967d` |

## Card Safe Architecture

```
Signer EOA (0xd9e33...)
  └─► [EnabledModule in] Delay clone (0xd1A9f6...)
        └─► avatar/target = Card safe (0xA3B36C...)
              └─► [EnabledModule] Delay clone
              └─► [EnabledModule] Roles clone (0xCD39E4...)
```

**Card safe owner**: `0x0000000000000000000000000000000000000002` (sentinel — controlled purely by modules)

**Delay clone** (`0xd1A9f6...`):
- Zodiac Delay proxy (`masterCopy = 0x22d903fd45F441F51bcad198D14eBa8a75EA1ef0`)
- `avatar` = card safe (storage slot 0)
- `target` = card safe (storage slot 1)
- `txCooldown` = 180s (storage slot 4)
- `txExpiration` = 1800s (storage slot 5)
- Has signer enabled as module via `EnabledModule` event

**Roles clone** (`0xCD39E4...`):
- Zodiac Roles v2 proxy (`masterCopy = 0x732b9e9f259fba6f65a1a012dc89c20872ffbd2f`)
- `owner` = Bouncer contract (`0x8c29fe087292A90C95A386623A6E675fF53D81B5`)
- Gnosis Card executor safe (`0x896a695d5cCDd21F9e3Bb18307a558befCCb8428`) has a role to transfer EURe to the payout safe (`0x4822521e6135cd2599199c83ea35179229a172ee`)

## Solution: HyperIndex GraphQL (public, no auth)

The Gnosis Pay app uses a public HyperIndex subgraph that indexes `DelayModuleOwner` relationships. Given only the signer EOA it returns all associated card safes.

**Endpoint**: `POST https://indexer.eu.hyperindex.xyz/00dfbaf/v1/graphql`

```graphql
query payOwners($address: String) {
  Metri_Pay_DelayModuleOwner(where: {ownerAddress: {_eq: $address}}) {
    delayModule {
      safeAddress
    }
  }
}
```

Variables: `{ "address": "<signer EOA>" }`

Response (example with 2 results — old + current card safe):
```json
{
  "data": {
    "Metri_Pay_DelayModuleOwner": [
      { "delayModule": { "safeAddress": "0x08e0ad8Af5488c0fDcA4153AbFa0846fC78904E2" } },
      { "delayModule": { "safeAddress": "0xA3B36C493c414b9314E214B59F8379a8EE5aC4Fe" } }
    ]
  }
}
```

Use the **last item** in the array (most recently associated) as the current card safe. Cross-check with EURe balance if disambiguation is needed.

### Alternative: Gnosis Pay API (authenticated)

```
GET https://api.gnosispay.com/api/v1/user
```

Returns `safeWallets: [{ address, chainId, tokenSymbol }]` — authoritative but requires Gnosis Pay session cookie. Not usable from the miniapp without user login.

## What Works for Discovery

| Query | Result |
|-------|--------|
| HyperIndex `payOwners(signerAddress)` | ✅ Returns all card safes for signer |
| `GET /modules/{delayClone}/safes/` | ✅ Returns card safe (needs Delay clone addr) |
| `eth_getStorageAt(delayClone, slot0)` | ✅ Returns card safe address (needs Delay clone addr) |

## What Doesn't Work

| Query | Result | Why |
|-------|--------|-----|
| `GET /owners/{sourceSafe}/safes/` | `[]` | Source safe owns no other safes |
| `GET /owners/{signer}/safes/` | `[sourceSafe]` | Signer owns source safe, not card safe |
| `GET /modules/{signer}/safes/` | `[]` | Safe tx service doesn't index Delay clone's `EnabledModule` events (Delay clone is not a Gnosis Safe) |
| `eth_call isModuleEnabled(signer)` on Delay clone | reverts | Zodiac module functions don't respond to standard `eth_call` |
| `eth_call avatar()` on Delay clone | reverts | Same issue |

## The Missing Link

To dynamically discover the card safe we need:
1. The Delay clone address (which was created by Zodiac Module Proxy Factory `0x000000000000aDdB49795b0f9bA5BC298cDda236`)
2. Then call `GET /modules/{delayClone}/safes/` to get the card safe

**Finding the Delay clone from the signer is the unsolved part.** Options:
- Scan `ModuleProxyCreation` factory events (topic0 = `0x2150ada9...`, Delay masterCopy = `0x22d903fd...`), then for each proxy check if the signer is an enabled module. Blocked by RPC `eth_getLogs` range limits.
- Gnosis Card/Pay API (no known public endpoint found)
- Blockscout logs API to find `EnabledModule` events with signer in data (not indexed, harder to filter)

## Card Safe Setup Transaction

**TX**: `0x94335b71dba7c2cf85a94b5b8b83a742a041a4f6c1a89f8d90bc5818445cd524`  
**Block**: 46526719 (`0x2c5f0ff`)  
**Date**: 2026-06-04  
**Executor**: `0x5e1BF00C7E7b3Dc07Be766391712688da3D3277f` (Gnosis Card bot)

The card safe ran a MultiSend that:
1. Removed initial owner, set sentinel `0x0000...0002` as owner
2. Enabled Roles clone and Delay clone as modules
3. Initialized both Zodiac modules (setup events confirmed)
4. Set up Roles module: allowed EURe transfers to payout safe
5. Transferred Roles module ownership to Bouncer

## Key Contracts

| Contract | Address | Role |
|----------|---------|------|
| Zodiac Module Proxy Factory | `0x000000000000aDdB49795b0f9bA5BC298cDda236` | Creates Delay/Roles clones |
| Delay implementation | `0x22d903fd45F441F51bcad198D14eBa8a75EA1ef0` | Delay master copy |
| Roles implementation | `0x732b9e9f259fba6f65a1a012dc89c20872ffbd2f` | Roles master copy |
| Bouncer | `0x8c29fe087292A90C95A386623A6E675fF53D81B5` | Owns all Roles clones |
| Gnosis Card executor safe | `0x896a695d5cCDd21F9e3Bb18307a558befCCb8428` | Submits card payments |
| EURe payout safe | `0x4822521e6135cd2599199c83ea35179229a172ee` | Receives card payment EURe |

## ModuleProxyCreation Event

Topic0: `0x2150ada912bf189ed721c44211199e270903fc88008c2a1e1e889ef30fe67c5f`  
Indexed args: `proxy` (topic1), `masterCopy` (topic2)

In the same block (46526719), 7 Delay clones and 7 Roles clones were created — all for different users' card safes being set up simultaneously.
