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
  commitment: 'confirmed'
  // multisigPda: '<existing multisig address>'
})

const account = await wallet.getAccount(0)

// Create (deploy) a new Squads multisig
const { hash } = await account.deploy()
console.log('Multisig address:', await account.getAddress())
console.log('Create tx:', hash)

account.dispose()
```

## Key Capabilities

- **Seed-Derived Accounts**: Derive multisig accounts from a BIP-39 seed phrase using SLIP-0010 paths
- **Create Multisig**: Deploy a new Squads multisig with configurable members and threshold
- **Propose / Approve / Reject / Execute**: Full multisig transaction lifecycle
- **Transfers**: Propose native SOL and SPL token transfers through the multisig vault
- **Member Management**: Add, remove, or swap members and change the approval threshold
- **Message Proposals**: Propose and approve off-chain message signatures
- **Read-Only Support**: Inspect multisig state without a signing key

## Compatibility

- **Solana Mainnet Beta**
- **Solana Testnet**
- **Solana Devnet**
- **Standard Solana RPC Providers**

## Community

Join the [WDK Discord](https://discord.gg/arYXDhHB2w) to connect with other developers.

## Support

For support, please [open an issue](https://github.com/tetherto/wdk-protocol-multisig-squads/issues) on GitHub or reach out via [email](mailto:wallet-info@tether.io).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
