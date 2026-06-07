import { Core } from '@walletconnect/core'
import { Web3Wallet } from '@walletconnect/web3wallet'

export type { Web3WalletTypes } from '@walletconnect/web3wallet'
export type WCWallet = Awaited<ReturnType<typeof Web3Wallet.init>>

const WC_PROJECT_ID = 'a013fb32e0d170ec6b6d0f842e960bd6'

export async function initWallet(): Promise<WCWallet> {
  const core = new Core({ projectId: WC_PROJECT_ID })
  return Web3Wallet.init({
    core,
    metadata: {
      name: 'Circles Safe',
      description: 'Sign transactions with your Circles Safe passkey',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://circles.gnosis.io',
      icons: [],
    },
  })
}
