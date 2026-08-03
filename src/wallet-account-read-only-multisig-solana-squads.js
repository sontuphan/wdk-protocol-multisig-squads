// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

import { WalletAccountReadOnly, NotImplementedError } from '@tetherto/wdk-wallet'

import FailoverProvider from '@tetherto/wdk-failover-provider'

import { createSolanaRpc } from '@solana/rpc'

import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses'

import { getBase58Decoder, getBase58Encoder, getBase64Encoder } from '@solana/codecs'

import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'

/** @typedef {ReturnType<typeof import('@solana/rpc').createSolanaRpc>} SolanaRpc */
/** @typedef {import('@solana/rpc-types').Commitment} Commitment */
/** @typedef {import('@solana/addresses').Address} Address */

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnlyMultisig} IWalletAccountReadOnlyMultisig */
/** @typedef {import('@tetherto/wdk-wallet').MultisigInfo} MultisigInfo */
/** @typedef {import('@tetherto/wdk-wallet').MessageInfo} MessageInfo */
/** @typedef {import('@tetherto/wdk-wallet').MultisigProposal} MultisigProposal */

/** @typedef {import('@tetherto/wdk-wallet-solana').SimpleSolanaTransaction} SimpleSolanaTransaction */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransactionReceipt} SolanaTransactionReceipt */

/**
 * @typedef {Object} SolanaMultisigSquadsCommonConfig
 * @property {string | string[]} provider - A Solana RPC URL, or a list of URLs for failover.
 * @property {Commitment} [commitment='confirmed'] - The commitment level for transactions.
 * @property {number} [retries=3] - The number of retries for the failover provider.
 * @property {string} [programId] - An override for the Squads program address.
 * @property {string} [multisigPda] - The address of an existing Squads multisig to operate on.
 * @property {string} [createKey] - The create key used to derive a new multisig PDA on creation.
 */

/**
 * @typedef {Object} SolanaMultisigSquadsSigningConfig
 * @property {number | bigint} [createMaxFee] - The maximum fee amount for the create/deploy operation.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfers.
 */

/** @typedef {SolanaMultisigSquadsCommonConfig & SolanaMultisigSquadsSigningConfig} SolanaMultisigSquadsConfig */

/** @typedef {SolanaMultisigSquadsCommonConfig} SolanaMultisigSquadsReadOnlyConfig */

export const DEFAULT_COMMITMENT = 'confirmed'

export const SQUADS_PROGRAM_ADDRESS = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf'

const MULTISIG_DISCRIMINATOR = Uint8Array.from([224, 116, 121, 186, 68, 161, 79, 236])

const MULTISIG_THRESHOLD_OFFSET = 72
const MULTISIG_TRANSACTION_INDEX_OFFSET = 78
const MULTISIG_RENT_COLLECTOR_OFFSET = 94

const OPTION_TAG_SIZE = 1
const ADDRESS_SIZE = 32
const BUMP_SIZE = 1
const MEMBER_COUNT_SIZE = 4
const MEMBER_SIZE = ADDRESS_SIZE + 1
const TRANSACTION_INDEX_SIZE = 8
const SIGNATURE_SIZE = 64

const SEED_PREFIX = 'multisig'
const SEED_MULTISIG = 'multisig'
const SEED_VAULT = 'vault'

const DEFAULT_VAULT_INDEX = 0
const MAX_VAULT_INDEX = 255

/**
 * Read-only Solana Squads multisig wallet account.
 * Provides query-only operations for Squads multisig wallets.
 *
 * @implements {IWalletAccountReadOnlyMultisig}
 */
