# @tetherto/wdk-protocol-multisig-squads

[![npm version](https://img.shields.io/npm/v/%40tetherto%2Fwdk-protocol-multisig-squads?style=flat-square)](https://www.npmjs.com/package/@tetherto/wdk-protocol-multisig-squads)
[![npm downloads](https://img.shields.io/npm/dw/%40tetherto%2Fwdk-protocol-multisig-squads?style=flat-square)](https://www.npmjs.com/package/@tetherto/wdk-protocol-multisig-squads)
[![license](https://img.shields.io/npm/l/%40tetherto%2Fwdk-protocol-multisig-squads?style=flat-square)](https://github.com/tetherto/wdk-protocol-multisig-squads/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-docs.wdk.tether.io-0A66C2?style=flat-square)](https://docs.wdk.tether.io/)

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A simple and secure package to manage [Squads](https://squads.so/) multisig wallets on the Solana blockchain. It follows the same wallet **manager / account** model as [`@tetherto/wdk-wallet-solana`](https://www.npmjs.com/package/@tetherto/wdk-wallet-solana), deriving multisig accounts from a BIP-39 seed phrase and exposing a clean API for creating multisigs and proposing, approving, and executing multisig transactions.

## About WDK

This module is part of the [**WDK (Wallet Development Kit)**](https://docs.wdk.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control.

For detailed documentation about the complete WDK ecosystem, visit [docs.wdk.tether.io](https://docs.wdk.tether.io).

## Installation

```bash
npm install @tetherto/wdk-protocol-multisig-squads
```

## Quick Start

```javascript
import WalletManagerMultisigSolanaSquads from '@tetherto/wdk-protocol-multisig-squads'

const seedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const wallet = new WalletManagerMultisigSolanaSquads(seedPhrase, {
  provider: 'https://api.devnet.solana.com',
  commitment: 'confirmed',
  // The multisig's address derives from this key, so keep it: without it the address —
  // and anything in its vault — cannot be recovered.
  createKeySecret: '<base58 32-byte private key or 64-byte keypair>'
  // multisigPdaOrCreateKey: '<existing multisig address>'
})

const account = await wallet.getAccount(0)

// Create (deploy) a new Squads multisig. Defaults to this account's signer as the sole
// owner with a threshold of 1; pass owners and a threshold for anything else.
const { hash } = await account.deploy()
console.log('Multisig address:', await account.getAddress())
console.log('Create tx:', hash)

account.dispose()
```

> [!IMPORTANT]
> `createKeySecret` is required to create a multisig, and is the only way to recover its
> address later. To attach to an existing multisig instead, pass `multisigPdaOrCreateKey` and
> omit it: it takes the multisig's address, or the create key that address derives from, and
> tells the two apart by curve membership.

## Key Capabilities

- **Seed-Derived Accounts**: Derive multisig accounts from a BIP-39 seed phrase using SLIP-0010 paths
- **Create Multisig**: Deploy a new Squads multisig with configurable members and threshold
- **Propose / Approve / Reject / Execute**: Full multisig transaction lifecycle
- **Transfers**: Propose native SOL and SPL token transfers through the multisig vault
- **Member Management**: Add, remove, or swap members and change the approval threshold
- **Read-Only Support**: Inspect multisig state without a signing key
- **Pluggable Transport**: Swap how transactions are signed and broadcast without touching the operations

> [!NOTE]
> Multisig message signing is not part of this module. It is an optional addon of the shared
> multisig interface (`IMultisigMessageSigning`), and Solana has no message-signing primitive a
> program-derived address could use, so the module leaves the addon out rather than stubbing it.
> `sign(message)` still signs with the member's own key.

## Transactions and Transports

Every write this package makes goes through one seam. The account builds the Squads instructions,
and a **transport** signs them and puts them on the cluster. Omit the option and the account signs
with the member key derived from your seed and broadcasts at once, which is the behaviour the
package has always had.

```javascript
import { ISquadsTransactionTransport } from '@tetherto/wdk-protocol-multisig-squads'

class MyTransport extends ISquadsTransactionTransport {
  constructor (signerAccount) {
    super()
    this._signerAccount = signerAccount
  }

  // The member this transport votes as. The account builds every instruction for it.
  async getSignerAddress () {
    return this._signerAccount.getAddress()
  }

  // Sign `tx.instructions` however you like, then broadcast. Resolve once it has landed.
  async sendTransaction (tx) {
    return this._signerAccount.sendTransaction(tx)
  }

  // Erase whatever key material you created. The signer account above belongs to the caller.
  dispose () {
    this._signerAccount = null
  }
}

const wallet = new WalletManagerMultisigSolanaSquads(seedPhrase, {
  provider: 'https://api.devnet.solana.com',
  multisigPdaOrCreateKey: '<existing multisig address>',
  transport: (signerAccount) => new MyTransport(signerAccount)
})
```

`transport` takes a factory rather than an instance because one configuration is shared by every
account the manager derives, and each of those signs with a different key.

> [!NOTE]
> Squads keeps its votes on chain, one transaction per vote, so a transport here is about reaching
> the cluster and nothing else: it stores no proposals and shares no messages. Proposals and votes
> are read from the chain through the read-only account. A peer-to-peer transport that collects
> member signatures before broadcasting fits this interface and is not part of this package yet.

## Squads Protocol Version

> [!IMPORTANT]
> This package targets **Squads Protocol v4**, the live version. Program ID:
>
> ```
> SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf
> ```
>
> v3 (**"Squads Legacy"**) is a different program with a different account layout. Its documentation lives under [`/main/squads-legacy/*`](https://docs.squads.so/main/squads-legacy/getting-started/whats-a-squad.md) — do not use it as a reference for this package. Use the [v4 development docs](https://docs.squads.so/main/development/introduction/what-is-squads-protocol.md) instead.

## Compatibility

- **Solana Mainnet Beta**
- **Solana Testnet**
- **Solana Devnet**
- **Standard Solana RPC Providers**

## Testing

```sh
npm test                  # unit tests
npm run test:integration  # against a local validator running the real Squads program
```

The integration suite starts and stops its own `solana-test-validator`, so it needs only
that binary on `PATH`; the Squads program it loads is committed to the repository. See
[tests/integration/README.md](tests/integration/README.md).

## Community

Join the [WDK Discord](https://discord.gg/arYXDhHB2w) to connect with other developers.

## Support

For support, please [open an issue](https://github.com/tetherto/wdk-protocol-multisig-squads/issues) on GitHub or reach out via [email](mailto:wallet-info@tether.io).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
