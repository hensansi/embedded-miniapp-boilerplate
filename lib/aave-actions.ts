import { encodeFunctionData } from 'viem';

export const POOL = '0xb50201558B00496A145fE76f7424749556E326D8' as const;

export const MAX_REPAY_AMOUNT = 2n ** 256n - 1n;

const POOL_ABI = [
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'referralCode', type: 'uint16' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    name: 'borrow',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    name: 'repay',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Selectors derived from the ABIs above — slice the first 4 bytes of encoded calldata
const _zero = '0x0000000000000000000000000000000000000000' as const;
export const SELECTOR_BORROW = encodeFunctionData({ abi: POOL_ABI, functionName: 'borrow', args: [_zero, 0n, 2n, 0, _zero] }).slice(0, 10) as `0x${string}`;
export const SELECTOR_REPAY  = encodeFunctionData({ abi: POOL_ABI, functionName: 'repay',  args: [_zero, 0n, 2n, _zero] }).slice(0, 10) as `0x${string}`;
export const SELECTOR_APPROVE = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [_zero, 0n] }).slice(0, 10) as `0x${string}`;

export function buildBorrowTx(
  asset: `0x${string}`,
  amountWei: bigint,
  onBehalfOf: `0x${string}`,
): { to: `0x${string}`; data: `0x${string}` }[] {
  return [
    {
      to: POOL,
      data: encodeFunctionData({
        abi: POOL_ABI,
        functionName: 'borrow',
        args: [asset, amountWei, 2n, 0, onBehalfOf],
      }),
    },
  ];
}

export function buildRepayTx(
  asset: `0x${string}`,
  amountWei: bigint,
  onBehalfOf: `0x${string}`,
): { to: `0x${string}`; data: `0x${string}` }[] {
  return [
    {
      to: asset,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [POOL, amountWei],
      }),
    },
    {
      to: POOL,
      data: encodeFunctionData({
        abi: POOL_ABI,
        functionName: 'repay',
        args: [asset, amountWei, 2n, onBehalfOf],
      }),
    },
  ];
}
