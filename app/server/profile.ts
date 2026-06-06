import { createServerFn } from "@tanstack/react-start";

type AvatarType =
  | "CrcV1_Signup"
  | "CrcV1_OrganizationSignup"
  | "CrcV2_RegisterHuman"
  | "CrcV2_RegisterGroup"
  | "CrcV2_RegisterOrganization";

export type ProfileResult = {
  avatarType?: AvatarType;
  version?: number;
  cidV0?: string;
  v2Balance?: string;
  v1Balance?: string;
  trustsCount?: number;
  trustedByCount?: number;
  profile: {
    name?: string;
    description?: string;
    imageUrl?: string;
    previewImageUrl?: string;
    location?: string;
  };
};

export type ProfileLookupResult =
  | { kind: "found"; data: ProfileResult }
  | { kind: "not-registered" }
  | { kind: "error"; error: string };

export const getProfile = createServerFn({ method: "GET" })
  .inputValidator((input: { address: string }) => input)
  .handler(async ({ data }): Promise<ProfileLookupResult> => {
    try {
      const { Sdk } = await import("@aboutcircles/sdk");
      const sdk = new Sdk();
      const view = await sdk.rpc.profile.getProfileView(
        data.address as `0x${string}`
      );

      if (!view.avatarInfo) {
        return { kind: "not-registered" };
      }

      let ipfsProfile: ProfileResult["profile"] = {};
      if (view.avatarInfo.cidV0) {
        try {
          const full = await sdk.rpc.profile.getProfileByCid(
            view.avatarInfo.cidV0
          );
          if (full) {
            ipfsProfile = {
              name: full.name,
              description: full.description,
              imageUrl: full.imageUrl,
              previewImageUrl: full.previewImageUrl,
              location: full.location,
            };
          }
        } catch {
          // CID may not resolve; fall through with view data only
        }
      }

      return {
        kind: "found",
        data: {
          avatarType: view.avatarInfo.type as AvatarType,
          version: view.avatarInfo.version,
          cidV0: view.avatarInfo.cidV0 || undefined,
          v2Balance: view.v2Balance,
          v1Balance: view.v1Balance,
          trustsCount: view.trustStats?.trustsCount,
          trustedByCount: view.trustStats?.trustedByCount,
          profile: {
            name: ipfsProfile.name ?? view.profile?.name,
            description: ipfsProfile.description,
            imageUrl: ipfsProfile.imageUrl,
            previewImageUrl: ipfsProfile.previewImageUrl,
            location: ipfsProfile.location,
          },
        },
      };
    } catch (err) {
      return {
        kind: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });
