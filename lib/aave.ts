import { createPublicClient, http } from 'viem';
import { gnosis } from 'viem/chains';

const POOL_ADDRESSES_PROVIDER = '0x36616cf17557639614c1cdDb356b1B83fc0B2132' as const;
const UI_POOL_DATA_PROVIDER = '0x0C6BC4a12039788be08F87e87Cff87FEDbd1D386' as const;
const POOL = '0xb50201558B00496A145fE76f7424749556E326D8' as const;

const RAY = 10n ** 27n;

const client = createPublicClient({
  chain: gnosis,
  transport: http('https://rpc.gnosischain.com'),
});

const UI_ABI = [
  {
    name: 'getReservesData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'provider', type: 'address' }],
    outputs: [
      {
        name: 'reservesData',
        type: 'tuple[]',
        components: [
          { name: 'underlyingAsset', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'decimals', type: 'uint256' },
          { name: 'baseLTVasCollateral', type: 'uint256' },
          { name: 'reserveLiquidationThreshold', type: 'uint256' },
          { name: 'reserveLiquidationBonus', type: 'uint256' },
          { name: 'reserveFactor', type: 'uint256' },
          { name: 'usageAsCollateralEnabled', type: 'bool' },
          { name: 'borrowingEnabled', type: 'bool' },
          { name: 'stableBorrowRateEnabled', type: 'bool' },
          { name: 'isActive', type: 'bool' },
          { name: 'isFrozen', type: 'bool' },
          { name: 'liquidityIndex', type: 'uint128' },
          { name: 'variableBorrowIndex', type: 'uint128' },
          { name: 'liquidityRate', type: 'uint128' },
          { name: 'variableBorrowRate', type: 'uint128' },
          { name: 'stableBorrowRate', type: 'uint128' },
          { name: 'lastUpdateTimestamp', type: 'uint40' },
          { name: 'aTokenAddress', type: 'address' },
          { name: 'stableDebtTokenAddress', type: 'address' },
          { name: 'variableDebtTokenAddress', type: 'address' },
          { name: 'interestRateStrategyAddress', type: 'address' },
          { name: 'availableLiquidity', type: 'uint256' },
          { name: 'totalPrincipalStableDebt', type: 'uint256' },
          { name: 'averageStableRate', type: 'uint256' },
          { name: 'stableDebtLastUpdateTimestamp', type: 'uint256' },
          { name: 'totalScaledVariableDebt', type: 'uint256' },
          { name: 'priceInMarketReferenceCurrency', type: 'uint256' },
          { name: 'priceOracle', type: 'address' },
          { name: 'variableRateSlope1', type: 'uint256' },
          { name: 'variableRateSlope2', type: 'uint256' },
          { name: 'stableRateSlope1', type: 'uint256' },
          { name: 'stableRateSlope2', type: 'uint256' },
          { name: 'baseStableBorrowRate', type: 'uint256' },
          { name: 'baseVariableBorrowRate', type: 'uint256' },
          { name: 'optimalUsageRatio', type: 'uint256' },
          { name: 'isPaused', type: 'bool' },
          { name: 'isSiloedBorrowing', type: 'bool' },
          { name: 'accruedToTreasury', type: 'uint128' },
          { name: 'unbacked', type: 'uint128' },
          { name: 'isolationModeTotalDebt', type: 'uint128' },
          { name: 'flashLoanEnabled', type: 'bool' },
          { name: 'debtCeiling', type: 'uint256' },
          { name: 'debtCeilingDecimals', type: 'uint256' },
          { name: 'eModeCategoryId', type: 'uint8' },
          { name: 'borrowCap', type: 'uint256' },
          { name: 'supplyCap', type: 'uint256' },
          { name: 'eModeLtv', type: 'uint16' },
          { name: 'eModeLiquidationThreshold', type: 'uint16' },
          { name: 'eModeLiquidationBonus', type: 'uint16' },
          { name: 'eModePriceSource', type: 'address' },
          { name: 'eModeLabel', type: 'string' },
          { name: 'borrowableInIsolation', type: 'bool' },
        ],
      },
      {
        name: 'baseCurrencyInfo',
        type: 'tuple',
        components: [
          { name: 'marketReferenceCurrencyUnit', type: 'uint256' },
          { name: 'marketReferenceCurrencyPriceInUsd', type: 'int256' },
          { name: 'networkBaseTokenPriceInUsd', type: 'int256' },
          { name: 'networkBaseTokenPriceDecimals', type: 'uint8' },
        ],
      },
    ],
  },
  {
    name: 'getUserReservesData',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'provider', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    outputs: [
      {
        name: 'userReserves',
        type: 'tuple[]',
        components: [
          { name: 'underlyingAsset', type: 'address' },
          { name: 'scaledATokenBalance', type: 'uint256' },
          { name: 'usageAsCollateralEnabledOnUser', type: 'bool' },
          { name: 'stableBorrowRate', type: 'uint256' },
          { name: 'scaledVariableDebt', type: 'uint256' },
          { name: 'principalStableDebt', type: 'uint256' },
          { name: 'stableBorrowLastUpdateTimestamp', type: 'uint256' },
        ],
      },
      { name: 'userEmodeCategoryId', type: 'uint8' },
    ],
  },
] as const;

