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

import { NoSuchElementError, WalletAccountReadOnly } from '@tetherto/wdk-wallet'

import FailoverProvider from '@tetherto/wdk-failover-provider'

import { NotSupportedError } from './errors.js'

import { createSolanaRpc } from '@solana/rpc'

import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses'

import { getBase58Decoder, getBase58Encoder, getBase64Encoder } from '@solana/codecs'

import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'

/** @typedef {ReturnType<typeof import('@solana/rpc').createSolanaRpc>} SolanaRpc */
/** @typedef {import('@solana/rpc-types').Commitment} Commitment */
/** @typedef {import('@solana/addresses').Address} Address */

/** @typedef {import('@tetherto/wdk-wallet/multisig').IWalletAccountReadOnlyMultisig} IWalletAccountReadOnlyMultisig */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigInfo} MultisigInfo */
/**
 * `MultisigInfo` widened with each owner's Squads permission mask, aligned with `owners`, and
 * whether the multisig account exists on-chain.
 *
 * @typedef {MultisigInfo & { masks: number[], isCreated: boolean }} SolanaMultisigInfo
 */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigMessageProposal} MultisigMessageProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigProposal} MultisigProposal */
/**
 * `MultisigProposal` widened with the proposal's Squads status and its vote lists.
 *
 * @typedef {MultisigProposal & { statusName: string, approved: string[], rejected: string[], cancelled: string[] }} SolanaMultisigProposal
 */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */

/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransactionReceipt} SolanaTransactionReceipt */

/**
 * The configuration a read-only Squads account takes: how to reach the cluster, and how to
 * identify the multisig. `multisigPda` names an existing one; `createKey` derives its address
 * instead. Both may be given, and must then agree. A signing account may give neither and
 * supply `createKeySecret`, which the create key is derived from.
 *
 * @typedef {Object} SolanaMultisigSquadsReadOnlyConfig
 * @property {string | string[]} provider - A Solana RPC URL, or a list of URLs for failover.
 * @property {Commitment} [commitment] - The commitment level for transactions (default: 'confirmed').
 * @property {number} [retries] - The number of retries for the failover provider (default: 3).
 * @property {string} [programId] - The Squads program to operate against, for a fork or a
 *   local deployment (default: `SQUADS_PROGRAM_ADDRESS`).
 * @property {string} [multisigPda] - The address of an existing Squads multisig to operate on.
 * @property {string} [createKey] - The create key used to derive a new multisig PDA on creation.
 */

/**
 * The extra configuration a signing account takes: the secret it derives a new multisig's
 * address from, and the fee ceilings above which it refuses to submit.
 *
 * @typedef {Object} SolanaMultisigSquadsSigningConfig
 * @property {string | Uint8Array} [createKeySecret] - The create key's secret, required to
 *   deploy a multisig. Base58 or raw bytes, either a 32-byte private key or a 64-byte keypair.
 * @property {number | bigint} [createMaxFee] - The maximum fee amount for the create/deploy operation.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfers.
 */

/** @typedef {SolanaMultisigSquadsReadOnlyConfig & SolanaMultisigSquadsSigningConfig} SolanaMultisigSquadsConfig */

/**
 * A member of a Squads multisig, as stored on-chain.
 *
 * @typedef {Object} SquadsMember
 * @property {string} address - The member's address.
 * @property {number} mask - The member's permission bitmask: 1 initiate, 2 vote, 4 execute.
 */

/**
 * A decoded Squads multisig account. When `isCreated` is false the account does not exist
 * on-chain and every other field holds a placeholder.
 *
 * @typedef {Object} SquadsMultisigAccount
 * @property {string} address - The multisig address the account was read from.
 * @property {boolean} isCreated - Whether the account exists on-chain.
 * @property {string | null} configAuthority - The authority that alone may change the members
 *   and threshold, or null when the multisig votes on its own configuration.
 * @property {number} threshold - The number of approvals a proposal needs to be executable.
 * @property {number} timeLock - Seconds an approved proposal must wait before it can execute.
 * @property {bigint} transactionIndex - The index of the most recently created transaction.
 * @property {bigint} staleTransactionIndex - Proposals at or below this index were invalidated
 *   by a later configuration change and can no longer be voted on or executed.
 * @property {string | null} rentCollector - The address that reclaims rent when a proposal's
 *   accounts are closed, or null when the multisig collects none.
 * @property {SquadsMember[]} members - The members, in on-chain order.
 */

