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

import { WalletAccountReadOnly } from '@tetherto/wdk-wallet'

import FailoverProvider from '@tetherto/wdk-failover-provider'

import { NotSupportedError } from './errors.js'

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
const PROPOSAL_DISCRIMINATOR = Uint8Array.from([26, 94, 189, 187, 116, 136, 53, 33])
const CONFIG_TRANSACTION_DISCRIMINATOR = Uint8Array.from([94, 8, 4, 35, 113, 139, 139, 112])
const PROGRAM_CONFIG_DISCRIMINATOR = Uint8Array.from([196, 210, 90, 231, 144, 149, 140, 63])

const CLOCK_SYSVAR_ADDRESS = 'SysvarC1ock11111111111111111111111111111111'
const CLOCK_UNIX_TIMESTAMP_OFFSET = 32

const MULTISIG_THRESHOLD_OFFSET = 72
const MULTISIG_TIME_LOCK_OFFSET = 74
const MULTISIG_TRANSACTION_INDEX_OFFSET = 78
const MULTISIG_STALE_TRANSACTION_INDEX_OFFSET = 86
const MULTISIG_RENT_COLLECTOR_OFFSET = 94

const PROGRAM_CONFIG_CREATION_FEE_OFFSET = 40

const PROPOSAL_STATUS_OFFSET = 48
const PROPOSAL_STATUS_TIMESTAMP_OFFSET = 49
const PROPOSAL_STATUS_APPROVED = 3
const PROPOSAL_STATUS_EXECUTING = 4

const OPTION_TAG_SIZE = 1
const ENUM_TAG_SIZE = 1
const ADDRESS_SIZE = 32
const BUMP_SIZE = 1
const VEC_PREFIX_SIZE = 4
const MEMBER_SIZE = ADDRESS_SIZE + 1
const TRANSACTION_INDEX_SIZE = 8
const TIMESTAMP_SIZE = 8
const SIGNATURE_SIZE = 64
const MULTISIG_BASE_SIZE = 132

const VAULT_TRANSACTION_BASE_SIZE = 83
const PROPOSAL_BASE_SIZE = 70
const PROPOSAL_MEMBER_SIZE = 96

const MESSAGE_HEADER_SIZE = 3
const PROGRAM_ID_INDEX_SIZE = 1
const SYSTEM_TRANSFER_DATA_SIZE = 12
const SYSTEM_TRANSFER_ACCOUNT_INDEX_COUNT = 2
const SOL_TRANSFER_ACCOUNT_KEY_COUNT = 3

const SPL_TRANSFER_MESSAGE_SIZE = 164
const SPL_TRANSFER_WITH_ATA_MESSAGE_SIZE = 308

const SIGNATURE_BASE_FEE = 5000n
const MULTISIG_CREATE_SIGNATURE_COUNT = 2n
const DEFAULT_MEMBER_COUNT = 1
const MAX_MEMBER_COUNT = 65535

const SEED_PREFIX = 'multisig'
const SEED_MULTISIG = 'multisig'
const SEED_VAULT = 'vault'
const SEED_TRANSACTION = 'transaction'
const SEED_PROPOSAL = 'proposal'
const SEED_PROGRAM_CONFIG = 'program_config'

