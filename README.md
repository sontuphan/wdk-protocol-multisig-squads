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
- **Pluggable Coordinator**: Collect the members' approvals into one transaction, or swap how they are signed, without touching the operations

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

A proposal that needs N approvals costs N+2 transactions on Squads: one to create it, one per
approval, one to execute. A **coordinator** is what turns that into three. The account builds the
Squads instructions; the coordinator signs each approval it is handed and holds the message for the
next member to add to, so one transaction carries them all once the threshold is reached. Only
that one carries several signatures: creating a proposal, rejecting it and executing it are one
member's own transaction each and never reach a coordinator. Omit the option and there is no
coordinator at all: every vote is the member's own transaction, signed with the key derived from
your seed and broadcast at once.

```javascript
import { IMultisigCoordinator } from '@tetherto/wdk-protocol-multisig-squads'

class MyCoordinator extends IMultisigCoordinator {
  // The configuration is a `CoordinatorSigner`: `getAddress()` names the member and
  // `partiallySignTransaction(tx)` adds its signature to a compiled transaction, leaving the
  // others alone. Widen it with whatever else you need, a service URL or a peer list; what you
  // never get is the member's key.
  constructor (config) {
    super(config)
    this._held = new Map()
  }

  // Approvals that do not fill the threshold yet. Keep the transaction for the next member, and
  // resolve once whatever eventually carries them has landed: `hash` is never null.
  async submitProposal (proposalId, proposal) {
    this._held.set(proposalId, proposal)

    return this._landed(proposalId)
  }

  // The transaction you are collecting approvals in, or null when you hold none for this
  // proposal. The next member's approval is appended to its instructions, so they pile up in one
  // transaction rather than one each. Approvals are all it may carry: see below.
  async getProposal (proposalId) {
    return this._held.get(proposalId) ?? null
  }

  // Put this member's signature on the message and hand it back. How it travels is up to you: a
  // signer on the approval that names the member, or a `NoopSigner` slot you fill later. This is
  // also where you refuse one you should not sign: throw if a member appears twice.
  async confirmProposal (proposal) {
    return this._sign(proposal)
  }
}

const wallet = new WalletManagerMultisigSolanaSquads(seedPhrase, {
  provider: 'https://api.devnet.solana.com',
  multisigPdaOrCreateKey: '<existing multisig address>',
  coordinator: (config) => new MyCoordinator(config)
})
```

A coordinator handles approvals and nothing else. `getProposal` is what makes them accumulate,
handing back the message you are holding so the next member's `approveProposal` can append its own
and count the ones it finds there towards the threshold; return null and that member votes alone.
Short of the threshold the message goes to `submitProposal`, which keeps it, since broadcasting
would waste a fee on a proposal that cannot execute yet. At the threshold the account broadcasts it
through the member's own signer account, which signs as fee payer.

> [!IMPORTANT]
> Every instruction in the message `getProposal` returns must be one member's approval of that
> proposal, and nothing else. The account counts what it finds there towards the threshold without
> inspecting it, so a rejection, an execution or padding of any kind is malformed and counts as
> that many approvals: enough of it and a proposal is broadcast, or auto-executed, on approvals it
> does not have. The message `submitProposal` was handed is already of that shape, so returning
> what you were given satisfies this without checking; if you batch anything else, keep it out of
> what `getProposal` hands back. At most one of those approvals may be any one member's, and
> `confirmProposal` is where a second one is caught: it is the only method handed the complete
> list, the member's own approval included, and the account's own guard cannot help because it
> reads the cluster, which has not recorded an approval that is still circulating. Refuse by
> throwing `ValueError`, which this package re-exports and which is what the account itself raises
> when the cluster shows the same member has already approved, so both halves of the condition
> surface the same way.

`confirmProposal` is where the other members' signatures come from, and the contract takes no view
on how you carry them: a signer on the instruction that names the member travels with the message,
while a `NoopSigner` marks that member as a signer without signing, for a signature you collect over
the compiled bytes later. Either way the marker goes on the approval of a member that has already
voted, since that is the only instruction of theirs in the message.

`coordinator` takes a factory rather than an instance because one configuration is shared by every
account the manager derives, and each signs with a different key. The factory is handed a
`CoordinatorSigner`, `{ getAddress, partiallySignTransaction }` over that member's key rather than
the account holding it, so a coordinator can name the member and add its signature and can read
neither the key nor anything else. That object is its configuration, which an implementation is
free to widen, a service URL or a transport; the base class is generic over it. And since a
coordinator holds no key and no identity of its own, there is nothing for it to dispose.

> [!NOTE]
> Squads keeps its votes on chain, so a coordinator stores no proposals and shares no messages: all
> it holds is the message still being signed, and every read comes from the chain through the
> read-only account.

> [!TIP]
> A `TransactionMessage` is not compiled, which is what lets the next approval be appended to it,
> and is also why no signature can exist on it yet: there are no bytes to sign. One rule applies
> whichever way you carry them: the member that broadcasts must not appear as a signer on the
> message, since its account signs as fee payer and `@solana/kit` refuses two distinct signers for
> one address.

## Fees, rent, and who pays

Three payers, and one call can involve all three:

- **The fee payer** signs the transaction and pays the Solana network fee. It is the member whose
  account broadcasts, since that is where every transaction is sent from.
- **The rent payer** funds the accounts Squads creates. Set it with the `rentPayer` config
  option; it defaults to the signer. It has to sign the transaction by other means, which nothing
  in this package currently provides.
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

> [!NOTE]
> An approval that a coordinator is still circulating has not been paid for yet: the `fee` it
> reports is whatever the coordinator answered with, and the transaction that eventually carries it
> pays once for the batch.

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