/**
 * A decoded Squads proposal account. When `exists` is false no proposal has been created at
 * that transaction index and every other field holds a placeholder.
 *
 * @typedef {Object} SquadsProposalAccount
 * @property {Address} address - The proposal's program-derived address.
 * @property {boolean} exists - Whether a proposal has been created at that index.
 * @property {number} status - The raw status discriminant, or -1 when the proposal is absent.
 * @property {string | null} statusName - The status as a name, e.g. `'Active'`.
 * @property {string | null} statusPhrase - The status as a sentence fragment, for error messages.
 * @property {bigint | null} statusTimestamp - The Unix timestamp the status was set at, or null
 *   while the proposal is executing, the one status Squads stores without a timestamp.
 * @property {string[]} approved - The members that have approved.
 * @property {string[]} rejected - The members that have rejected.
 * @property {string[]} cancelled - The members that have cancelled.
 */

/**
 * A lookup a stored transaction message makes into an address lookup table.
 *
 * @typedef {Object} SquadsAddressTableLookup
 * @property {string} accountKey - The lookup table's address.
 * @property {number[]} writableIndexes - The table indexes loaded as writable accounts.
 * @property {number[]} readonlyIndexes - The table indexes loaded as read-only accounts.
 */

/**
 * The message a vault transaction executes, decoded far enough to rebuild its account list.
 *
 * @typedef {Object} SquadsTransactionMessage
 * @property {number} numSigners - How many leading account keys are signers.
 * @property {number} numWritableSigners - How many of those leading signers are writable.
 * @property {number} numWritableNonSigners - How many non-signers after them are writable.
 * @property {string[]} accountKeys - The statically listed addresses, in message order.
 * @property {SquadsAddressTableLookup[]} addressTableLookups - The lookup table references.
 */

/** @typedef {'vault' | 'config' | 'batch'} SquadsTransactionKind */

/** @typedef {'AddMember' | 'RemoveMember' | 'ChangeThreshold' | 'SetTimeLock' | 'AddSpendingLimit' | 'RemoveSpendingLimit' | 'SetRentCollector'} SquadsConfigActionKind */

/**
 * A configuration change a config transaction applies. `createKey` and `spendingLimit` name the
 * spending limit account the executor has to pass through, and are null for every other kind.
 *
 * @typedef {Object} SquadsConfigAction
 * @property {SquadsConfigActionKind} kind - The change the action applies.
 * @property {string | null} createKey - The key the spending limit to create derives from.
 * @property {string | null} spendingLimit - The address of the spending limit to close.
 */

/**
 * A decoded Squads transaction account backing a proposal. When `exists` is false no
 * transaction has been created at that index and every other field holds a placeholder.
 *
 * @typedef {Object} SquadsTransactionAccount
 * @property {Address} address - The transaction's program-derived address.
 * @property {boolean} exists - Whether a transaction has been created at that index.
 * @property {SquadsTransactionKind | null} kind - The transaction kind, null when the
 *   account is absent or holds a kind this package cannot decode.
 * @property {number} vaultIndex - The vault the message spends from; 0 for non-vault kinds.
 * @property {number} ephemeralSignerCount - The ephemeral signers the message expects.
 * @property {SquadsTransactionMessage | null} message - The stored message, vault kind only.
 * @property {SquadsConfigAction[]} actions - The configuration actions, config kind only.
 */

/**
 * The Squads program config: the fee it charges to create a multisig, and the treasury that
 * collects it.
 *
 * @typedef {Object} SquadsProgramConfig
 * @property {Address} programConfigPda - The program config's program-derived address.
 * @property {bigint} creationFee - The fee charged per multisig creation, in lamports.
 * @property {string} treasury - The address the creation fee is paid to.
 */

/**
 * A multisig, one of its proposals, the transaction that proposal backs, and the cluster clock,
 * read together so an execution can be checked against a single consistent snapshot.
 *
 * @typedef {Object} SquadsProposalContext
 * @property {SquadsMultisigAccount} multisig - The decoded multisig account.
 * @property {SquadsProposalAccount} proposal - The decoded proposal account.
 * @property {SquadsTransactionAccount} transaction - The decoded transaction account.
 * @property {bigint} now - The cluster's current Unix timestamp, read from the clock sysvar.
 */

export const SQUADS_PROGRAM_ADDRESS = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf'

const MULTISIG_DISCRIMINATOR = Uint8Array.from([224, 116, 121, 186, 68, 161, 79, 236])
const PROPOSAL_DISCRIMINATOR = Uint8Array.from([26, 94, 189, 187, 116, 136, 53, 33])
const VAULT_TRANSACTION_DISCRIMINATOR = Uint8Array.from([168, 250, 162, 100, 81, 14, 162, 207])
const CONFIG_TRANSACTION_DISCRIMINATOR = Uint8Array.from([94, 8, 4, 35, 113, 139, 139, 112])
const BATCH_DISCRIMINATOR = Uint8Array.from([156, 194, 70, 44, 22, 88, 137, 44])
const PROGRAM_CONFIG_DISCRIMINATOR = Uint8Array.from([196, 210, 90, 231, 144, 149, 140, 63])

/**
 * The transaction kinds a Squads proposal can back, keyed by kind.
 *
 * @type {{ [K in SquadsTransactionKind]: K }}
 */
