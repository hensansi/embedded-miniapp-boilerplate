import { createPublicClient, http } from 'viem';
import { gnosis } from 'viem/chains';

const POOL_ADDRESSES_PROVIDER = '0x36616cf17557639614c1cdDb356b1B83fc0B2132' as const;
const UI_POOL_DATA_PROVIDER = '0x0C6BC4a12039788be08F87e87Cff87FEDbd1D386' as const;
const POOL = '0xb50201558B00496A145fE76f7424749556E326D8' as const;

const RAY = 10n ** 27n;
const WAD = 10n ** 18n;

const defaultClient = createPublicClient({
  chain: gnosis,
  transport: http('https://rpc.gnosischain.com'),
});

type AaveClient = Pick<typeof defaultClient, 'multicall'>;

const UI_ABI = [
  {
    inputs: [{ name: 'provider', type: 'address' }],
    name: 'getReservesData',
    outputs: [
      {
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
          { name: 'isActive', type: 'bool' },
          { name: 'isFrozen', type: 'bool' },
          { name: 'liquidityIndex', type: 'uint128' },
          { name: 'variableBorrowIndex', type: 'uint128' },
          { name: 'liquidityRate', type: 'uint128' },
          { name: 'variableBorrowRate', type: 'uint128' },
          { name: 'lastUpdateTimestamp', type: 'uint40' },
          { name: 'aTokenAddress', type: 'address' },
          { name: 'variableDebtTokenAddress', type: 'address' },
          { name: 'interestRateStrategyAddress', type: 'address' },
          { name: 'availableLiquidity', type: 'uint256' },
          { name: 'totalScaledVariableDebt', type: 'uint256' },
          { name: 'priceInMarketReferenceCurrency', type: 'uint256' },
          { name: 'priceOracle', type: 'address' },
          { name: 'variableRateSlope1', type: 'uint256' },
          { name: 'variableRateSlope2', type: 'uint256' },
          { name: 'baseVariableBorrowRate', type: 'uint256' },
          { name: 'optimalUsageRatio', type: 'uint256' },
          { name: 'isPaused', type: 'bool' },
          { name: 'isSiloedBorrowing', type: 'bool' },
          { name: 'accruedToTreasury', type: 'uint128' },
          { name: 'isolationModeTotalDebt', type: 'uint128' },
          { name: 'flashLoanEnabled', type: 'bool' },
          { name: 'debtCeiling', type: 'uint256' },
          { name: 'debtCeilingDecimals', type: 'uint256' },
          { name: 'borrowCap', type: 'uint256' },
          { name: 'supplyCap', type: 'uint256' },
          { name: 'borrowableInIsolation', type: 'bool' },
          { name: 'virtualUnderlyingBalance', type: 'uint128' },
          { name: 'deficit', type: 'uint128' },
        ],
        name: '',
        type: 'tuple[]',
      },
      {
        components: [
          { name: 'marketReferenceCurrencyUnit', type: 'uint256' },
          { name: 'marketReferenceCurrencyPriceInUsd', type: 'int256' },
          { name: 'networkBaseTokenPriceInUsd', type: 'int256' },
          { name: 'networkBaseTokenPriceDecimals', type: 'uint8' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'provider', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    name: 'getUserReservesData',
    outputs: [
      {
        components: [
          { name: 'underlyingAsset', type: 'address' },
          { name: 'scaledATokenBalance', type: 'uint256' },
          { name: 'usageAsCollateralEnabledOnUser', type: 'bool' },
          { name: 'scaledVariableDebt', type: 'uint256' },
        ],
        name: '',
        type: 'tuple[]',
      },
      { name: 'userEmodeCategoryId', type: 'uint8' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const POOL_ABI = [
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserAccountData',
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface AssetPosition {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  amount: number;
  amountEur: number;
  apy: number;
  isStable: boolean;
}

export interface BorrowableAsset {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  maxAmount: number;
  maxAmountEur: number;
  apy: number;
}

export interface AavePosition {
  supplies: AssetPosition[];
  borrows: AssetPosition[];
  borrowable: BorrowableAsset[];
  totalDebtEur: number;
  availableBorrowsEur: number;
  healthFactor: number;
}

export async function fetchAavePosition(
  user: `0x${string}`,
  c: AaveClient = defaultClient,
): Promise<AavePosition> {
  const results = await c.multicall({
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
        args: [POOL_ADDRESSES_PROVIDER, user],
      },
      {
        address: POOL,
        abi: POOL_ABI,
        functionName: 'getUserAccountData',
        args: [user],
      },
    ],
    allowFailure: true,
  });

  const [reservesResult, userResult, accountResult] = results;

  if (reservesResult.status === 'failure') {
    throw new Error(`Failed to fetch Aave reserve data: ${reservesResult.error}`);
  }

  const [reserves] = reservesResult.result as [typeof reservesResult.result[0], unknown];

  // getUserReservesData reverts for addresses that have never interacted with Aave
  const userReserves =
    userResult.status === 'success' ? (userResult.result as [typeof userResult.result[0], number])[0] : [];

  const maxUint256 = 2n ** 256n - 1n;

  // viem may return multi-output functions as an object OR a tuple array depending
  // on the code path (allowFailure: true can shift to tuple form). Support both.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acct: any = accountResult.status === 'success' ? accountResult.result : null;
  const availableBorrowsBase: bigint = BigInt(
    acct?.availableBorrowsBase ?? acct?.[2] ?? 0n,
  );
  const hfRaw: bigint = BigInt(acct?.healthFactor ?? acct?.[5] ?? maxUint256);

  const eureReserve = reserves.find((r) => r.symbol === 'EURe');
  const eurePriceRaw = BigInt(eureReserve?.priceInMarketReferenceCurrency ?? 100000000n);

  const toEur = (amountHuman: number, priceRaw: bigint | number): number => {
    if (eurePriceRaw === 0n) return 0;
    return (amountHuman * Number(priceRaw)) / Number(eurePriceRaw);
  };

  const reserveMap = new Map(
    reserves.map((r) => [r.underlyingAsset.toLowerCase(), r]),
  );

  const supplies: AssetPosition[] = [];
  const borrows: AssetPosition[] = [];

  for (const ur of userReserves) {
    const reserve = reserveMap.get(ur.underlyingAsset.toLowerCase());
    if (!reserve) continue;
    const decimals = Number(reserve.decimals);

    if (BigInt(ur.scaledATokenBalance) > 0n) {
      const raw = (BigInt(ur.scaledATokenBalance) * BigInt(reserve.liquidityIndex)) / RAY;
      const amount = Number(raw) / 10 ** decimals;
      supplies.push({
        symbol: reserve.symbol,
        address: reserve.underlyingAsset,
        decimals,
        amount,
        amountEur: toEur(amount, BigInt(reserve.priceInMarketReferenceCurrency)),
        apy: (Number(reserve.liquidityRate) / Number(RAY)) * 100,
        isStable: false,
      });
    }

    if (BigInt(ur.scaledVariableDebt) > 0n) {
      const raw = (BigInt(ur.scaledVariableDebt) * BigInt(reserve.variableBorrowIndex)) / RAY;
      const amount = Number(raw) / 10 ** decimals;
      borrows.push({
        symbol: reserve.symbol,
        address: reserve.underlyingAsset,
        decimals,
        amount,
        amountEur: toEur(amount, BigInt(reserve.priceInMarketReferenceCurrency)),
        apy: (Number(reserve.variableBorrowRate) / Number(RAY)) * 100,
        isStable: false,
      });
    }
  }

  const totalDebtEur = borrows.reduce((s, b) => s + b.amountEur, 0);
  const availableBorrowsEur =
    eurePriceRaw === 0n
      ? 0
      : Number(BigInt(availableBorrowsBase)) / Number(eurePriceRaw);

  const hfBig = BigInt(hfRaw);
  const healthFactor = hfBig === maxUint256 ? Infinity : Number(hfBig) / Number(WAD);

  const borrowable: BorrowableAsset[] = [];
  for (const reserve of reserves) {
    if (!reserve.borrowingEnabled || !reserve.isActive || reserve.isPaused || reserve.isFrozen) {
      continue;
    }
    const decimals = Number(reserve.decimals);
    const price = BigInt(reserve.priceInMarketReferenceCurrency);
    if (price === 0n) continue;

    const ab = BigInt(availableBorrowsBase);
    const maxFromPower = (ab * 10n ** BigInt(decimals)) / price;
    const liquidity = BigInt(reserve.availableLiquidity);
    const capped = maxFromPower < liquidity ? maxFromPower : liquidity;
    const maxAmount = Number(capped) / 10 ** decimals;
    if (maxAmount < 0.001) continue;

    borrowable.push({
      symbol: reserve.symbol,
      address: reserve.underlyingAsset,
      decimals,
      maxAmount,
      maxAmountEur: toEur(maxAmount, price),
      apy: (Number(reserve.variableBorrowRate) / Number(RAY)) * 100,
    });
  }

  return { supplies, borrows, borrowable, totalDebtEur, availableBorrowsEur, healthFactor };
}