export default class WalletAccountReadOnlyMultisigSolanaSquads extends WalletAccountReadOnly {
  /**
   * Creates a new read-only Solana Squads multisig wallet account.
   *
   * @param {string | null} signerAddress - The signer's address, or null for pure read-only.
   * @param {SolanaMultisigSquadsReadOnlyConfig} config - The configuration object.
   */
  constructor (signerAddress, config) {
    super(signerAddress ?? undefined)

    /**
     * The multisig Squads configuration.
     *
     * @protected
     * @type {SolanaMultisigSquadsReadOnlyConfig}
     */
    this._config = config

    /**
     * The signer's address.
     *
     * @protected
     * @type {string | null}
     */
    this._signerAddress = signerAddress ?? null

    /**
     * The address of the Squads multisig account.
     * Lazily populated by {@link getAddress} when only a `createKey` is configured.
     *
     * @protected
     * @type {string | null}
     */
    this._multisigPda = config.multisigPda ?? null

    /**
     * The create key used to derive the multisig address, if configured.
     *
     * @protected
     * @type {string | null}
     */
    this._createKey = config.createKey ?? null

    /**
     * The address of the Squads program to operate against.
     *
     * @protected
     * @type {Address}
     */
    this._programId = address(config.programId ?? SQUADS_PROGRAM_ADDRESS)

    /**
     * The commitment level for transactions.
     *
     * @protected
     * @type {Commitment}
     */
    this._commitment = config.commitment ?? DEFAULT_COMMITMENT

    const { provider, retries = 3 } = config

    /**
     * A Solana RPC client for HTTP requests.
     *
     * @protected
     * @type {SolanaRpc}
     */
    this._rpc = Array.isArray(provider)
      ? this._createFailoverRpc(provider, retries)
      : createSolanaRpc(provider)
  }

  /** @private */
  _createFailoverRpc (urls, retries) {
    const failoverProvider = new FailoverProvider({ retries })

    for (const url of urls) {
      failoverProvider.addProvider(createSolanaRpc(url))
    }

    return failoverProvider.initialize()
  }

  /**
   * Returns the signer's address.
   *
   * @returns {Promise<string | null>} The signer's address.
   */
  async getSignerAddress () {
    return this._signerAddress
  }

  /**
   * Returns the address of the Squads multisig account.
   *
   * Uses the configured `multisigPda` when present, otherwise derives it from the
   * configured `createKey`. The derived address is memoized, since the derivation
   * is deterministic.
   *
   * @returns {Promise<string>} The multisig address.
   * @throws {Error} If neither `multisigPda` nor `createKey` is configured.
   */
  async getAddress () {
    if (this._multisigPda) {
      return this._multisigPda
    }

    if (!this._createKey) {
      throw new Error(
        'No multisig address is configured. Provide `multisigPda` or `createKey` in the config.'
      )
    }

    const [multisigPda] = await getProgramDerivedAddress({
      programAddress: this._programId,
      seeds: [
        SEED_PREFIX,
        SEED_MULTISIG,
        getAddressEncoder().encode(address(this._createKey))
      ]
    })

    this._multisigPda = multisigPda

    return multisigPda
  }

  /**
   * Returns whether the multisig account exists on-chain.
   *
   * Squads deploys no program per multisig — the Squads program is shared by every
   * multisig on the network. This reports whether the `Multisig` account at this
   * account's address has been created (by `multisigCreateV2`), which is what
   * `deploy()` does.
   *
   * Note that just after `deploy()` resolves this may still return `false`, until
   * the creating transaction reaches this account's commitment level.
   *
   * @returns {Promise<boolean>} Whether the multisig account exists.
   * @throws {Error} If no address is configured, or if the RPC request fails.
   */
  async isDeployed () {
    const multisigPda = await this.getAddress()

    const { value } = await this._rpc
      .getAccountInfo(address(multisigPda), {
        commitment: this._commitment,
        encoding: 'base64',
        dataSlice: { offset: 0, length: MULTISIG_DISCRIMINATOR.length }
      })
      .send()

    if (!value) {
      return false
    }

    if (value.owner !== this._programId) {
      return false
    }

    return this._hasMultisigDiscriminator(getBase64Encoder().encode(value.data[0]))
  }

  /** @private */
  _hasMultisigDiscriminator (data) {
    if (data.length < MULTISIG_DISCRIMINATOR.length) {
      return false
    }

    return MULTISIG_DISCRIMINATOR.every((byte, i) => byte === data[i])
  }