export const TRANSACTION_KIND = { vault: 'vault', config: 'config', batch: 'batch' }

const VAULT_TRANSACTION_VAULT_INDEX_OFFSET = 81
const VAULT_TRANSACTION_EPHEMERAL_BUMPS_OFFSET = 83
const CONFIG_TRANSACTION_ACTIONS_OFFSET = 81

const CONFIG_ACTION_NAMES = [
  'AddMember',
  'RemoveMember',
  'ChangeThreshold',
  'SetTimeLock',
  'AddSpendingLimit',
  'RemoveSpendingLimit',
  'SetRentCollector'
]
const CONFIG_ACTION_ADD_SPENDING_LIMIT = 4
const CONFIG_ACTION_REMOVE_SPENDING_LIMIT = 5
const CONFIG_ACTION_SET_RENT_COLLECTOR = 6
const CONFIG_ACTION_BODY_SIZES = [33, 32, 2, 4, 0, 32, 0]
const ADD_SPENDING_LIMIT_FIXED_SIZE = 74

const CLOCK_SYSVAR_ADDRESS = 'SysvarC1ock11111111111111111111111111111111'
const DEFAULT_ADDRESS = '11111111111111111111111111111111'
const CLOCK_UNIX_TIMESTAMP_OFFSET = 32

const MULTISIG_CONFIG_AUTHORITY_OFFSET = 40
const MULTISIG_THRESHOLD_OFFSET = 72
const MULTISIG_TIME_LOCK_OFFSET = 74
const MULTISIG_TRANSACTION_INDEX_OFFSET = 78
const MULTISIG_STALE_TRANSACTION_INDEX_OFFSET = 86
const MULTISIG_RENT_COLLECTOR_OFFSET = 94

const PROGRAM_CONFIG_CREATION_FEE_OFFSET = 40
const PROGRAM_CONFIG_TREASURY_OFFSET = 48

const PROPOSAL_STATUS_OFFSET = 48
const PROPOSAL_STATUS_TIMESTAMP_OFFSET = 49
const PROPOSAL_STATUS_APPROVED = 3
const PROPOSAL_STATUS_EXECUTING = 4
const PROPOSAL_STATUS_EXECUTED = 5
const PROPOSAL_STATUS_NAMES = [
  'Draft',
  'Active',
  'Rejected',
  'Approved',
  'Executing',
  'Executed',
  'Cancelled'
]
const PROPOSAL_STATUS_PHRASES = [
  'a draft',
  'open for voting',
  'rejected',
  'approved',
  'executing',
  'executed',
  'cancelled'
]

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
const SEED_SPENDING_LIMIT = 'spending_limit'
const SEED_EPHEMERAL_SIGNER = 'ephemeral_signer'

const DEFAULT_VAULT_INDEX = 0
const MAX_VAULT_INDEX = 255
const MAX_PROPOSAL_INDEX = 18446744073709551615n
const MAX_MULTIPLE_ACCOUNTS = 100

/**
 * Read-only Solana Squads multisig wallet account implementation.
 *
 * @implements {IWalletAccountReadOnlyMultisig}
 */
export default class WalletAccountReadOnlyMultisigSolanaSquads extends WalletAccountReadOnly {
  /**
   * Creates a new read-only Solana Squads multisig wallet account.
   *
   * @param {string | undefined} signerAddress - The signer's address, or undefined for a
   *   pure read-only account.
   * @param {SolanaMultisigSquadsReadOnlyConfig} config - The configuration object.
   */
  constructor (signerAddress, config) {
    super(signerAddress)

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
     * @type {string | undefined}
     */
    this._signerAddress = signerAddress

    /**
     * The address of the Squads multisig account.
     *
     * @protected
     * @type {string | undefined}
     */
    this._multisigPda = config.multisigPda

    /**
     * The create key used to derive the multisig address, if configured.
     *
     * @protected
     * @type {string | undefined}
     */
    this._createKey = config.createKey

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
    this._commitment = config.commitment ?? 'confirmed'

    const { provider, retries = 3 } = config

    /**
     * A Solana RPC client for HTTP requests.
     *
     * @protected
     * @type {SolanaRpc | undefined}
     */
    this._rpc = undefined

    if (Array.isArray(provider)) {
      if (provider.length > 0) {
        const failoverProvider = new FailoverProvider({ retries })

        for (const entry of provider) {
          const option = createSolanaRpc(entry)

          failoverProvider.addProvider(option)
        }

        this._rpc = failoverProvider.initialize()
      }
    } else if (provider) {
      this._rpc = createSolanaRpc(provider)
    }
  }

  /**
   * Returns the address of the Squads multisig account.
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
   * @returns {Promise<SolanaMultisigInfo>} The multisig info.
   * @throws {Error} If the address holds a non-Squads account, or if the RPC request fails.
   */
  async getMultisigInfo () {
    const { address: multisigPda, isCreated, threshold, members } = await this._getMultisigAccount()

    return {
      address: multisigPda,
      owners: members.map((member) => member.address),
      masks: members.map((member) => member.mask),
      threshold,
      isCreated
    }
  }

