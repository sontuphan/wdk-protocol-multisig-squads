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

import { address, getAddressEncoder, isOffCurveAddress } from '@solana/addresses'

import { getBase58Encoder, getBase64Encoder, getU64Encoder } from '@solana/codecs'

import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'

import { ACCOUNT, ACCOUNT_DISCRIMINATOR, PROPOSAL_STATUS } from './helpers/layouts.js'

import { getProgramDerivedAddressSync } from './helpers/program-derived-address.js'

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
 * The configuration a read-only Squads account takes: how to reach the cluster, and which
 * multisig to operate on. One field names the multisig: either its address, or the create key it
 * derives from. The two never look alike. A multisig address always sits off the ed25519 curve,
 * and a create key always sits on it, because it has to sign the multisig into being. A signing
 * account may give neither and supply `createKeySecret`, which the create key is derived from.
 *
 * @typedef {Object} SolanaMultisigSquadsReadOnlyConfig
 * @property {string | string[]} [provider] - A Solana RPC URL, or a list of URLs for failover. Omit it to derive addresses without reaching the cluster; every method that needs the cluster then throws.
 * @property {Commitment} [commitment] - The commitment level for transactions (default: 'confirmed').
 * @property {number} [retries] - The number of retries for the failover provider (default: 3).
 * @property {string} [programId] - The Squads program to operate against, for a fork or a local deployment (default: `SQUADS_PROGRAM_ADDRESS`).
 * @property {string} [multisigPdaOrCreateKey] - The address of an existing Squads multisig, or the create key its address derives from.
 */

/**
 * The extra configuration a signing account takes: the secret it derives a new multisig's
 * address from, and the fee ceilings above which it refuses to submit.
 *
 * @typedef {Object} SolanaMultisigSquadsSigningConfig
 * @property {string | Uint8Array} [createKeySecret] - The create key's secret, required to deploy a multisig. Base58 or raw bytes, either a 32-byte private key or a 64-byte keypair.
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
 * @property {string | null} configAuthority - The authority that alone may change the members and threshold, or null when the multisig votes on its own configuration.
 * @property {number} threshold - The number of approvals a proposal needs to be executable.
 * @property {number} timeLock - Seconds an approved proposal must wait before it can execute.
 * @property {bigint} transactionIndex - The index of the most recently created transaction.
 * @property {bigint} staleTransactionIndex - Proposals at or below this index were invalidated by a later configuration change and can no longer be voted on or executed.
 * @property {string | null} rentCollector - The address that reclaims rent when a proposal's accounts are closed, or null when the multisig collects none.
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
 * @property {bigint | null} statusTimestamp - The Unix timestamp the status was set at, or null while the proposal is executing, the one status Squads stores without a timestamp.
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
 * @property {SquadsTransactionKind | null} kind - The transaction kind, null when the account is absent or holds a kind this package cannot decode.
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

/**
 * The transaction kinds a Squads proposal can back, keyed by kind.
 *
 * @type {{ [K in SquadsTransactionKind]: K }}
 */
export const TRANSACTION_KIND = { vault: 'vault', config: 'config', batch: 'batch' }

const PROGRAM_ADDRESS = {
  default: '11111111111111111111111111111111',
  clockSysvar: 'SysvarC1ock11111111111111111111111111111111'
}

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

// What is left of the byte arithmetic: the account sizes the rent quotes are computed from, which
// `src/helpers/layouts.js` cannot supply because the accounts are sized before they hold anything.
const SIZE = {
  address: 32,
  member: 33,
  vecPrefix: 4,
  signature: 64,
  messageHeader: 3,
  programIdIndex: 1,
  systemTransferData: 12,
  multisigBase: 132,
  vaultTransactionBase: 83,
  configTransactionBase: 81,
  proposalBase: 70,
  proposalMember: 96,
  splTransferMessage: 164,
  splTransferWithAtaMessage: 308
}

const COUNT = {
  systemTransferAccountIndexes: 2,
  solTransferAccountKeys: 3,
  multisigCreateSignatures: 2n
}

const SEED = {
  prefix: 'multisig',
  multisig: 'multisig',
  vault: 'vault',
  transaction: 'transaction',
  proposal: 'proposal',
  programConfig: 'program_config',
  spendingLimit: 'spending_limit',
  ephemeralSigner: 'ephemeral_signer'
}