const DEFAULT_VAULT_INDEX = 0
const MAX_VAULT_INDEX = 255
const MAX_PROPOSAL_INDEX = 18446744073709551615n
const MAX_MULTIPLE_ACCOUNTS = 100

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

    return this._hasDiscriminator(getBase64Encoder().encode(value.data[0]), MULTISIG_DISCRIMINATOR)
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

    if (value.owner !== this._programId || !this._hasDiscriminator(data, MULTISIG_DISCRIMINATOR)) {
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
    offset += VEC_PREFIX_SIZE

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

    if (value.owner !== this._programId || !this._hasDiscriminator(data, MULTISIG_DISCRIMINATOR)) {
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
   * Only legacy SPL Token mints are supported: the associated token account is derived
   * with the SPL Token program as a seed, so a Token-2022 mint resolves to a different
   * address and reports `0n` even when it holds a balance.
   *
   * @param {string} tokenAddress - The SPL token mint address.
   * @param {number | string} [vaultIndexOrAddress=0] - A vault index between 0 and 255,
   *   or a vault address to read as given.
   * @returns {Promise<bigint>} The token balance (in base unit).
   * @throws {Error} If the mint address is malformed, or if the RPC request fails.
   * @todo Support Token-2022 (Token Extensions Program).
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
   * **Not supported, and not pending work.** This account's address is a
   * program-derived address with no private key, so no signature can be attributed to
   * it and there is nothing to verify against. Solana has no equivalent of EIP-1271,
   * which is what lets a keyless smart-contract wallet answer this question on other
   * chains. To check an individual member's signature, verify it against that member's
   * own address instead.
   *
   * @param {string | Uint8Array} message - The signed message.
   * @param {string | Uint8Array} signature - The signature to verify.
   * @returns {Promise<boolean>} Whether the signature is valid.
   * @throws {NotSupportedError} Always, for the reasons above.
   */
  async verify (message, signature) {
    throw new NotSupportedError(
      'verify(message, signature)',
      'a Squads multisig address is a program-derived address with no private key, so no signature can be attributed to it, and Solana has no equivalent of EIP-1271. Verify an individual member\'s signature against that member\'s own address instead.'
    )
  }

  /**
   * Returns the proposals at the given ids, in the same order.
   *
   * A proposal's id is its transaction index. Entries are `null` where no proposal
   * exists at that id, so the result stays positionally aligned with the input.
   *
   * Note that `confirmations >= threshold` does **not** mean a proposal can be
   * executed: it must also be in the approved status, not invalidated by a later
   * configuration change, and past any time lock. Use {@link isReadyToExecute}.
   *
   * @param {Array<number | bigint | string>} proposalIds - The proposal (transaction index) ids.
   * @returns {Promise<Array<MultisigProposal | null>>} For each id, the proposal, or
   *   null if no proposal exists at that id.
   * @throws {Error} If an id is not a non-negative integer, or if the RPC request fails.
   */
  async getProposals (proposalIds) {
    if (!proposalIds.length) {
      return []
    }

    const { address: multisigPda, threshold, isCreated } = await this.getMultisigInfo()

    if (!isCreated) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before reading its proposals.`
      )
    }

    const indices = proposalIds.map((id) => this._toProposalIndex(id))
    const proposalPdas = await Promise.all(
      indices.map((index) => this._getProposalPda(multisigPda, index))
    )

    const proposals = []

    for (let offset = 0; offset < proposalPdas.length; offset += MAX_MULTIPLE_ACCOUNTS) {
      const { value } = await this._rpc
        .getMultipleAccounts(proposalPdas.slice(offset, offset + MAX_MULTIPLE_ACCOUNTS), {
          commitment: this._commitment,
          encoding: 'base64'
        })
        .send()

      value.forEach((account, i) => {
        proposals.push(this._toProposal(account, indices[offset + i], threshold))
      })
    }

    return proposals
  }

  /**
   * Returns whether a proposal can be executed right now.
   *
   * A proposal becomes executable once it has been approved and its time lock has
   * elapsed. Configuration proposals additionally must not have been invalidated by a
   * later configuration change; vault and batch proposals that were approved before
   * being invalidated stay executable.
   *
   * This is a point-in-time answer rather than a guarantee: a configuration change or
   * a cancellation can make an executable proposal unexecutable. Every reason for a
   * `false` result collapses into the same value, including a proposal that does not
   * exist.
   *
   * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
   * @returns {Promise<boolean>} Whether the proposal can be executed.
   * @throws {Error} If the id is invalid, no address is configured, or the RPC fails.
   */
  async isReadyToExecute (proposalId) {
    const index = this._toProposalIndex(proposalId)
    const multisigPda = await this.getAddress()

    const [proposalPda, transactionPda] = await Promise.all([
      this._getProposalPda(multisigPda, index),
      this._getTransactionPda(multisigPda, index)
    ])

    const { value } = await this._rpc
      .getMultipleAccounts(
        [address(multisigPda), proposalPda, transactionPda, address(CLOCK_SYSVAR_ADDRESS)],
        { commitment: this._commitment, encoding: 'base64' }
      )
      .send()

    const [multisig, proposal, transaction, clock] = value

    if (!multisig || !proposal || !transaction || !clock) {
      return false
    }

    const proposalData = getBase64Encoder().encode(proposal.data[0])

    if (
      !this._hasDiscriminator(proposalData, PROPOSAL_DISCRIMINATOR) ||
      proposalData[PROPOSAL_STATUS_OFFSET] !== PROPOSAL_STATUS_APPROVED
    ) {
      return false
    }

    const multisigData = getBase64Encoder().encode(multisig.data[0])

    if (!this._hasDiscriminator(multisigData, MULTISIG_DISCRIMINATOR)) {
      return false
    }

    const multisigView = new DataView(multisigData.buffer, multisigData.byteOffset, multisigData.byteLength)
    const transactionData = getBase64Encoder().encode(transaction.data[0])

    if (this._hasDiscriminator(transactionData, CONFIG_TRANSACTION_DISCRIMINATOR)) {
      const staleIndex = multisigView.getBigUint64(MULTISIG_STALE_TRANSACTION_INDEX_OFFSET, true)

      if (index <= staleIndex) {
        return false
      }
    }

    const clockData = getBase64Encoder().encode(clock.data[0])
    const proposalView = new DataView(proposalData.buffer, proposalData.byteOffset, proposalData.byteLength)
    const clockView = new DataView(clockData.buffer, clockData.byteOffset, clockData.byteLength)

    const approvedAt = proposalView.getBigInt64(PROPOSAL_STATUS_TIMESTAMP_OFFSET, true)
    const now = clockView.getBigInt64(CLOCK_UNIX_TIMESTAMP_OFFSET, true)
    const timeLock = BigInt(multisigView.getUint32(MULTISIG_TIME_LOCK_OFFSET, true))

    return now - approvedAt >= timeLock
  }

  /**
   * Returns the signed-message proposals for the given message hashes.
   *
   * **Not supported, and not pending work.** Squads has no message-signing primitive,
   * and a multisig cannot produce a signature at all: its accounts are program-derived
   * addresses, which hold no private key. A message's *approval* can be recorded
   * on-chain by wrapping it in a vault transaction, but the result is proof of approval
   * rather than a signature, and Squads keys its accounts by sequential transaction
   * index rather than by message hash, so a hash cannot be resolved to an account.
   *
   * @param {string[]} messageHashes - The message hashes.
   * @returns {Promise<Array<MessageInfo | null>>} For each hash, the message proposal,
   *   or null if it has not been found.
   * @throws {NotSupportedError} Always, for the reasons above.
   */
  async getMessages (messageHashes) {
    throw new NotSupportedError(
      'getMessages(messageHashes)',
      'Squads has no message-signing primitive, and its accounts are keyed by sequential transaction index rather than by message hash'
    )
  }

  /**
   * Quotes the cost of deploying (creating) the multisig.
   *
   * The quote covers what the creator's account is debited: rent for the multisig
   * account, the protocol's creation fee, and the base fee for the two signatures the
   * creation transaction carries. It excludes priority fees, which the sender chooses,
   * and excludes funding a vault, which is a separate step.
   *
   * Rent scales with the number of members, which the multisig does not have until it
   * is created, so `memberCount` defaults to a single member. Pass the intended count
   * to quote a larger multisig.
   *
   * Note that this rent is **not** refundable: Squads has no instruction to close a
   * multisig account, unlike the accounts backing proposals and transactions.
   *
   * @param {number} [memberCount=1] - The number of members the multisig will hold.
   * @returns {Promise<{ fee: bigint }>} The deploy quote, in lamports.
   * @throws {Error} If `memberCount` is out of range, or if the RPC request fails.
   */
  async quoteDeploy (memberCount = DEFAULT_MEMBER_COUNT) {
    if (!Number.isInteger(memberCount) || memberCount < 1 || memberCount > MAX_MEMBER_COUNT) {
      throw new Error(
        `Invalid member count ${memberCount}. It must be an integer between 1 and ${MAX_MEMBER_COUNT}.`
      )
    }

    const [programConfigPda] = await getProgramDerivedAddress({
      programAddress: this._programId,
      seeds: [SEED_PREFIX, SEED_PROGRAM_CONFIG]
    })

    const [{ value }, rent] = await Promise.all([
      this._rpc
        .getAccountInfo(programConfigPda, {
          commitment: this._commitment,
          encoding: 'base64'
        })
        .send(),
      this._rpc
        .getMinimumBalanceForRentExemption(BigInt(MULTISIG_BASE_SIZE + MEMBER_SIZE * memberCount))
        .send()
    ])

    const data = value && getBase64Encoder().encode(value.data[0])

    if (!data || !this._hasDiscriminator(data, PROGRAM_CONFIG_DISCRIMINATOR)) {
      throw new Error(
        `The Squads program config account ${programConfigPda} could not be read.`
      )
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const creationFee = view.getBigUint64(PROGRAM_CONFIG_CREATION_FEE_OFFSET, true)

    return {
      fee: rent + creationFee + SIGNATURE_BASE_FEE * MULTISIG_CREATE_SIGNATURE_COUNT
    }
  }

  /**
   * Quotes the cost of proposing a transaction.
   *
   * This is what the **proposer** is debited: rent for the transaction and proposal
   * accounts Squads creates, plus the base fee for the single signature that creates
   * them. Approvals and execution are paid by the members who submit them, from their
   * own accounts, so they are excluded — as are priority fees.
   *
   * Most of the quote is refundable rent rather than a fee: the accounts can be closed
   * once the proposal is executed or cancelled, refunding to the multisig's rent
   * collector when one is configured. Proposal rent scales with the number of members,
   * so it usually dominates.
   *
   * @param {SimpleSolanaTransaction} tx - The transaction to quote.
   * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged
   *   over this account's configuration.
   * @returns {Promise<{ fee: bigint }>} The transaction quote, in lamports.
   * @throws {Error} If the multisig does not exist, the transaction is malformed, or the
   *   RPC request fails.
   */
  async quoteSendTransaction (tx, config) {
    const account = this._withConfig(config)
    const { address: multisigPda, owners, isCreated } = await account.getMultisigInfo()

    if (!isCreated) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before quoting transactions.`
      )
    }

    const transactionSize =
      VAULT_TRANSACTION_BASE_SIZE + VEC_PREFIX_SIZE + this._vaultTransactionMessageSize(tx)
    const proposalSize = PROPOSAL_BASE_SIZE + PROPOSAL_MEMBER_SIZE * owners.length

    const [transactionRent, proposalRent] = await Promise.all([
      account._rpc.getMinimumBalanceForRentExemption(BigInt(transactionSize)).send(),
      account._rpc.getMinimumBalanceForRentExemption(BigInt(proposalSize)).send()
    ])

    return { fee: transactionRent + proposalRent + SIGNATURE_BASE_FEE }
  }

  /**
   * Quotes the cost of a transfer.
   *
   * This is what the **proposer** is debited: rent for the transaction and proposal
   * accounts Squads creates, plus the base fee for the single signature that creates
   * them. Approvals and execution are paid by the members who submit them, and priority
   * fees are excluded.
   *
   * One cost is deliberately **not** included. When the recipient holds no account for
   * the token yet, one is created during execution and paid for by the **vault**, not by
   * the proposer. That rent leaves the treasury, is not refundable to the multisig, and a
   * vault without enough SOL to cover it will fail execution after the proposal has
   * already been created and approved.
   *
   * @param {import('@tetherto/wdk-wallet').TransferOptions} transferOptions - The transfer options.
   * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged
   *   over this account's configuration.
   * @returns {Promise<{ fee: bigint }>} The transfer quote, in lamports.
   * @throws {Error} If the mint or recipient is malformed, the multisig does not exist,
   *   or the RPC request fails.
   * @todo Support Token-2022 (Token Extensions Program).
   */
  async quoteTransfer (transferOptions, config) {
    const mint = address(transferOptions.token)
    const recipient = address(transferOptions.recipient)

    const account = this._withConfig(config)
    const { address: multisigPda, owners, isCreated } = await account.getMultisigInfo()

    if (!isCreated) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before quoting transfers.`
      )
    }

    const messageSize = await account._splTransferMessageSize(mint, recipient)
    const transactionSize = VAULT_TRANSACTION_BASE_SIZE + VEC_PREFIX_SIZE + messageSize
    const proposalSize = PROPOSAL_BASE_SIZE + PROPOSAL_MEMBER_SIZE * owners.length

    const [transactionRent, proposalRent] = await Promise.all([
      account._rpc.getMinimumBalanceForRentExemption(BigInt(transactionSize)).send(),
      account._rpc.getMinimumBalanceForRentExemption(BigInt(proposalSize)).send()
    ])

    return { fee: transactionRent + proposalRent + SIGNATURE_BASE_FEE }
  }

  /** @private */
  _createFailoverRpc (urls, retries) {
    const failoverProvider = new FailoverProvider({ retries })

    for (const url of urls) {
      failoverProvider.addProvider(createSolanaRpc(url))
    }

    return failoverProvider.initialize()
  }

  /** @private */
  _hasDiscriminator (data, discriminator) {
    if (data.length < discriminator.length) {
      return false
    }

    return discriminator.every((byte, i) => byte === data[i])
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

  /** @private */
  _toProposalIndex (proposalId) {
    let index = null

    try {
      index = BigInt(proposalId)
    } catch {}

    if (index === null || index < 0n || index > MAX_PROPOSAL_INDEX) {
      throw new Error(
        `Invalid proposal id ${proposalId}. It must be an integer between 0 and ${MAX_PROPOSAL_INDEX}.`
      )
    }

    return index
  }

  /** @private */
  _withConfig (config) {
    if (!config) {
      return this
    }

    const account = new WalletAccountReadOnlyMultisigSolanaSquads(this._signerAddress, {
      ...this._config,
      ...config
    })

    if (!config.provider) {
      account._rpc = this._rpc
    }

    return account
  }

  /** @private */
  _vaultTransactionMessageSize (tx) {
    address(tx.to)

    const instructionSize =
      PROGRAM_ID_INDEX_SIZE +
      (VEC_PREFIX_SIZE + SYSTEM_TRANSFER_ACCOUNT_INDEX_COUNT) +
      (VEC_PREFIX_SIZE + SYSTEM_TRANSFER_DATA_SIZE)

    return (
      MESSAGE_HEADER_SIZE +
      (VEC_PREFIX_SIZE + ADDRESS_SIZE * SOL_TRANSFER_ACCOUNT_KEY_COUNT) +
      (VEC_PREFIX_SIZE + instructionSize) +
      VEC_PREFIX_SIZE
    )
  }

  /** @private */
  async _splTransferMessageSize (mint, recipient) {
    const [recipientAta] = await findAssociatedTokenPda({
      mint,
      owner: recipient,
      tokenProgram: TOKEN_PROGRAM_ADDRESS
    })

    const { value } = await this._rpc
      .getAccountInfo(recipientAta, {
        commitment: this._commitment,
        encoding: 'base64'
      })
      .send()

    return value ? SPL_TRANSFER_MESSAGE_SIZE : SPL_TRANSFER_WITH_ATA_MESSAGE_SIZE
  }

  /** @private */
  _getTransactionSeeds (multisigPda, index) {
    const transactionIndex = new Uint8Array(TRANSACTION_INDEX_SIZE)

    new DataView(transactionIndex.buffer).setBigUint64(0, index, true)

    return [
      SEED_PREFIX,
      getAddressEncoder().encode(address(multisigPda)),
      SEED_TRANSACTION,
      transactionIndex
    ]
  }

  /** @private */
  async _getTransactionPda (multisigPda, index) {
    const [transactionPda] = await getProgramDerivedAddress({
      programAddress: this._programId,
      seeds: this._getTransactionSeeds(multisigPda, index)
    })

    return transactionPda
  }

  /** @private */
  async _getProposalPda (multisigPda, index) {
    const [proposalPda] = await getProgramDerivedAddress({
      programAddress: this._programId,
      seeds: [...this._getTransactionSeeds(multisigPda, index), SEED_PROPOSAL]
    })

    return proposalPda
  }

  /** @private */
  _toProposal (account, index, threshold) {
    if (!account) {
      return null
    }

    const data = getBase64Encoder().encode(account.data[0])

    if (account.owner !== this._programId || !this._hasDiscriminator(data, PROPOSAL_DISCRIMINATOR)) {
      return null
    }

    return {
      proposalId: index.toString(),
      confirmations: this._countApprovals(data),
      threshold
    }
  }

  /** @private */
  _countApprovals (data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

    const statusSize = data[PROPOSAL_STATUS_OFFSET] === PROPOSAL_STATUS_EXECUTING
      ? ENUM_TAG_SIZE
      : ENUM_TAG_SIZE + TIMESTAMP_SIZE

    return view.getUint32(PROPOSAL_STATUS_OFFSET + statusSize + BUMP_SIZE, true)
  }
}