  /**
   * Returns the transaction index of the most recently created transaction.
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
   * Returns the address of one of the multisig's vaults, where its funds are held.
   *
   * @param {number | string} [vaultIndexOrAddress] - A vault index between 0 and 255, or a
   *   vault address to use as given (default: 0).
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
   * @param {number | string} [vaultIndexOrAddress] - A vault index between 0 and 255, or a
   *   vault address to read as given (default: 0).
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
   * @param {string} tokenAddress - The SPL token mint address.
   * @param {number | string} [vaultIndexOrAddress] - A vault index between 0 and 255, or a
   *   vault address to read as given (default: 0).
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
   * Retrieves a transaction receipt by its signature.
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
        commitment: this._commitment === 'processed' ? 'confirmed' : this._commitment,
        maxSupportedTransactionVersion: 0,
        encoding: 'json'
      })
      .send()
  }

  /**
   * Verifies a message's signature. Not supported by Squads.
   *
   * @param {string | Uint8Array} message - The signed message.
   * @param {string | Uint8Array} signature - The signature to verify.
   * @returns {Promise<boolean>} Whether the signature is valid.
   * @throws {NotSupportedError} Always, since a multisig address has no private key.
   */
  async verify (message, signature) {
    throw new NotSupportedError(
      'verify(message, signature)',
      'a Squads multisig address is a program-derived address with no private key, so no signature can be attributed to it, and Solana has no equivalent of EIP-1271. Verify an individual member\'s signature against that member\'s own address instead.'
    )
  }