const DEFAULT = { vaultIndex: 0, memberCount: 1 }

const MAX = {
  vaultIndex: 255,
  memberCount: 65535,
  proposalIndex: 18446744073709551615n,
  multipleAccounts: 100
}

const SIGNATURE_BASE_FEE = 5000n

/**
 * Read-only Solana Squads multisig wallet account implementation.
 *
 * @implements {IWalletAccountReadOnlyMultisig}
 */
export default class WalletAccountReadOnlyMultisigSolanaSquads extends WalletAccountReadOnly {
  /**
   * Creates a new read-only Solana Squads multisig wallet account.
   *
   * @param {string | undefined} signerAddress - The signer's address, or undefined for a pure read-only account.
   * @param {SolanaMultisigSquadsReadOnlyConfig} config - The configuration object.
   */
  constructor (signerAddress, config) {
    super(signerAddress)

    /**
     * The multisig Squads configuration. It carries the signing fields too when a signing
     * account owns it, or when one derived this account through `_withConfig`.
     *
     * @protected
     * @type {SolanaMultisigSquadsConfig}
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
     * The address of the Squads program to operate against.
     *
     * @protected
     * @type {Address}
     */
    this._programId = address(config.programId ?? SQUADS_PROGRAM_ADDRESS)

    /**
     * The address of the Squads multisig account.
     *
     * @protected
     * @type {string | undefined}
     */
    this._multisigPda = config.multisigPdaOrCreateKey
      ? this._toMultisigPda(config.multisigPdaOrCreateKey)
      : undefined

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
   * @throws {Error} If no `multisigPdaOrCreateKey` is configured.
   */
  async getAddress () {
    if (!this._multisigPda) {
      throw new Error(
        'No multisig address is configured. Provide `multisigPdaOrCreateKey` in the config.'
      )
    }

    return this._multisigPda
  }

  /**
   * Returns whether the multisig account exists on-chain.
   *
   * @returns {Promise<boolean>} Whether the multisig account exists.
   * @throws {Error} If no address is configured, or if the RPC request fails.
   */
  async isDeployed () {
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to check whether the multisig exists.')
    }

    const multisigPda = await this.getAddress()

    const { value } = await this._rpc
      .getAccountInfo(address(multisigPda), {
        commitment: this._commitment,
        encoding: 'base64',
        dataSlice: { offset: 0, length: ACCOUNT_DISCRIMINATOR.multisig.length }
      })
      .send()

    if (!value) {
      return false
    }

    if (value.owner !== this._programId) {
      return false
    }

    return this._hasDiscriminator(
      getBase64Encoder().encode(value.data[0]),
      ACCOUNT_DISCRIMINATOR.multisig
    )
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
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to read the transaction index.')
    }

    const multisigPda = await this.getAddress()

    const { value } = await this._rpc
      .getAccountInfo(address(multisigPda), {
        commitment: this._commitment,
        encoding: 'base64',
        dataSlice: { offset: 0, length: ACCOUNT.multisigHeader.fixedSize }
      })
      .send()

