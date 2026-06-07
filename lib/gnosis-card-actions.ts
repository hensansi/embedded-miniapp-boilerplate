import { encodeFunctionData } from 'viem';

const DELAY_MODULE_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
    ],
    name: 'execTransactionFromModule',
    outputs: [{ name: 'success', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
    ],
    name: 'executeNextTx',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Queue a tx through the Zodiac Delay module (step 1 of 2).
// Caller must be an enabled module on the Delay clone (connected wallet is).
export function buildQueueDelayTx(
  delayModule: `0x${string}`,
  to: `0x${string}`,
  data: `0x${string}`,
): { to: `0x${string}`; data: `0x${string}` } {
  return {
    to: delayModule,
    data: encodeFunctionData({
      abi: DELAY_MODULE_ABI,
      functionName: 'execTransactionFromModule',
      args: [to, 0n, data, 0],
    }),
  };
}

// Execute the next queued tx on the Delay module (step 2 of 2, after txCooldown has passed).
// Params must match exactly what was passed in step 1.
export function buildExecuteDelayTx(
  delayModule: `0x${string}`,
  to: `0x${string}`,
  data: `0x${string}`,
): { to: `0x${string}`; data: `0x${string}` } {
  return {
    to: delayModule,
    data: encodeFunctionData({
      abi: DELAY_MODULE_ABI,
      functionName: 'executeNextTx',
      args: [to, 0n, data, 0],
    }),
  };
}
