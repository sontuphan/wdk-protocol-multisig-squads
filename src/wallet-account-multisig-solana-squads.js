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

import { NotImplementedError } from '@tetherto/wdk-wallet'

import { WalletAccountSolana } from '@tetherto/wdk-wallet-solana'

import WalletAccountReadOnlyMultisigSolanaSquads from './wallet-account-read-only-multisig-solana-squads.js'

import { NotSupportedError } from './errors.js'

import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses'

import { getBase58Encoder } from '@solana/codecs'

import { createKeyPairSignerFromBytes, createKeyPairSignerFromPrivateKeyBytes } from '@solana/signers'

const SYSTEM_PROGRAM_ADDRESS = '11111111111111111111111111111111'

const MULTISIG_CREATE_V2_DISCRIMINATOR = [50, 221, 199, 93, 40, 245, 139, 233]

const ACCOUNT_ROLE_READONLY = 0
const ACCOUNT_ROLE_WRITABLE = 1
const ACCOUNT_ROLE_READONLY_SIGNER = 2
const ACCOUNT_ROLE_WRITABLE_SIGNER = 3

const ADDRESS_SIZE = 32
const MEMBER_SIZE = 33
const OPTION_NONE = 0
const ALMIGHTY_PERMISSIONS = 7
const DEFAULT_THRESHOLD = 1
const DEFAULT_TIME_LOCK = 0

const PRIVATE_KEY_SIZE = 32
const KEY_PAIR_SIZE = 64

const CREATE_ARGS_CONFIG_AUTHORITY_OFFSET = 8
const CREATE_ARGS_THRESHOLD_OFFSET = 9
const CREATE_ARGS_MEMBER_COUNT_OFFSET = 11
const CREATE_ARGS_TRAILING_SIZE = 6

const VEC_PREFIX_SIZE = 4

const SEED_PREFIX = 'multisig'
const SEED_MULTISIG = 'multisig'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountMultisig} IWalletAccountMultisig */
/** @typedef {import('@tetherto/wdk-wallet').MultisigResult} MultisigResult */
/** @typedef {import('@tetherto/wdk-wallet').MultisigTransactionResult} MultisigTransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').MultisigExecuteResult} MultisigExecuteResult */
/** @typedef {import('@tetherto/wdk-wallet').MultisigSendOptions} MultisigSendOptions */
/** @typedef {import('@tetherto/wdk-wallet').MultisigOptions} MultisigOptions */
/** @typedef {import('@tetherto/wdk-wallet').MessageProposal} MessageProposal */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */

/** @typedef {import('@tetherto/wdk-wallet-solana').SimpleSolanaTransaction} SimpleSolanaTransaction */

/** @typedef {import('./wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsConfig} SolanaMultisigSquadsConfig */

/**
 * Solana Squads multisig wallet account with signing capabilities.
 * Provides full transaction and message signing operations.
 *
 * @implements {IWalletAccountMultisig}
 */
export default class WalletAccountMultisigSolanaSquads extends WalletAccountReadOnlyMultisigSolanaSquads {
  /**
   * Creates a new Solana Squads multisig wallet account.
   *
   * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   * @param {string} path - The SLIP-0010 derivation path (e.g. "0'/0'").
   * @param {SolanaMultisigSquadsConfig} config - The configuration object.
   */
  constructor (seed, path, config) {
    const signerAccount = new WalletAccountSolana(seed, path, config)

    super(signerAccount._address ?? null, config)

    /**
     * The multisig Squads configuration.
     *
     * @protected
     * @type {SolanaMultisigSquadsConfig}
     */
    this._config = config

    /**
     * The underlying Solana signer account.
     *
     * @protected
     * @type {WalletAccountSolana}
     */
    this._signerAccount = signerAccount
  }

  /**
   * Returns the address of the Squads multisig account.
   *
   * Resolves the create key from `createKeySecret` when no `multisigPda` or `createKey`
   * is configured, so a deploying account can report its address before it exists.
   *
   * @returns {Promise<string>} The multisig address.
   * @throws {Error} If the multisig address cannot be resolved.
   */
  async getAddress () {
    if (!this._multisigPda && !this._createKey && this._config.createKeySecret) {
      this._createKey = (await this._getCreateKeySigner()).address
    }

    return super.getAddress()
  }