    if (!value) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before reading its transaction index.`
      )
    }

    const data = getBase64Encoder().encode(value.data[0])

    if (
      value.owner !== this._programId ||
      !this._hasDiscriminator(data, ACCOUNT_DISCRIMINATOR.multisig)
    ) {
      throw new Error(`The account ${multisigPda} is not a Squads multisig.`)
    }

    return ACCOUNT.multisigHeader.decode(data).transactionIndex
  }

  /**
   * Returns the address of one of the multisig's vaults, where its funds are held.
   *
   * @param {number | string} [vaultIndexOrAddress] - A vault index between 0 and `MAX.vaultIndex`, or a vault address to use as given (default: 0).
   * @returns {Promise<string>} The vault address.
   * @throws {Error} If the index is out of range, or the address is not valid base58.
   */
  async getVaultAddress (vaultIndexOrAddress = DEFAULT.vaultIndex) {
    if (typeof vaultIndexOrAddress === 'string') {
      return address(vaultIndexOrAddress)
    }

    if (
      !Number.isInteger(vaultIndexOrAddress) ||
      vaultIndexOrAddress < DEFAULT.vaultIndex ||
      vaultIndexOrAddress > MAX.vaultIndex
    ) {
      throw new Error(
        `Invalid vault index ${vaultIndexOrAddress}. It must be an integer between ${DEFAULT.vaultIndex} and ${MAX.vaultIndex}.`
      )
    }

    const multisigPda = await this.getAddress()

    const [vaultPda] = getProgramDerivedAddressSync({
      programAddress: this._programId,
      seeds: [
        SEED.prefix,
        getAddressEncoder().encode(address(multisigPda)),
        SEED.vault,
        Uint8Array.of(vaultIndexOrAddress)
      ]
    })

    return vaultPda
  }

  /**
   * Returns the native SOL balance of one of the multisig's vaults.
   *
   * @param {number | string} [vaultIndexOrAddress] - A vault index between 0 and `MAX.vaultIndex`, or a vault address to read as given (default: 0).
   * @returns {Promise<bigint>} The balance in lamports.
   * @throws {Error} If the vault cannot be resolved, or if the RPC request fails.
   */
  async getBalance (vaultIndexOrAddress = DEFAULT.vaultIndex) {
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to retrieve balances.')
    }

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
   * @param {number | string} [vaultIndexOrAddress] - A vault index between 0 and `MAX.vaultIndex`, or a vault address to read as given (default: 0).
   * @returns {Promise<bigint>} The token balance (in base unit).
   * @throws {Error} If the mint address is malformed, or if the RPC request fails. @todo Support Token-2022 (Token Extensions Program).
   */
  async getTokenBalance (tokenAddress, vaultIndexOrAddress = DEFAULT.vaultIndex) {
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to retrieve token balances.')
    }

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
   * @returns {Promise<SolanaTransactionReceipt | null>} The receipt, or null if the transaction was not found.
   * @throws {Error} If the signature is malformed, or if the RPC request fails.
   */
  async getTransactionReceipt (hash) {
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to retrieve transaction receipts.')
    }

    let signatureSize = 0

    try {
      signatureSize = typeof hash === 'string' ? getBase58Encoder().encode(hash).length : 0
    } catch {
      signatureSize = 0
    }

    if (signatureSize !== SIZE.signature) {
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
   * @param {string} message - The signed message.
   * @param {string} signature - The signature to verify.
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
   * @returns {Promise<Record<string, SolanaMultisigProposal | null>>} For each id, the proposal, or null if no proposal exists at that id.
   * @throws {Error} If an id is not a non-negative integer, or if the RPC request fails.
   */
  async getProposals (proposalIds) {
    if (!proposalIds.length) {
      return {}
    }

    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to read proposals.')
    }

    const { address: multisigPda, threshold, isCreated } = await this.getMultisigInfo()

    if (!isCreated) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before reading its proposals.`
      )
    }

    const indices = proposalIds.map((id) => this._toProposalIndex(id))
    const proposalPdas = indices.map((index) => this._getProposalPda(multisigPda, index))

    const proposals = {}

    for (let offset = 0; offset < proposalPdas.length; offset += MAX.multipleAccounts) {
      const { value } = await this._rpc
        .getMultipleAccounts(proposalPdas.slice(offset, offset + MAX.multipleAccounts), {
          commitment: this._commitment,
          encoding: 'base64'
        })
        .send()

      value.forEach((account, i) => {
        const index = indices[offset + i]
        const proposal = this._decodeProposalAccount(proposalPdas[offset + i], account)

        proposals[index.toString()] = proposal.exists
          ? {
              proposalId: index.toString(),
              confirmations: proposal.approved.length,
              threshold,
              status: proposal.status === PROPOSAL_STATUS.executed ? 'executed' : 'pending',
              statusName: proposal.statusName,
              approved: proposal.approved,
              rejected: proposal.rejected,
              cancelled: proposal.cancelled
            }
          : null
      })
    }

    return proposals
  }

  /**
   * Returns the proposal at the given id.
   *
   * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
   * @returns {Promise<SolanaMultisigProposal | null>} The proposal, or null if no proposal exists at that id.
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
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to check whether a proposal can be executed.')
    }

    const index = this._toProposalIndex(proposalId)
    const multisigPda = await this.getAddress()

    const proposalPda = this._getProposalPda(multisigPda, index)
    const transactionPda = this._getTransactionPda(multisigPda, index)

    const { value } = await this._rpc
      .getMultipleAccounts(
        [address(multisigPda), proposalPda, transactionPda, address(PROGRAM_ADDRESS.clockSysvar)],
        { commitment: this._commitment, encoding: 'base64' }
      )
      .send()

    const [multisig, proposal, transaction, clock] = value

    if (!multisig || !proposal || !transaction || !clock) {
      return false
    }

    const proposalData = getBase64Encoder().encode(proposal.data[0])
    const multisigData = getBase64Encoder().encode(multisig.data[0])

    if (
      !this._hasDiscriminator(proposalData, ACCOUNT_DISCRIMINATOR.proposal) ||
      !this._hasDiscriminator(multisigData, ACCOUNT_DISCRIMINATOR.multisig)
    ) {
      return false
    }

    const { status, timestamp: approvedAt } = ACCOUNT.proposal.decode(proposalData).status

    if (status !== PROPOSAL_STATUS.approved) {
      return false
    }

    const { timeLock, staleTransactionIndex } = ACCOUNT.multisig.decode(multisigData)
    const transactionData = getBase64Encoder().encode(transaction.data[0])

    // The transaction account is read for its discriminator alone: only a config transaction goes
    // stale, and `config_transaction_execute` is the one instruction that checks the index.
    if (
      this._hasDiscriminator(transactionData, ACCOUNT_DISCRIMINATOR.configTransaction) &&
      index <= staleTransactionIndex
    ) {
      return false
    }

    const { unixTimestamp: now } = ACCOUNT.clock.decode(getBase64Encoder().encode(clock.data[0]))

    return now - approvedAt >= BigInt(timeLock)
  }

  /**
   * Returns the signed-message proposals for the given message hashes. Not supported by Squads.
   *
   * @param {string[]} messageIds - The message hashes.
   * @returns {Promise<Record<string, MultisigMessageProposal | null>>} For each hash, the message proposal, or null if it has not been found.
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
   * @returns {Promise<MultisigMessageProposal | null>} The message proposal, or null if it has not been found.
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
  async quoteDeploy (memberCount = DEFAULT.memberCount) {
    if (!Number.isInteger(memberCount) || memberCount < 1 || memberCount > MAX.memberCount) {
      throw new Error(
        `Invalid member count ${memberCount}. It must be an integer between 1 and ${MAX.memberCount}.`
      )
    }

    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to quote deploy operations.')
    }

    const [{ creationFee }, rent] = await Promise.all([
      this._getProgramConfig(),
      this._rpc
        .getMinimumBalanceForRentExemption(BigInt(SIZE.multisigBase + SIZE.member * memberCount))
        .send()
    ])

    return {
      fee: rent + creationFee + SIGNATURE_BASE_FEE * COUNT.multisigCreateSignatures
    }
  }

  /**
   * Quotes the costs of a propose operation.
   *
   * @param {SolanaTransaction} tx - The transaction to quote.
   * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged over this account's configuration.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction quote, in lamports.
   * @throws {Error} If the multisig does not exist, the transaction is malformed, or the RPC request fails.
   */
  async quotePropose (tx, config) {
    const account = await this._withConfig(config)
    const { address: multisigPda, owners, isCreated } = await account.getMultisigInfo()

    if (!isCreated) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before quoting transactions.`
      )
    }

    if (!account._rpc) {
      throw new Error('The wallet must be connected to a provider to quote transactions.')
    }

    address(tx.to)

    const instructionSize =
      SIZE.programIdIndex +
      (SIZE.vecPrefix + COUNT.systemTransferAccountIndexes) +
      (SIZE.vecPrefix + SIZE.systemTransferData)
    const messageSize =
      SIZE.messageHeader +
      (SIZE.vecPrefix + SIZE.address * COUNT.solTransferAccountKeys) +
      (SIZE.vecPrefix + instructionSize) +
      SIZE.vecPrefix
    const rent = await account._quoteProposalRent(
      account._vaultTransactionSize(messageSize),
      owners.length
    )

    return { fee: rent + SIGNATURE_BASE_FEE }
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * @param {TransferOptions} transferOptions - The transfer options.
   * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged over this account's configuration.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transfer quote, in lamports.
   * @throws {Error} If the transfer options are invalid, the multisig does not exist, or the RPC request fails. @todo Support Token-2022 (Token Extensions Program).
   */
  async quoteTransfer (transferOptions, config) {
    const mint = address(transferOptions.token)
    const recipient = address(transferOptions.recipient)

    const account = await this._withConfig(config)
    const { address: multisigPda, owners, isCreated } = await account.getMultisigInfo()

    if (!isCreated) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before quoting transfers.`
      )
    }

    if (!account._rpc) {
      throw new Error('The wallet must be connected to a provider to quote transfer operations.')
    }

    const [recipientAta] = await findAssociatedTokenPda({
      mint,
      owner: recipient,
      tokenProgram: TOKEN_PROGRAM_ADDRESS
    })
    const { value: recipientAtaAccount } = await account._rpc
      .getAccountInfo(recipientAta, {
        commitment: account._commitment,
        encoding: 'base64'
      })
      .send()
    const messageSize = recipientAtaAccount ? SIZE.splTransferMessage : SIZE.splTransferWithAtaMessage

    const rent = await account._quoteProposalRent(
      account._vaultTransactionSize(messageSize),
      owners.length
    )

    return { fee: rent + SIGNATURE_BASE_FEE }
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
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to read the multisig account.')
    }

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
   * @returns {Promise<Pick<SquadsProposalContext, 'multisig' | 'proposal'>>} The decoded multisig and proposal accounts.
   * @throws {Error} If the multisig address holds a non-Squads account, or if the RPC request fails.
   */
  async _getMultisigAndProposal (index) {
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to read the multisig and its proposals.')
    }

    const multisigPda = await this.getAddress()
    const proposalPda = this._getProposalPda(multisigPda, index)

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
   * @returns {Promise<SquadsProposalContext>} The decoded accounts and the cluster's current Unix timestamp.
   * @throws {Error} If the multisig address holds a non-Squads account, or the RPC request fails.
   */
  async _getMultisigProposalAndTransaction (index) {
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to read the multisig and its proposals.')
    }

    const multisigPda = await this.getAddress()
    const proposalPda = this._getProposalPda(multisigPda, index)
    const transactionPda = this._getTransactionPda(multisigPda, index)

    const { value } = await this._rpc
      .getMultipleAccounts(
        [address(multisigPda), proposalPda, transactionPda, address(PROGRAM_ADDRESS.clockSysvar)],
        { commitment: this._commitment, encoding: 'base64' }
      )
      .send()

    const [multisig, proposal, transaction, clock] = value

    if (!clock) {
      throw new Error(`The clock sysvar ${PROGRAM_ADDRESS.clockSysvar} could not be read.`)
    }

    return {
      multisig: this._decodeMultisigAccount(multisigPda, multisig),
      proposal: this._decodeProposalAccount(proposalPda, proposal),
      transaction: this._decodeTransactionAccount(transactionPda, transaction),
      now: ACCOUNT.clock.decode(getBase64Encoder().encode(clock.data[0])).unixTimestamp
    }
  }

  /**
   * Reads the Squads program config account.
   *
   * @protected
   * @returns {Promise<SquadsProgramConfig>} The program config address, its multisig creation fee, and its treasury address.
   * @throws {Error} If the account is missing or is not a program config.
   */
  async _getProgramConfig () {
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to read the Squads program config.')
    }

    const [programConfigPda] = getProgramDerivedAddressSync({
      programAddress: this._programId,
      seeds: [SEED.prefix, SEED.programConfig]
    })

    const { value } = await this._rpc
      .getAccountInfo(programConfigPda, {
        commitment: this._commitment,
        encoding: 'base64'
      })
      .send()

    const data = value && getBase64Encoder().encode(value.data[0])

    if (!data || !this._hasDiscriminator(data, ACCOUNT_DISCRIMINATOR.programConfig)) {
      throw new Error(
        `The Squads program config account ${programConfigPda} could not be read.`
      )
    }

    const { creationFee, treasury } = ACCOUNT.programConfig.decode(data)

    return { programConfigPda, creationFee, treasury }
  }

  /**
   * Returns the size of the `VaultTransaction` account a message of the given size is stored in.
   *
   * @protected
   * @param {number} messageSize - The size of the compiled transaction message, in bytes.
   * @returns {number} The account's size, in bytes.
   */
  _vaultTransactionSize (messageSize) {
    return SIZE.vaultTransactionBase + SIZE.vecPrefix + messageSize
  }

  /**
   * Returns the size of the `ConfigTransaction` account the given actions are stored in.
   *
   * @protected
   * @param {number} actionsSize - The size of the encoded action list, its length prefix included.
   * @returns {number} The account's size, in bytes.
   */
  _configTransactionSize (actionsSize) {
    return SIZE.configTransactionBase + actionsSize
  }

  /**
   * Quotes the rent of the two accounts a proposal creates, the transaction and the proposal.
   *
   * @protected
   * @param {number} transactionSize - The size of the transaction account, in bytes.
   * @param {number} memberCount - How many members the multisig holds.
   * @returns {Promise<bigint>} The rent both accounts lock up, in lamports.
   * @throws {Error} If the wallet is not connected to a provider, or if the RPC request fails.
   */
  async _quoteProposalRent (transactionSize, memberCount) {
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to quote account rent.')
    }

    const proposalSize = SIZE.proposalBase + SIZE.proposalMember * memberCount

    const [transactionRent, proposalRent] = await Promise.all([
      this._rpc.getMinimumBalanceForRentExemption(BigInt(transactionSize)).send(),
      this._rpc.getMinimumBalanceForRentExemption(BigInt(proposalSize)).send()
    ])

    return transactionRent + proposalRent
  }

  /**
   * Normalizes a proposal id into the Squads transaction index it refers to.
   *
   * @protected
   * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
   * @returns {bigint} The transaction index.
   * @throws {Error} If the id is not an integer between 0 and `MAX.proposalIndex`.
   */
  _toProposalIndex (proposalId) {
    let index = null

    try {
      index = BigInt(proposalId)
    } catch {}

    if (index === null || index < 0n || index > MAX.proposalIndex) {
      throw new Error(
        `Invalid proposal id ${proposalId}. It must be an integer between 0 and ${MAX.proposalIndex}.`
      )
    }

    return index
  }

  /**
   * Resolves what the config names, an address or a create key, to the multisig address.
   *
   * @protected
   * @param {string} multisigPdaOrCreateKey - The multisig address, or the create key it derives from.
   * @returns {Address} The multisig address.
   * @throws {Error} If the value is not an address.
   */
  _toMultisigPda (multisigPdaOrCreateKey) {
    const identity = address(multisigPdaOrCreateKey)

    if (isOffCurveAddress(identity)) {
      return identity
    }

    const [multisigPda] = getProgramDerivedAddressSync({
      programAddress: this._programId,
      seeds: [
        SEED.prefix,
        SEED.multisig,
        getAddressEncoder().encode(identity)
      ]
    })

    return multisigPda
  }

  /**
   * Derives the address of the transaction account stored at the given index.
   *
   * @protected
   * @param {string} multisigPda - The multisig address the transaction belongs to.
   * @param {bigint} index - The transaction index.
   * @returns {Address} The transaction address.
   */
  _getTransactionPda (multisigPda, index) {
    const [transactionPda] = getProgramDerivedAddressSync({
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
   * @returns {Address} The proposal address.
   */
  _getProposalPda (multisigPda, index) {
    const [proposalPda] = getProgramDerivedAddressSync({
      programAddress: this._programId,
      seeds: [...this._getTransactionSeeds(multisigPda, index), SEED.proposal]
    })

    return proposalPda
  }

  /**
   * Derives the ephemeral signer addresses a stored transaction's message expects.
   *
   * @protected
   * @param {string} transactionPda - The transaction address the signers are derived from.
   * @param {number} count - How many the message needs.
   * @returns {Address[]} The ephemeral signer addresses, in index order.
   */
  _getEphemeralSignerPdas (transactionPda, count) {
    const encoder = getAddressEncoder()

    return Array.from({ length: count }, (_unused, index) => {
      const [pda] = getProgramDerivedAddressSync({
        programAddress: this._programId,
        seeds: [
          SEED.prefix,
          encoder.encode(address(transactionPda)),
          SEED.ephemeralSigner,
          Uint8Array.of(index)
        ]
      })

      return pda
    })
  }

  /**
   * Derives a spending limit's address from the create key its action carries.
   *
   * @protected
   * @param {string} multisigPda - The multisig address.
   * @param {string} createKey - The action's `createKey`.
   * @returns {Address} The spending limit address.
   */
  _getSpendingLimitPda (multisigPda, createKey) {
    const [spendingLimitPda] = getProgramDerivedAddressSync({
      programAddress: this._programId,
      seeds: [
        SEED.prefix,
        getAddressEncoder().encode(address(multisigPda)),
        SEED.spendingLimit,
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
  async _withConfig (config) {
    if (!config) {
      return this
    }

    let identity = {}

    if (!config.multisigPdaOrCreateKey) {
      identity = {
        multisigPdaOrCreateKey: this._config.multisigPdaOrCreateKey ?? await this.getAddress()
      }
    }

    const account = new WalletAccountReadOnlyMultisigSolanaSquads(this._signerAddress, {
      ...this._config,
      ...identity,
      ...config
    })

    return account
  }

  /** @private */
  _getTransactionSeeds (multisigPda, index) {
    return [
      SEED.prefix,
      getAddressEncoder().encode(address(multisigPda)),
      SEED.transaction,
      getU64Encoder().encode(index)
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

    if (
      account.owner !== this._programId ||
      !this._hasDiscriminator(data, ACCOUNT_DISCRIMINATOR.multisig)
    ) {
      throw new Error(`The account ${multisigPda} is not a Squads multisig.`)
    }

    const {
      configAuthority,
      threshold,
      timeLock,
      transactionIndex,
      staleTransactionIndex,
      rentCollector,
      members
    } = ACCOUNT.multisig.decode(data)

    return {
      address: multisigPda,
      isCreated: true,
      // Squads writes the default address rather than an option when the multisig governs itself.
      configAuthority: configAuthority === PROGRAM_ADDRESS.default ? null : configAuthority,
      threshold,
      timeLock,
      transactionIndex,
      staleTransactionIndex,
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

    if (
      account.owner !== this._programId ||
      !this._hasDiscriminator(data, ACCOUNT_DISCRIMINATOR.proposal)
    ) {
      return absent
    }

    const {
      status: { status, timestamp },
      approved,
      rejected,
      cancelled
    } = ACCOUNT.proposal.decode(data)

    return {
      address: proposalPda,
      exists: true,
      status,
      statusName: PROPOSAL_STATUS_NAMES[status] ?? `Unknown(${status})`,
      statusPhrase: PROPOSAL_STATUS_PHRASES[status] ?? `in an unknown status (${status})`,
      statusTimestamp: timestamp,
      approved,
      rejected,
      cancelled
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

    if (this._hasDiscriminator(data, ACCOUNT_DISCRIMINATOR.vaultTransaction)) {
      const { vaultIndex, ephemeralSignerBumps, message } = ACCOUNT.vaultTransaction.decode(data)

      return {
        ...absent,
        exists: true,
        kind: TRANSACTION_KIND.vault,
        vaultIndex,
        ephemeralSignerCount: ephemeralSignerBumps.length,
        message: {
          numSigners: message.numSigners,
          numWritableSigners: message.numWritableSigners,
          numWritableNonSigners: message.numWritableNonSigners,
          accountKeys: message.accountKeys,
          addressTableLookups: message.addressTableLookups
        }
      }
    }

    if (this._hasDiscriminator(data, ACCOUNT_DISCRIMINATOR.configTransaction)) {
      return {
        ...absent,
        exists: true,
        kind: TRANSACTION_KIND.config,
        actions: ACCOUNT.configTransaction.decode(data).actions.map((action) => ({
          kind: action.__kind,
          // The only two actions whose spending limit the executor has to pass through.
          createKey: action.__kind === 'AddSpendingLimit' ? action.createKey : null,
          spendingLimit: action.__kind === 'RemoveSpendingLimit' ? action.spendingLimit : null
        }))
      }
    }

    if (this._hasDiscriminator(data, ACCOUNT_DISCRIMINATOR.batch)) {
      return { ...absent, exists: true, kind: TRANSACTION_KIND.batch }
    }

    return { ...absent, exists: true }
  }
}
