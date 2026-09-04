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
- **Pluggable Coordinator**: Swap how transactions are signed and broadcast without touching the operations

> [!NOTE]
> Multisig message signing is not part of this module. It is an optional addon of the shared
> multisig interface (`IMultisigMessageSigning`), and Solana has no message-signing primitive a
> program-derived address could use, so the module leaves the addon out rather than stubbing it.
> `sign(message)` still signs with the member's own key.

## Transaction Options

One options object runs through the whole lifecycle, so a note or a vault choice is passed the
same way wherever it applies:

```javascript
// vaultIndex: the vault to spend from, 0 to 255 (default: 0)
// memo: a note recorded on chain with the call
// autoExecute: execute in the same transaction, when this call completes the approvals
await account.propose(tx, { vaultIndex: 0, memo: 'payroll', autoExecute: true })
await account.proposeTransfer(transferOptions, { memo: 'payroll' })

await account.approveProposal(proposalId, { memo: 'looks good', autoExecute: true })
await account.rejectProposal(proposalId, { memo: 'wrong recipient' })

await account.executeProposal(proposalId)
```

`vaultIndex` bears on `propose` and `proposeTransfer` only, and `autoExecute` on everything but
`rejectProposal`, which executes nothing whatever the votes say. `memo` applies to all four.
`executeProposal` takes no options. A memo rides in the instruction's data rather than in an
account, so it adds no rent, and an empty string is a present-but-empty memo rather than none.

`autoExecute` saves the separate `executeProposal` round trip when the same call already
carries the last approval the proposal needs:

- On `propose` and `proposeTransfer`, that means a **threshold of 1**, so it is a 1-of-1 and
  test-setup convenience.
- On `approveProposal`, it means **this approval reaching the threshold**, so the last approver
  of a 3-of-5 applies the transaction in the same transaction as their vote.

It also needs no time lock on the multisig and a signer holding `Execute` on top of the vote.
The two instructions ride in one transaction, so an execution that fails on chain takes the
approval down with it: the vote is not recorded and the proposal stays open, rather than being
approved and left stuck.

> [!NOTE]
> Where `autoExecute` cannot apply it is dropped silently rather than throwing, so branch on
> the result's `status`, which is `'executed'` when it ran and `'pending'` when it did not.
> Either way the result's `transaction` holds the hash and fee of the transaction the call sent,
> since on Solana a proposal is itself an on-chain transaction. `status` is what says whether that
> transaction also executed the proposal.

## Transactions and Coordinators

Every write this package makes goes through one seam. The account builds the Squads instructions,
and a **coordinator** signs them and puts them on the cluster. Omit the option and the account gets
a `LocalSignerCoordinator`, which signs with the member key derived from your seed and broadcasts at
once, the behaviour the package has always had.

```javascript
import { IMultisigCoordinator } from '@tetherto/wdk-protocol-multisig-squads'

class MyCoordinator extends IMultisigCoordinator {
  constructor (signerAccount) {
    super()
    this._signerAccount = signerAccount
  }

  // Sign `tx.instructions` however you like, then broadcast. Resolve once it has landed.
  async sendTransaction (tx) {
    return this._signerAccount.sendTransaction(tx)
  }

  // Erase whatever key material you created. The signer account above belongs to the caller.
  dispose () {
    this._signerAccount = undefined
  }
}

const wallet = new WalletManagerMultisigSolanaSquads(seedPhrase, {
  provider: 'https://api.devnet.solana.com',
  multisigPdaOrCreateKey: '<existing multisig address>',
  coordinator: (signerAccount) => new MyCoordinator(signerAccount)
})
```

`coordinator` takes a factory rather than an instance because one configuration is shared by every
account the manager derives, and each of those signs with a different key. A coordinator moves
transactions and does not own an identity: the account always votes as the member it derived.

> [!NOTE]
> Squads keeps its votes on chain, one transaction per vote, so a coordinator here is about reaching
> the cluster and nothing else: it stores no proposals and shares no messages. Proposals and votes
> are read from the chain through the read-only account. A peer-to-peer coordinator that collects
> member signatures before broadcasting fits this interface and is not part of this package yet.

## Fees, rent, and who pays

Three payers, and one call can involve all three:

- **The fee payer** signs the transaction and pays the Solana network fee. It is whatever the
  coordinator provides: the member itself by default, or a paymaster when the coordinator is built
  over a sponsoring wallet such as `@tetherto/wdk-wallet-solana-gasless`.
- **The rent payer** funds the accounts Squads creates. Set it with the `rentPayer` config
  option; it defaults to the signer. It has to sign the transaction by other means, which in
  practice makes it the fee payer of a sponsoring wallet.
- **The vault** funds whatever the proposed transaction itself does, a recipient's associated
  token account included. No member ever pays for the payload.

| Call | Who must sign | Rent it creates | Charged to |
|---|---|---|---|
| `deploy` | the signer, plus the create key, which `createKeySecret` signs for you | the multisig account, sized by member count, plus the Squads treasury creation fee | `rentPayer`, else the signer |
| `propose`, `proposeTransfer`, `addOwner`, `removeOwner`, `swapOwner`, `changeThreshold` | a member holding `Initiate` | the transaction account, sized by the message, plus the proposal account | `rentPayer`, else the member |
| `approveProposal`, `rejectProposal` | a member holding `Vote` | none | network fee only |
| `executeProposal` for a transfer or other vault transaction | a member holding `Execute` | none | network fee only; the vault funds the transaction itself |
| `executeProposal` for an owner or threshold change | a member holding `Execute` | growth of the multisig account when the change adds a member | the executing member, even when `rentPayer` is set |

The `transaction.fee` a propose-family call reports is the network fee plus that rent, the same basis
`quotePropose` and `quoteTransfer` use, so a quote and the call it quotes agree. `deploy` sets
no rent collector, so rent stays locked for the life of the accounts rather than being
reclaimable on close.

> [!WARNING]
> That sum holds only while the coordinator charges in lamports. A paymaster that bills in a fee
> token, which is what a coordinator built over `@tetherto/wdk-wallet-solana-gasless` does, has its
> token charge added to a lamport rent figure, and the reported `fee` is then two currencies in one
> number: the coordinator's own result carries the token charge, and what remains is the rent, in
> lamports. Read the two from there rather than from `fee`.

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
[tests/integration/fixtures/README.md](tests/integration/fixtures/README.md).

## Community

Join the [WDK Discord](https://discord.gg/arYXDhHB2w) to connect with other developers.

## Support

For support, please [open an issue](https://github.com/tetherto/wdk-protocol-multisig-squads/issues) on GitHub or reach out via [email](mailto:wallet-info@tether.io).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