  /**
   * Signs a message with the signer account.
   *
   * @param {string | Uint8Array} message - The message to sign.
   * @returns {Promise<string>} The signature.
   */
  async sign (message) {
    return this._signerAccount.sign(message)
  }

  /**
   * Proposes a message to be signed by the multisig members.
   *
   * **Not supported, and not pending work.** Squads has no message-signing primitive,
   * and a multisig cannot produce a signature: its accounts are program-derived
   * addresses with no private key. Members can approve a message on-chain by wrapping
   * it in a vault transaction, but that yields proof of approval rather than a
   * signature — and the resulting proposal is addressed by transaction index, not by
   * message hash, so {@link approveMessage} could not find it again.
   *
   * Use {@link sign} to sign a message with this account's own signer key, which proves
   * one member's consent rather than the multisig's.
   *
   * @param {string | Uint8Array} message - The message to propose.
   * @returns {Promise<MessageProposal>} The message proposal.
   * @throws {NotSupportedError} Always, for the reasons above.
   */
  async proposeMessage (message) {
    throw new NotSupportedError(
      'proposeMessage(message)',
      'Squads has no message-signing primitive, and a multisig cannot produce a signature because its accounts are program-derived addresses with no private key. Use sign(message) to sign with this account\'s own signer key instead.'
    )
  }

  /**
   * Approves a pending message proposal.
   *
   * **Not supported, and not pending work.** See {@link proposeMessage}: Squads has no
   * message-signing primitive, and a message hash cannot be resolved to a Squads
   * account, which are keyed by sequential transaction index.
   *
   * @param {string} messageHash - The hash of the proposed message.
   * @returns {Promise<MessageProposal>} The updated message proposal.
   * @throws {NotSupportedError} Always, for the reasons above.
   */
  async approveMessage (messageHash) {
    throw new NotSupportedError(
      'approveMessage(messageHash)',
      'Squads has no message-signing primitive, and a message hash cannot be resolved to a Squads account, which are keyed by sequential transaction index'
    )
  }

  /**
   * Validates that the signer is a member of the multisig.
   *
   * Checks membership only — not the permission a given operation requires.
   *
   * @returns {Promise<void>}
   * @throws {Error} If there is no signer, the multisig does not exist, or the signer is
   *   not one of its members.
   */
  async validateSignerIsOwner () {
    const signerAddress = await this.getSignerAddress()

    if (!signerAddress) {
      throw new Error('No signer is associated with this account.')
    }

    const { address: multisigPda, owners, isCreated } = await this.getMultisigInfo()

    if (!isCreated) {
      throw new Error(`The multisig account ${multisigPda} does not exist.`)
    }

    if (!owners.includes(signerAddress)) {
      throw new Error(
        `The signer ${signerAddress} is not a member of the multisig ${multisigPda}.`
      )
    }
  }