const POOL_ABI = [
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
] as const;

export type AssetPosition = {
  symbol: string;
  amount: number;
  apy: number;
};

export type AavePosition = {
  supplied: AssetPosition[];
  borrowed: AssetPosition[];
  healthFactor: number; // -1 means no borrows (infinite)
};

function scaledToAmount(scaled: bigint, index: bigint, decimals: number): number {
  const raw = (scaled * index) / RAY;
  const divisor = 10n ** BigInt(decimals);
  const intPart = raw / divisor;
  const fracPart = raw % divisor;
  return Number(intPart) + Number(fracPart) / Number(divisor);
}

function rayToPercent(ray: bigint): number {
  return (Number(ray) / Number(RAY)) * 100;
}

const WAD = 10n ** 18n;
const MAX_HEALTH = 10n ** 30n; // anything this big is effectively infinite

export async function fetchAavePosition(userAddress: string): Promise<AavePosition> {
  const addr = userAddress as `0x${string}`;

  const [reservesResult, userReservesResult, accountResult] = await client.multicall({
    contracts: [
      {
        address: UI_POOL_DATA_PROVIDER,
        abi: UI_ABI,
        functionName: 'getReservesData',
        args: [POOL_ADDRESSES_PROVIDER],
      },
      {
        address: UI_POOL_DATA_PROVIDER,
        abi: UI_ABI,
        functionName: 'getUserReservesData',
        args: [POOL_ADDRESSES_PROVIDER, addr],
      },
      {
        address: POOL,
        abi: POOL_ABI,
        functionName: 'getUserAccountData',
        args: [addr],
      },
    ],
    allowFailure: false,
  });

  const [reservesData] = reservesResult;
  const [userReserves] = userReservesResult;
  const { healthFactor: hfRaw } = accountResult;

  const reserveMap = new Map(
    reservesData.map((r) => [r.underlyingAsset.toLowerCase(), r])
  );

  const supplied: AssetPosition[] = [];
  const borrowed: AssetPosition[] = [];

  for (const ur of userReserves) {
    const reserve = reserveMap.get(ur.underlyingAsset.toLowerCase());
    if (!reserve) continue;
    const decimals = Number(reserve.decimals);

    if (ur.scaledATokenBalance > 0n) {
      supplied.push({
        symbol: reserve.symbol,
        amount: scaledToAmount(ur.scaledATokenBalance, reserve.liquidityIndex, decimals),
        apy: rayToPercent(reserve.liquidityRate),
      });
    }

    if (ur.scaledVariableDebt > 0n) {
      borrowed.push({
        symbol: reserve.symbol,
        amount: scaledToAmount(ur.scaledVariableDebt, reserve.variableBorrowIndex, decimals),
        apy: rayToPercent(reserve.variableBorrowRate),
      });
    }

    if (ur.principalStableDebt > 0n) {
      const divisor = 10n ** BigInt(decimals);
      const intPart = ur.principalStableDebt / divisor;
      const fracPart = ur.principalStableDebt % divisor;
      borrowed.push({
        symbol: `${reserve.symbol} (stable)`,
        amount: Number(intPart) + Number(fracPart) / Number(divisor),
        apy: rayToPercent(ur.stableBorrowRate),
      });
    }
  }

  const healthFactor = hfRaw >= MAX_HEALTH ? -1 : Number(hfRaw) / Number(WAD);

  return { supplied, borrowed, healthFactor };
}