  /**
   * Returns the proposals at the given ids, keyed by id in canonical decimal form.
   *
   * @param {(number | bigint | string)[]} proposalIds - The proposal (transaction index) ids.
   * @returns {Promise<Record<string, SolanaMultisigProposal | null>>} For each id, the
   *   proposal, or null if no proposal exists at that id.
   * @throws {Error} If an id is not a non-negative integer, or if the RPC request fails.
   */
  async getProposals (proposalIds) {
    if (!proposalIds.length) {
      return {}
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

    const proposals = {}

    for (let offset = 0; offset < proposalPdas.length; offset += MAX_MULTIPLE_ACCOUNTS) {
      const { value } = await this._rpc
        .getMultipleAccounts(proposalPdas.slice(offset, offset + MAX_MULTIPLE_ACCOUNTS), {
          commitment: this._commitment,
          encoding: 'base64'
        })
        .send()

      value.forEach((account, i) => {
        const index = indices[offset + i]

        proposals[index.toString()] =
          this._toProposal(proposalPdas[offset + i], account, index, threshold)
      })
    }

    return proposals
  }

  /**
   * Returns the proposal at the given id.
   *
   * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
   * @returns {Promise<SolanaMultisigProposal | null>} The proposal, or null if no proposal
   *   exists at that id.
   * @throws {Error} If the id is not a non-negative integer, or if the RPC request fails.
   */
  async getProposal (proposalId) {
    const proposals = await this.getProposals([proposalId])

    return proposals[this._toProposalIndex(proposalId).toString()]
  }

  /**
   * Returns whether a proposal can be executed right now.
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
   * Returns the signed-message proposals for the given message hashes. Not supported by Squads.
   *
   * @param {string[]} messageIds - The message hashes.
   * @returns {Promise<Record<string, MultisigMessageProposal | null>>} For each hash, the
   *   message proposal, or null if it has not been found.
   * @throws {NotSupportedError} Always, since Squads has no message-signing primitive.
   */
  async getMessageProposals (messageIds) {
    throw new NotSupportedError(
      'getMessageProposals(messageIds)',
      'Squads has no message-signing primitive, and its accounts are keyed by sequential transaction index rather than by message hash'
    )
  }

  /**
   * Returns the signed-message proposal for the given message hash. Not supported by Squads.
   *
   * @param {string} messageId - The message's hash.
   * @returns {Promise<MultisigMessageProposal | null>} The message proposal, or null if it
   *   has not been found.
   * @throws {NotSupportedError} Always, since Squads has no message-signing primitive.
   */
  async getMessageProposal (messageId) {
    throw new NotSupportedError(
      'getMessageProposal(messageId)',
      'Squads has no message-signing primitive, and its accounts are keyed by sequential transaction index rather than by message hash'
    )
  }

  /**
   * Quotes the costs of a send transaction operation. Not supported by Squads.
   *
   * @param {SolanaTransaction} tx - The transaction to quote.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quote.
   * @throws {NotSupportedError} Always, since a multisig does not submit transactions itself.
   */
  async quoteSendTransaction (tx) {
    throw new NotSupportedError(
      'quoteSendTransaction(tx)',
      'a Squads multisig does not submit transactions directly: it proposes them and executes once the approval threshold is met. Quote the two steps with quotePropose(tx) and quoteExecuteProposal(proposalId) instead.'
    )
  }

  /**
   * Quotes the costs of a deploy operation.
   *
   * @param {number} [memberCount] - The number of members the multisig will hold (default: 1).
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The deploy quote, in lamports.
   * @throws {Error} If `memberCount` is out of range, or if the RPC request fails.
   */
  async quoteDeploy (memberCount = DEFAULT_MEMBER_COUNT) {
    if (!Number.isInteger(memberCount) || memberCount < 1 || memberCount > MAX_MEMBER_COUNT) {
      throw new Error(
        `Invalid member count ${memberCount}. It must be an integer between 1 and ${MAX_MEMBER_COUNT}.`
      )
    }

    const [{ creationFee }, rent] = await Promise.all([
      this._getProgramConfig(),
      this._rpc
        .getMinimumBalanceForRentExemption(BigInt(MULTISIG_BASE_SIZE + MEMBER_SIZE * memberCount))
        .send()
    ])

    return {
      fee: rent + creationFee + SIGNATURE_BASE_FEE * MULTISIG_CREATE_SIGNATURE_COUNT
    }
  }

  /**
   * Quotes the costs of a propose operation.
   *
   * @param {SolanaTransaction} tx - The transaction to quote.
   * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged
   *   over this account's configuration.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction quote, in lamports.
   * @throws {Error} If the multisig does not exist, the transaction is malformed, or the
   *   RPC request fails.
   */
  async quotePropose (tx, config) {
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
   * Quotes the costs of a transfer operation.
   *
   * @param {TransferOptions} transferOptions - The transfer options.
   * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged
   *   over this account's configuration.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transfer quote, in lamports.
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

  /**
   * Quotes the costs of an execute proposal operation.
   *
   * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The execution quote, in lamports.
   * @throws {NoSuchElementError} If no proposal exists at that id.
   * @throws {Error} If the id is invalid, no address is configured, or the RPC request fails.
   */
  async quoteExecuteProposal (proposalId) {
    const index = this._toProposalIndex(proposalId)
    const { multisig, proposal } = await this._getMultisigAndProposal(index)

    if (!proposal.exists) {
      throw new NoSuchElementError(
        `The multisig ${multisig.address} has no proposal at index ${index}.`
      )
    }

    return { fee: SIGNATURE_BASE_FEE }
  }

  /**
   * Reads and decodes the multisig account, keeping every field it holds.
   *
   * @protected
   * @returns {Promise<SquadsMultisigAccount>} The decoded account.
   * @throws {Error} If the address holds a non-Squads account, or if the RPC request fails.
   */
  async _getMultisigAccount () {
    const multisigPda = await this.getAddress()

    const { value } = await this._rpc
      .getAccountInfo(address(multisigPda), {
        commitment: this._commitment,
        encoding: 'base64'
      })
      .send()

    return this._decodeMultisigAccount(multisigPda, value)
  }

  /**
   * Reads the multisig and one of its proposals in a single request.
   *
   * @protected
   * @param {bigint} index - The proposal (transaction index) id.
   * @returns {Promise<Pick<SquadsProposalContext, 'multisig' | 'proposal'>>} The decoded
   *   multisig and proposal accounts.
   * @throws {Error} If the multisig address holds a non-Squads account, or if the RPC
   *   request fails.
   */
  async _getMultisigAndProposal (index) {
    const multisigPda = await this.getAddress()
    const proposalPda = await this._getProposalPda(multisigPda, index)

    const { value } = await this._rpc
      .getMultipleAccounts([address(multisigPda), proposalPda], {
        commitment: this._commitment,
        encoding: 'base64'
      })
      .send()

    return {
      multisig: this._decodeMultisigAccount(multisigPda, value[0]),
      proposal: this._decodeProposalAccount(proposalPda, value[1])
    }
  }

  /**
   * Reads the multisig, a proposal, its backing transaction and the clock in a single request.
   *
   * @protected
   * @param {bigint} index - The proposal (transaction index) id.
   * @returns {Promise<SquadsProposalContext>} The decoded accounts and the cluster's current
   *   Unix timestamp.
   * @throws {Error} If the multisig address holds a non-Squads account, the clock cannot be
   *   read, or the RPC request fails.
   */
  async _getMultisigProposalAndTransaction (index) {
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

    if (!clock) {
      throw new Error(`The clock sysvar ${CLOCK_SYSVAR_ADDRESS} could not be read.`)
    }

    const clockData = getBase64Encoder().encode(clock.data[0])
    const clockView = new DataView(clockData.buffer, clockData.byteOffset, clockData.byteLength)

    return {
      multisig: this._decodeMultisigAccount(multisigPda, multisig),
      proposal: this._decodeProposalAccount(proposalPda, proposal),
      transaction: this._decodeTransactionAccount(transactionPda, transaction),
      now: clockView.getBigInt64(CLOCK_UNIX_TIMESTAMP_OFFSET, true)
    }
  }

  /**
   * Reads the Squads program config account.
   *
   * @protected
   * @returns {Promise<SquadsProgramConfig>} The program config address, its multisig creation
   *   fee, and its treasury address.
   * @throws {Error} If the account is missing or is not a program config.
   */
  async _getProgramConfig () {
    const [programConfigPda] = await getProgramDerivedAddress({
      programAddress: this._programId,
      seeds: [SEED_PREFIX, SEED_PROGRAM_CONFIG]
    })

    const { value } = await this._rpc
      .getAccountInfo(programConfigPda, {
        commitment: this._commitment,
        encoding: 'base64'
      })
      .send()

    const data = value && getBase64Encoder().encode(value.data[0])

    if (!data || !this._hasDiscriminator(data, PROGRAM_CONFIG_DISCRIMINATOR)) {
      throw new Error(
        `The Squads program config account ${programConfigPda} could not be read.`
      )
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

    return {
      programConfigPda,
      creationFee: view.getBigUint64(PROGRAM_CONFIG_CREATION_FEE_OFFSET, true),
      treasury: getBase58Decoder().decode(
        data.subarray(PROGRAM_CONFIG_TREASURY_OFFSET, PROGRAM_CONFIG_TREASURY_OFFSET + ADDRESS_SIZE)
      )
    }
  }

  /**
   * Normalizes a proposal id into the Squads transaction index it refers to.
   *
   * @protected
   * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
   * @returns {bigint} The transaction index.
   * @throws {Error} If the id is not an integer between 0 and 18446744073709551615.
   */
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

  /**
   * Derives the address of the transaction account stored at the given index.
   *
   * @protected
   * @param {string} multisigPda - The multisig address the transaction belongs to.
   * @param {bigint} index - The transaction index.
   * @returns {Promise<Address>} The transaction address.
   */
  async _getTransactionPda (multisigPda, index) {
    const [transactionPda] = await getProgramDerivedAddress({
      programAddress: this._programId,
      seeds: this._getTransactionSeeds(multisigPda, index)
    })

    return transactionPda
  }

  /**
   * Derives the address of the proposal account that votes on the transaction at the given
   * index.
   *
   * @protected
   * @param {string} multisigPda - The multisig address the proposal belongs to.
   * @param {bigint} index - The transaction index the proposal votes on.
   * @returns {Promise<Address>} The proposal address.
   */
  async _getProposalPda (multisigPda, index) {
    const [proposalPda] = await getProgramDerivedAddress({
      programAddress: this._programId,
      seeds: [...this._getTransactionSeeds(multisigPda, index), SEED_PROPOSAL]
    })

    return proposalPda
  }

  /**
   * Derives the ephemeral signer addresses a stored transaction's message expects.
   *
   * @protected
   * @param {string} transactionPda - The transaction address the signers are derived from.
   * @param {number} count - How many the message needs.
   * @returns {Promise<Address[]>} The ephemeral signer addresses, in index order.
   */
  async _getEphemeralSignerPdas (transactionPda, count) {
    const encoder = getAddressEncoder()

    return Promise.all(
      Array.from({ length: count }, async (_unused, index) => {
        const [pda] = await getProgramDerivedAddress({
          programAddress: this._programId,
          seeds: [
            SEED_PREFIX,
            encoder.encode(address(transactionPda)),
            SEED_EPHEMERAL_SIGNER,
            Uint8Array.of(index)
          ]
        })

        return pda
      })
    )
  }

  /**
   * Derives a spending limit's address from the create key its action carries.
   *
   * @protected
   * @param {string} multisigPda - The multisig address.
   * @param {string} createKey - The action's `createKey`.
   * @returns {Promise<Address>} The spending limit address.
   */
  async _getSpendingLimitPda (multisigPda, createKey) {
    const [spendingLimitPda] = await getProgramDerivedAddress({
      programAddress: this._programId,
      seeds: [
        SEED_PREFIX,
        getAddressEncoder().encode(address(multisigPda)),
        SEED_SPENDING_LIMIT,
        getAddressEncoder().encode(address(createKey))
      ]
    })

    return spendingLimitPda
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
  _decodeMultisigAccount (multisigPda, account) {
    if (!account) {
      return {
        address: multisigPda,
        isCreated: false,
        configAuthority: null,
        threshold: 0,
        timeLock: 0,
        transactionIndex: 0n,
        staleTransactionIndex: 0n,
        rentCollector: null,
        members: []
      }
    }

    const data = getBase64Encoder().encode(account.data[0])

    if (account.owner !== this._programId || !this._hasDiscriminator(data, MULTISIG_DISCRIMINATOR)) {
      throw new Error(`The account ${multisigPda} is not a Squads multisig.`)
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const addressDecoder = getBase58Decoder()

    // An autonomous multisig stores the all-zero pubkey here; anything else is a controlled
    // multisig, whose configuration only its authority can change.
    const authority = addressDecoder.decode(
      data.subarray(MULTISIG_CONFIG_AUTHORITY_OFFSET, MULTISIG_CONFIG_AUTHORITY_OFFSET + ADDRESS_SIZE)
    )
    const configAuthority = authority === DEFAULT_ADDRESS ? null : authority

    const hasRentCollector = data[MULTISIG_RENT_COLLECTOR_OFFSET] === 1

    let offset = MULTISIG_RENT_COLLECTOR_OFFSET + OPTION_TAG_SIZE
    const rentCollector = hasRentCollector
      ? addressDecoder.decode(data.subarray(offset, offset + ADDRESS_SIZE))
      : null

    if (hasRentCollector) {
      offset += ADDRESS_SIZE
    }

    offset += BUMP_SIZE

    const count = view.getUint32(offset, true)
    offset += VEC_PREFIX_SIZE

    const members = []

    for (let i = 0; i < count; i++) {
      members.push({
        address: addressDecoder.decode(data.subarray(offset, offset + ADDRESS_SIZE)),
        mask: data[offset + ADDRESS_SIZE]
      })
      offset += MEMBER_SIZE
    }

    return {
      address: multisigPda,
      isCreated: true,
      configAuthority,
      threshold: view.getUint16(MULTISIG_THRESHOLD_OFFSET, true),
      timeLock: view.getUint32(MULTISIG_TIME_LOCK_OFFSET, true),
      transactionIndex: view.getBigUint64(MULTISIG_TRANSACTION_INDEX_OFFSET, true),
      staleTransactionIndex: view.getBigUint64(MULTISIG_STALE_TRANSACTION_INDEX_OFFSET, true),
      rentCollector,
      members
    }
  }

  /** @private */
  _decodeProposalAccount (proposalPda, account) {
    const absent = {
      address: proposalPda,
      exists: false,
      status: -1,
      statusName: null,
      statusPhrase: null,
      statusTimestamp: null,
      approved: [],
      rejected: [],
      cancelled: []
    }

    if (!account) {
      return absent
    }

    const data = getBase64Encoder().encode(account.data[0])

    if (account.owner !== this._programId || !this._hasDiscriminator(data, PROPOSAL_DISCRIMINATOR)) {
      return absent
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const addressDecoder = getBase58Decoder()
    const status = data[PROPOSAL_STATUS_OFFSET]

    const statusSize = status === PROPOSAL_STATUS_EXECUTING
      ? ENUM_TAG_SIZE
      : ENUM_TAG_SIZE + TIMESTAMP_SIZE

    let offset = PROPOSAL_STATUS_OFFSET + statusSize + BUMP_SIZE

    const readVoters = () => {
      const count = view.getUint32(offset, true)
      offset += VEC_PREFIX_SIZE

      const voters = []

      for (let i = 0; i < count; i++) {
        voters.push(addressDecoder.decode(data.subarray(offset, offset + ADDRESS_SIZE)))
        offset += ADDRESS_SIZE
      }

      return voters
    }

    return {
      address: proposalPda,
      exists: true,
      status,
      statusName: PROPOSAL_STATUS_NAMES[status] ?? `Unknown(${status})`,
      statusPhrase: PROPOSAL_STATUS_PHRASES[status] ?? `in an unknown status (${status})`,
      statusTimestamp: status === PROPOSAL_STATUS_EXECUTING
        ? null
        : view.getBigInt64(PROPOSAL_STATUS_TIMESTAMP_OFFSET, true),
      approved: readVoters(),
      rejected: readVoters(),
      cancelled: readVoters()
    }
  }

  /** @private */
  _decodeTransactionAccount (transactionPda, account) {
    const absent = {
      address: transactionPda,
      exists: false,
      kind: null,
      vaultIndex: 0,
      ephemeralSignerCount: 0,
      message: null,
      actions: []
    }

    if (!account || account.owner !== this._programId) {
      return absent
    }

    const data = getBase64Encoder().encode(account.data[0])
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

    if (this._hasDiscriminator(data, VAULT_TRANSACTION_DISCRIMINATOR)) {
      const ephemeralSignerCount = view.getUint32(VAULT_TRANSACTION_EPHEMERAL_BUMPS_OFFSET, true)

      return {
        ...absent,
        exists: true,
        kind: TRANSACTION_KIND.vault,
        vaultIndex: data[VAULT_TRANSACTION_VAULT_INDEX_OFFSET],
        ephemeralSignerCount,
        message: this._decodeVaultTransactionMessage(
          data,
          view,
          VAULT_TRANSACTION_EPHEMERAL_BUMPS_OFFSET + VEC_PREFIX_SIZE + ephemeralSignerCount
        )
      }
    }

    if (this._hasDiscriminator(data, CONFIG_TRANSACTION_DISCRIMINATOR)) {
      return {
        ...absent,
        exists: true,
        kind: TRANSACTION_KIND.config,
        actions: this._decodeConfigActions(data, view, CONFIG_TRANSACTION_ACTIONS_OFFSET)
      }
    }

    if (this._hasDiscriminator(data, BATCH_DISCRIMINATOR)) {
      return { ...absent, exists: true, kind: TRANSACTION_KIND.batch }
    }

    return { ...absent, exists: true }
  }

  /** @private */
  _decodeVaultTransactionMessage (data, view, start) {
    const addressDecoder = getBase58Decoder()

    let offset = start + MESSAGE_HEADER_SIZE

    const readAddress = () => {
      const value = addressDecoder.decode(data.subarray(offset, offset + ADDRESS_SIZE))
      offset += ADDRESS_SIZE

      return value
    }

    const readLength = () => {
      const length = view.getUint32(offset, true)
      offset += VEC_PREFIX_SIZE

      return length
    }

    const keyCount = readLength()
    const accountKeys = []

    for (let i = 0; i < keyCount; i++) {
      accountKeys.push(readAddress())
    }

    // The instructions carry nothing execution needs, but the lookups sit past them.
    const instructionCount = readLength()

    for (let i = 0; i < instructionCount; i++) {
      offset += PROGRAM_ID_INDEX_SIZE

      const accountIndexCount = readLength()
      offset += accountIndexCount

      const dataLength = readLength()
      offset += dataLength
    }

    const lookupCount = readLength()
    const addressTableLookups = []

    for (let i = 0; i < lookupCount; i++) {
      const accountKey = readAddress()
      const writableCount = readLength()
      const writableIndexes = Array.from(data.subarray(offset, offset + writableCount))

      offset += writableCount

      const readonlyCount = readLength()
      const readonlyIndexes = Array.from(data.subarray(offset, offset + readonlyCount))

      offset += readonlyCount

      addressTableLookups.push({ accountKey, writableIndexes, readonlyIndexes })
    }

    return {
      numSigners: data[start],
      numWritableSigners: data[start + 1],
      numWritableNonSigners: data[start + 2],
      accountKeys,
      addressTableLookups
    }
  }

  /** @private */
  _decodeConfigActions (data, view, start) {
    const addressDecoder = getBase58Decoder()

    let offset = start

    const count = view.getUint32(offset, true)
    offset += VEC_PREFIX_SIZE

    const actions = []

    for (let i = 0; i < count; i++) {
      const tag = data[offset]
      const kind = CONFIG_ACTION_NAMES[tag]

      if (kind === undefined) {
        throw new Error(
          `Unknown Squads config action ${tag}. This package cannot read config transactions created by a newer program version.`
        )
      }

      offset += ENUM_TAG_SIZE

      // Spending-limit actions name an account the executor has to pass through: the one to
      // create, keyed by `createKey`, or the one to close, given outright.
      let createKey = null
      let spendingLimit = null

      if (tag === CONFIG_ACTION_ADD_SPENDING_LIMIT) {
        createKey = addressDecoder.decode(data.subarray(offset, offset + ADDRESS_SIZE))
        offset += ADD_SPENDING_LIMIT_FIXED_SIZE

        const memberCount = view.getUint32(offset, true)
        offset += VEC_PREFIX_SIZE + ADDRESS_SIZE * memberCount

        const destinationCount = view.getUint32(offset, true)
        offset += VEC_PREFIX_SIZE + ADDRESS_SIZE * destinationCount
      } else if (tag === CONFIG_ACTION_REMOVE_SPENDING_LIMIT) {
        spendingLimit = addressDecoder.decode(data.subarray(offset, offset + ADDRESS_SIZE))
        offset += CONFIG_ACTION_BODY_SIZES[tag]
      } else if (tag === CONFIG_ACTION_SET_RENT_COLLECTOR) {
        offset += OPTION_TAG_SIZE + (data[offset] === 1 ? ADDRESS_SIZE : 0)
      } else {
        offset += CONFIG_ACTION_BODY_SIZES[tag]
      }

      actions.push({ kind, createKey, spendingLimit })
    }

    return actions
  }

  /** @private */
  _toProposal (proposalPda, account, index, threshold) {
    const proposal = this._decodeProposalAccount(proposalPda, account)

    if (!proposal.exists) {
      return null
    }

    return {
      proposalId: index.toString(),
      confirmations: proposal.approved.length,
      threshold,
      status: proposal.status === PROPOSAL_STATUS_EXECUTED ? 'executed' : 'pending',
      statusName: proposal.statusName,
      approved: proposal.approved,
      rejected: proposal.rejected,
      cancelled: proposal.cancelled
    }
  }
}