  /**
   * Deploys (creates) the multisig account on-chain.
   *
   * Requires `createKeySecret` in the configuration: the multisig's address derives from
   * that key, so **retain it** — losing it makes the address, and any funds in its vault,
   * unrecoverable.
   *
   * Owners default to this account's signer alone with a threshold of 1, creating a
   * single-member multisig that {@link addOwner} can grow. Every owner is created with
   * full permissions.
   *
   * @param {string[]} [owners] - The member addresses. Defaults to this account's signer.
   * @param {number} [threshold=1] - The approvals a proposal needs.
   * @returns {Promise<{ hash: string }>} The creation transaction's signature.
   * @throws {Error} If `createKeySecret` is missing, the owners or threshold are invalid,
   *   the multisig already exists, or the quoted fee exceeds `createMaxFee`.
   */
  async deploy (owners, threshold = DEFAULT_THRESHOLD) {
    const createKeySigner = await this._getCreateKeySigner()
    const [expectedPda] = await getProgramDerivedAddress({
      programAddress: this._programId,
      seeds: [SEED_PREFIX, SEED_MULTISIG, getAddressEncoder().encode(createKeySigner.address)]
    })

    if (this._multisigPda && this._multisigPda !== expectedPda) {
      throw new Error(
        `The configured multisig ${this._multisigPda} does not derive from the configured createKeySecret (${expectedPda}).`
      )
    }

    this._createKey = createKeySigner.address
    this._multisigPda = expectedPda

    const members = owners ?? [await this.getSignerAddress()]

    this._validateOwners(members, threshold)

    if (await this.isDeployed()) {
      throw new Error(`The multisig account ${expectedPda} already exists.`)
    }

    const { fee } = await this.quoteDeploy(members.length)
    const { createMaxFee } = this._config

    if (createMaxFee !== undefined && fee >= BigInt(createMaxFee)) {
      throw new Error('Exceeded maximum fee cost for the deploy operation.')
    }

    const { programConfigPda, treasury } = await this._getProgramConfig()

    const instruction = {
      programAddress: this._programId,
      accounts: [
        { address: address(programConfigPda), role: ACCOUNT_ROLE_READONLY },
        { address: address(treasury), role: ACCOUNT_ROLE_WRITABLE },
        { address: address(expectedPda), role: ACCOUNT_ROLE_WRITABLE },
        {
          address: createKeySigner.address,
          role: ACCOUNT_ROLE_READONLY_SIGNER,
          signer: createKeySigner
        },
        { address: address(this._signerAddress), role: ACCOUNT_ROLE_WRITABLE_SIGNER },
        { address: address(SYSTEM_PROGRAM_ADDRESS), role: ACCOUNT_ROLE_READONLY }
      ],
      data: this._encodeMultisigCreateV2Data(members, threshold)
    }

    const { hash } = await this._signerAccount.sendTransaction({ instructions: [instruction] })

    return { hash }
  }

  /**
   * Proposes a transaction to the multisig (and optionally executes it once approved).
   *
   * @param {SimpleSolanaTransaction} tx - The transaction to propose.
   * @param {MultisigSendOptions} [options] - The send options.
   * @returns {Promise<MultisigTransactionResult>} The proposal result.
   */
  async sendTransaction (tx, options = {}) {
    throw new NotImplementedError('sendTransaction(tx, options)')
  }

  /**
   * Proposes a native SOL / SPL token transfer to the multisig.
   *
   * @param {TransferOptions} transferOptions - The transfer options.
   * @param {MultisigSendOptions} [options] - The send options.
   * @returns {Promise<MultisigTransactionResult>} The transfer proposal result.
   */
  async transfer (transferOptions, options = {}) {
    throw new NotImplementedError('transfer(transferOptions, options)')
  }

  /**
   * Approves a pending transaction proposal.
   *
   * @param {number | bigint} proposalId - The proposal (transaction index) id.
   * @returns {Promise<MultisigTransactionResult>} The approval result.
   */
  async approveTx (proposalId) {
    throw new NotImplementedError('approveTx(proposalId)')
  }

  /**
   * Rejects a pending transaction proposal.
   *
   * @param {number | bigint} proposalId - The proposal (transaction index) id.
   * @returns {Promise<MultisigTransactionResult>} The rejection result.
   */
  async rejectTx (proposalId) {
    throw new NotImplementedError('rejectTx(proposalId)')
  }

  /**
   * Executes an approved transaction proposal.
   *
   * @param {number | bigint} proposalId - The proposal (transaction index) id.
   * @returns {Promise<MultisigExecuteResult>} The execution result.
   */
  async executeTx (proposalId) {
    throw new NotImplementedError('executeTx(proposalId)')
  }

  /**
   * Proposes adding a new member to the multisig.
   *
   * @param {string} ownerAddress - The address of the member to add.
   * @param {MultisigOptions} [options] - The operation options.
   * @returns {Promise<MultisigTransactionResult>} The operation result.
   */
  async addOwner (ownerAddress, options = {}) {
    throw new NotImplementedError('addOwner(ownerAddress, options)')
  }

  /**
   * Proposes removing a member from the multisig.
   *
   * @param {string} ownerAddress - The address of the member to remove.
   * @param {MultisigOptions} [options] - The operation options.
   * @returns {Promise<MultisigTransactionResult>} The operation result.
   */
  async removeOwner (ownerAddress, options = {}) {
    throw new NotImplementedError('removeOwner(ownerAddress, options)')
  }

