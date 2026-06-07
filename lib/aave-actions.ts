import { encodeFunctionData } from 'viem';

export const POOL = '0xb50201558B00496A145fE76f7424749556E326D8' as const;

export const MAX_REPAY_AMOUNT = 2n ** 256n - 1n;

const _zero = '0x0000000000000000000000000000000000000000' as const;

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
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export function buildErc20TransferTx(
  token: `0x${string}`,
  to: `0x${string}`,
  amount: bigint,
): { to: `0x${string}`; data: `0x${string}` } {
  return {
    to: token,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [to, amount] }),
  };
}

const SAFE_EXEC_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'signatures', type: 'bytes' },
    ],
    name: 'execTransaction',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

// Wrap a tx so it executes from `safeAddress`, signed by `signerAddress`.
// Uses Safe's pre-validated signature (v=1): valid when msg.sender === signerAddress,
// which holds because the Circles safe is the one calling execTransaction.
export function wrapInExecTransaction(
  innerTx: { to: `0x${string}`; data: `0x${string}` },
  safeAddress: `0x${string}`,
  signerAddress: `0x${string}`,
): { to: `0x${string}`; data: `0x${string}` } {
  const sig = ('0x' +
    signerAddress.slice(2).toLowerCase().padStart(64, '0') +
    '0'.repeat(64) +
    '01') as `0x${string}`;

  return {
    to: safeAddress,
    data: encodeFunctionData({
      abi: SAFE_EXEC_ABI,
      functionName: 'execTransaction',
      args: [innerTx.to, 0n, innerTx.data, 0, 0n, 0n, 0n, _zero, _zero, sig],
    }),
  };
}

// Selectors derived from the ABIs above — slice the first 4 bytes of encoded calldata
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