  /**
   * Returns the addresses of the multisig's members, in on-chain order.
   *
   * Note that Squads members carry permissions (proposer / voter / executor) that
   * this list does not express: the number of members is **not** the denominator
   * of {@link getThreshold}, since only members holding the voter permission can
   * approve a proposal.
   *
   * @returns {Promise<string[]>} The member addresses.
   * @throws {Error} If the multisig account does not exist, or if the RPC request fails.
   */
  async getOwners () {
    const { address: multisigPda, owners, isCreated } = await this.getMultisigInfo()

    if (!isCreated) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before reading its members.`
      )
    }

    return owners
  }

  /**
   * Returns the number of approvals a proposal needs before it can be executed.
   *
   * Note that only members holding the voter permission can approve, so this is
   * **not** a fraction of {@link getOwners}'s length: a multisig can hold members
   * that are unable to vote.
   *
   * @returns {Promise<number>} The threshold.
   * @throws {Error} If the multisig account does not exist, or if the RPC request fails.
   */
  async getThreshold () {
    const { address: multisigPda, threshold, isCreated } = await this.getMultisigInfo()

    if (!isCreated) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before reading its threshold.`
      )
    }

    return threshold
  }

  /**
   * Returns aggregated information about the multisig.
   *
   * This is the single account read the other accessors are derived from:
   * {@link getOwners} and {@link getThreshold} both delegate here, so every field
   * they return comes from one consistent snapshot.
   *
   * When `isCreated` is `false` the multisig does not exist on chain yet, and
   * `owners` and `threshold` are placeholders that must not be read — they are `[]`
   * and `0` regardless of what a future multisig at this address would hold.
   *
   * @returns {Promise<MultisigInfo>} The multisig info.
   * @throws {Error} If the address holds a non-Squads account, or if the RPC request fails.
   */
  async getMultisigInfo () {
    const multisigPda = await this.getAddress()

    const { value } = await this._rpc
      .getAccountInfo(address(multisigPda), {
        commitment: this._commitment,
        encoding: 'base64'
      })
      .send()

    if (!value) {
      return { address: multisigPda, owners: [], threshold: 0, isCreated: false }
    }

    const data = getBase64Encoder().encode(value.data[0])

    if (value.owner !== this._programId || !this._hasMultisigDiscriminator(data)) {
      throw new Error(`The account ${multisigPda} is not a Squads multisig.`)
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const addressDecoder = getBase58Decoder()

    const threshold = view.getUint16(MULTISIG_THRESHOLD_OFFSET, true)

    let offset = MULTISIG_RENT_COLLECTOR_OFFSET + OPTION_TAG_SIZE
    if (data[MULTISIG_RENT_COLLECTOR_OFFSET] === 1) {
      offset += ADDRESS_SIZE
    }

    offset += BUMP_SIZE

    const count = view.getUint32(offset, true)
    offset += MEMBER_COUNT_SIZE

    const owners = []

    for (let i = 0; i < count; i++) {
      owners.push(addressDecoder.decode(data.subarray(offset, offset + ADDRESS_SIZE)))
      offset += MEMBER_SIZE
    }

    return { address: multisigPda, owners, threshold, isCreated: true }
  }

  /**
   * Returns the current transaction index (nonce) of the multisig.
   *
   * This is the index of the **most recently created** transaction, or `0n` when
   * none has been created yet. A new proposal takes the next index, so callers
   * creating one want `await getNonce() + 1n` rather than this value.
   *
   * @returns {Promise<bigint>} The transaction index.
   * @throws {Error} If the multisig account does not exist, or if the RPC request fails.
   */
  async getNonce () {
    const multisigPda = await this.getAddress()

    const { value } = await this._rpc
      .getAccountInfo(address(multisigPda), {
        commitment: this._commitment,
        encoding: 'base64',
        dataSlice: {
          offset: 0,
          length: MULTISIG_TRANSACTION_INDEX_OFFSET + TRANSACTION_INDEX_SIZE
        }
      })
      .send()

    if (!value) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before reading its transaction index.`
      )
    }

    const data = getBase64Encoder().encode(value.data[0])

    if (value.owner !== this._programId || !this._hasMultisigDiscriminator(data)) {
      throw new Error(`The account ${multisigPda} is not a Squads multisig.`)
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

    return view.getBigUint64(MULTISIG_TRANSACTION_INDEX_OFFSET, true)
  }

  /**
   * Returns the address of one of the multisig's vaults.
   *
   * Vaults are where a Squads multisig holds its funds, so this is **not** the
   * address returned by {@link getAddress}: that one identifies the multisig and
   * holds only its rent. Index `0` is the main treasury; higher indices are the
   * sub-accounts the Squads app exposes.
   *
   * @param {number | string} [vaultIndexOrAddress=0] - A vault index between 0 and 255,
   *   or a vault address to use as given.
   * @returns {Promise<string>} The vault address.
   * @throws {Error} If the index is out of range, or the address is not valid base58.
   */
  async getVaultAddress (vaultIndexOrAddress = DEFAULT_VAULT_INDEX) {
    if (typeof vaultIndexOrAddress === 'string') {
      return address(vaultIndexOrAddress)
    }

    if (
      !Number.isInteger(vaultIndexOrAddress) ||
      vaultIndexOrAddress < DEFAULT_VAULT_INDEX ||
      vaultIndexOrAddress > MAX_VAULT_INDEX
    ) {
      throw new Error(
        `Invalid vault index ${vaultIndexOrAddress}. It must be an integer between ${DEFAULT_VAULT_INDEX} and ${MAX_VAULT_INDEX}.`
      )
    }

    const multisigPda = await this.getAddress()

    const [vaultPda] = await getProgramDerivedAddress({
      programAddress: this._programId,
      seeds: [
        SEED_PREFIX,
        getAddressEncoder().encode(address(multisigPda)),
        SEED_VAULT,
        Uint8Array.of(vaultIndexOrAddress)
      ]
    })

    return vaultPda
  }

  /**
   * Returns the native SOL balance of one of the multisig's vaults.
   *
   * Returns `0n` when the vault holds nothing, which is also the case when it has
   * never been funded and therefore has no account on chain yet.
   *
   * Not all of this balance is transferable in a single instruction: a transfer must
   * leave the vault either empty or above the rent-exempt minimum.
   *
   * @param {number | string} [vaultIndexOrAddress=0] - A vault index between 0 and 255,
   *   or a vault address to read as given.
   * @returns {Promise<bigint>} The balance in lamports.
   * @throws {Error} If the vault cannot be resolved, or if the RPC request fails.
   */
  async getBalance (vaultIndexOrAddress = DEFAULT_VAULT_INDEX) {
    const vaultPda = await this.getVaultAddress(vaultIndexOrAddress)

    const { value } = await this._rpc
      .getBalance(address(vaultPda), { commitment: this._commitment })
      .send()

    return value
  }

  /**
   * Returns the balance of an SPL token held by one of the multisig's vaults.
   *
   * Tokens are held in a token account owned by the vault, not in the vault account
   * itself, so this reads the vault's associated token account for the given mint.
   * Returns `0n` when the vault holds none of the token, including when no associated
   * token account exists for it yet.
   *
   * @todo Only legacy SPL Token mints are supported. The associated token account is
   *   derived with the SPL Token program as a seed, so a Token-2022 mint resolves to a
   *   different address that does not exist, and this reports `0n` for a real balance.
   *   Revisit by resolving the mint's owning program, or by looking accounts up with
   *   `getTokenAccountsByOwner` filtered by mint, which is program-agnostic. See
   *   `docs/getTokenBalance.md` §2 for a mainnet example of the wrong answer.
   *
   * @param {string} tokenAddress - The SPL token mint address.
   * @param {number | string} [vaultIndexOrAddress=0] - A vault index between 0 and 255,
   *   or a vault address to read as given.
   * @returns {Promise<bigint>} The token balance (in base unit).
   * @throws {Error} If the mint address is malformed, or if the RPC request fails.
   */
  async getTokenBalance (tokenAddress, vaultIndexOrAddress = DEFAULT_VAULT_INDEX) {
    const mint = address(tokenAddress)
    const vaultPda = await this.getVaultAddress(vaultIndexOrAddress)

    const [ata] = await findAssociatedTokenPda({
      mint,
      owner: address(vaultPda),
      tokenProgram: TOKEN_PROGRAM_ADDRESS
    })

    const { value } = await this._rpc
      .getAccountInfo(ata, { commitment: this._commitment, encoding: 'jsonParsed' })
      .send()

    if (!value) {
      return 0n
    }

    return BigInt(value.data.parsed.info.tokenAmount.amount)
  }

  /** @private */
  _isSignature (hash) {
    if (typeof hash !== 'string') {
      return false
    }

    try {
      return getBase58Encoder().encode(hash).length === SIGNATURE_SIZE
    } catch {
      return false
    }
  }

  /**
   * Returns the receipt of a transaction, or `null` if the RPC has no record of it.
   *
   * This reports on a single Solana transaction and is not proposal-aware: a Squads
   * proposal spans a creation, one approval per voter, and an execution, each with its
   * own signature. Use {@link getProposals} to ask about a proposal's state.
   *
   * A returned receipt does **not** imply the transaction succeeded — a failed
   * transaction is still included in a block and has a receipt, with `meta.err` set.
   * Note also that `null` covers both "not confirmed yet" and "no longer served by
   * this node", since nodes retain transaction history for a limited window.
   *
   * A configured commitment of `processed` is raised to `confirmed`, because the
   * underlying RPC method rejects anything lower and a receipt cannot exist for an
   * unconfirmed transaction.
   *
   * @param {string} hash - The transaction signature.
   * @returns {Promise<SolanaTransactionReceipt | null>} The receipt, or null if the
   *   transaction was not found.
   * @throws {Error} If the signature is malformed, or if the RPC request fails.
   */
  async getTransactionReceipt (hash) {
    if (!this._isSignature(hash)) {
      throw new Error(`Invalid transaction signature: ${hash}`)
    }

    return this._rpc
      .getTransaction(hash, {
        commitment: this._commitment === 'processed' ? DEFAULT_COMMITMENT : this._commitment,
        maxSupportedTransactionVersion: 0,
        encoding: 'json'
      })
      .send()
  }

  /**
   * Verifies that a signature over a message is valid for this account.
   *
   * @param {string | Uint8Array} message - The signed message.
   * @param {string | Uint8Array} signature - The signature to verify.
   * @returns {Promise<boolean>} Whether the signature is valid.
   */
  async verify (message, signature) {
    throw new NotImplementedError('verify(message, signature)')
  }

  /**
   * Returns the pending proposals for the given proposal ids.
   *
   * @param {Array<number | bigint>} proposalIds - The proposal (transaction index) ids.
   * @returns {Promise<MultisigProposal[]>} The proposals.
   */
  async getProposals (proposalIds) {
    throw new NotImplementedError('getProposals(proposalIds)')
  }

  /**
   * Returns whether a proposal has reached the threshold and is ready to execute.
   *
   * @param {number | bigint} proposalId - The proposal id.
   * @returns {Promise<boolean>} Whether the proposal is ready to execute.
   */
  async isReadyToExecute (proposalId) {
    throw new NotImplementedError('isReadyToExecute(proposalId)')
  }

  /**
   * Returns the signed-message proposals for the given message hashes.
   *
   * @param {string[]} messageHashes - The message hashes.
   * @returns {Promise<MessageInfo[]>} The message proposals.
   */
  async getMessages (messageHashes) {
    throw new NotImplementedError('getMessages(messageHashes)')
  }

  /**
   * Quotes the cost of deploying (creating) the multisig.
   *
   * @returns {Promise<{ fee: bigint }>} The deploy quote.
   */
  async quoteDeploy () {
    throw new NotImplementedError('quoteDeploy()')
  }

  /**
   * Quotes the cost of proposing a transaction.
   *
   * @param {SimpleSolanaTransaction} tx - The transaction to quote.
   * @param {SolanaMultisigSquadsConfig} [config] - An optional config override.
   * @returns {Promise<{ fee: bigint }>} The transaction quote.
   */
  async quoteSendTransaction (tx, config) {
    throw new NotImplementedError('quoteSendTransaction(tx, config)')
  }

  /**
   * Quotes the cost of a transfer.
   *
   * @param {import('@tetherto/wdk-wallet').TransferOptions} transferOptions - The transfer options.
   * @param {SolanaMultisigSquadsConfig} [config] - An optional config override.
   * @returns {Promise<{ fee: bigint }>} The transfer quote.
   */
  async quoteTransfer (transferOptions, config) {
    throw new NotImplementedError('quoteTransfer(transferOptions, config)')
  }
}