  /**
   * Proposes swapping one member for another.
   *
   * @param {string} oldOwnerAddress - The address of the member to replace.
   * @param {string} newOwnerAddress - The address of the new member.
   * @param {MultisigOptions} [options] - The operation options.
   * @returns {Promise<MultisigTransactionResult>} The operation result.
   */
  async swapOwner (oldOwnerAddress, newOwnerAddress, options = {}) {
    throw new NotImplementedError('swapOwner(oldOwnerAddress, newOwnerAddress, options)')
  }

  /**
   * Proposes changing the approval threshold of the multisig.
   *
   * @param {number} newThreshold - The new threshold.
   * @param {MultisigOptions} [options] - The operation options.
   * @returns {Promise<MultisigTransactionResult>} The operation result.
   */
  async changeThreshold (newThreshold, options = {}) {
    throw new NotImplementedError('changeThreshold(newThreshold, options)')
  }

  /**
   * Proposes replacing the full member set and threshold in a single operation.
   *
   * @param {string[]} newOwners - The new member addresses.
   * @param {number} newThreshold - The new threshold.
   * @param {MultisigOptions} [options] - The operation options.
   * @returns {Promise<MultisigTransactionResult>} The operation result.
   */
  async updateOwners (newOwners, newThreshold, options = {}) {
    throw new NotImplementedError('updateOwners(newOwners, newThreshold, options)')
  }

  /**
   * Returns a read-only view of this account.
   *
   * @returns {WalletAccountReadOnlyMultisigSolanaSquads} The read-only account.
   */
  toReadOnlyAccount () {
    return new WalletAccountReadOnlyMultisigSolanaSquads(this._signerAddress, this._config)
  }

  /**
   * Clears the signer's private key material from memory.
   *
   * @returns {void}
   */
  dispose () {
    this._signerAccount.dispose()
  }

  /** @private */
  async _getCreateKeySigner () {
    const secret = this._config.createKeySecret

    if (!secret) {
      throw new Error(
        'A `createKeySecret` is required to create a multisig. Provide it in the configuration.'
      )
    }

    const bytes = typeof secret === 'string' ? getBase58Encoder().encode(secret) : secret

    if (bytes.length === PRIVATE_KEY_SIZE) {
      return createKeyPairSignerFromPrivateKeyBytes(bytes)
    }

    if (bytes.length === KEY_PAIR_SIZE) {
      return createKeyPairSignerFromBytes(bytes)
    }

    throw new Error(
      `Invalid createKeySecret of ${bytes.length} bytes. Expected ${PRIVATE_KEY_SIZE} or ${KEY_PAIR_SIZE}.`
    )
  }

  /** @private */
  _validateOwners (owners, threshold) {
    if (!Array.isArray(owners) || !owners.length) {
      throw new Error('At least one owner is required to create a multisig.')
    }

    if (new Set(owners).size !== owners.length) {
      throw new Error('The owners of a multisig must be unique.')
    }

    for (const owner of owners) {
      address(owner)
    }

    if (!Number.isInteger(threshold) || threshold < 1 || threshold > owners.length) {
      throw new Error(
        `Invalid threshold ${threshold}. It must be an integer between 1 and the number of owners (${owners.length}).`
      )
    }
  }

  /** @private */
  _encodeMultisigCreateV2Data (owners, threshold) {
    const data = new Uint8Array(
      CREATE_ARGS_MEMBER_COUNT_OFFSET +
      VEC_PREFIX_SIZE +
      MEMBER_SIZE * owners.length +
      CREATE_ARGS_TRAILING_SIZE
    )
    const view = new DataView(data.buffer)
    const addressEncoder = getAddressEncoder()

    data.set(MULTISIG_CREATE_V2_DISCRIMINATOR, 0)
    data[CREATE_ARGS_CONFIG_AUTHORITY_OFFSET] = OPTION_NONE
    view.setUint16(CREATE_ARGS_THRESHOLD_OFFSET, threshold, true)
    view.setUint32(CREATE_ARGS_MEMBER_COUNT_OFFSET, owners.length, true)

    let offset = CREATE_ARGS_MEMBER_COUNT_OFFSET + VEC_PREFIX_SIZE

    for (const owner of owners) {
      data.set(addressEncoder.encode(address(owner)), offset)
      data[offset + ADDRESS_SIZE] = ALMIGHTY_PERMISSIONS
      offset += MEMBER_SIZE
    }

    view.setUint32(offset, DEFAULT_TIME_LOCK, true)

    return data
  }
}
