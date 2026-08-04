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

import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS
} from '@solana-program/token'

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

const VAULT_TRANSACTION_CREATE_DISCRIMINATOR = [48, 250, 78, 168, 208, 226, 218, 211]
const PROPOSAL_CREATE_DISCRIMINATOR = [220, 60, 73, 224, 30, 108, 79, 159]

const TOKEN_2022_PROGRAM_ADDRESS = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

const PERMISSION_INITIATE = 1

const SYSTEM_TRANSFER_INSTRUCTION = 2
const SYSTEM_TRANSFER_DATA_SIZE = 12

const DEFAULT_VAULT_INDEX = 0
const NO_EPHEMERAL_SIGNERS = 0

const MESSAGE_HEADER_SIZE = 3
const PROGRAM_ID_INDEX_SIZE = 1
const SMALL_PREFIX_SIZE = 1
const DATA_PREFIX_SIZE = 2

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountMultisig} IWalletAccountMultisig */
/** @typedef {import('@tetherto/wdk-wallet').MultisigResult} MultisigResult */
/** @typedef {import('@tetherto/wdk-wallet').MultisigTransactionResult} MultisigTransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').MultisigExecuteResult} MultisigExecuteResult */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigTransactionOptions} MultisigTransactionOptions */
/** @typedef {import('@tetherto/wdk-wallet').MultisigOptions} MultisigOptions */
/** @typedef {import('@tetherto/wdk-wallet').MessageProposal} MessageProposal */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */

/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */

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
   * Proposes a transaction to the multisig.
   *
   * The proposal is created open for voting, with no approvals of its own — creating a
   * proposal is not a vote, so `confirmations` is 0 even for the proposer.
   *
   * The proposal takes the multisig's next transaction index. If another member proposes
   * first, that index is taken and this call fails; the error is surfaced rather than
   * retried, because retrying would sign and send a second transaction.
   *
   * @param {SolanaTransaction} tx - The transaction to propose.
   * @param {MultisigTransactionOptions} [options] - The send options.
   * @returns {Promise<MultisigTransactionResult>} The proposal result.
   * @throws {Error} If the multisig does not exist, the signer cannot propose, or the RPC
   *   request fails.
   * @todo Support `autoExecute`, and transaction messages beyond a native transfer.
   */
  async sendTransaction (tx, options = {}) {
    if (options.autoExecute) {
      throw new NotImplementedError('sendTransaction(tx, { autoExecute: true })')
    }

    const vaultPda = await this.getVaultAddress(DEFAULT_VAULT_INDEX)

    return this._proposeVaultTransaction(this._encodeTransactionMessage(vaultPda, tx))
  }

  /**
   * Proposes an SPL token transfer to the multisig.
   *
   * Native SOL transfers go through {@link sendTransaction} instead.
   *
   * @param {TransferOptions} transferOptions - The transfer options.
   * @param {MultisigTransactionOptions} [options] - The send options.
   * @returns {Promise<MultisigTransactionResult>} The transfer proposal result.
   */
  async transfer (transferOptions, options = {}) {
    if (options.autoExecute) {
      throw new NotImplementedError('transfer(transferOptions, { autoExecute: true })')
    }

    const mint = address(transferOptions.token)
    const recipient = address(transferOptions.recipient)
    const vaultPda = await this.getVaultAddress(DEFAULT_VAULT_INDEX)

    const [source, destination] = await Promise.all([
      findAssociatedTokenPda({ mint, owner: address(vaultPda), tokenProgram: TOKEN_PROGRAM_ADDRESS }),
      findAssociatedTokenPda({ mint, owner: recipient, tokenProgram: TOKEN_PROGRAM_ADDRESS })
    ])

    const { value } = await this._rpc
      .getMultipleAccounts([mint, destination[0]], {
        commitment: this._commitment,
        encoding: 'base64'
      })
      .send()

    const [mintAccount, destinationAccount] = value

    if (!mintAccount) {
      throw new Error(`The token mint ${mint} does not exist.`)
    }

    if (mintAccount.owner === TOKEN_2022_PROGRAM_ADDRESS) {
      throw new NotSupportedError(
        'transfer(transferOptions, options)',
        `the mint ${mint} belongs to the Token-2022 program, whose associated token accounts this package does not derive`
      )
    }

    const { fee } = await this.quoteTransfer(transferOptions)
    const { transferMaxFee } = this._config

    if (transferMaxFee !== undefined && fee >= BigInt(transferMaxFee)) {
      throw new Error('Exceeded maximum fee cost for the transfer operation.')
    }

    const instructions = []

    if (!destinationAccount) {
      instructions.push(
        getCreateAssociatedTokenIdempotentInstruction({
          ata: destination[0],
          mint,
          owner: recipient,
          payer: address(vaultPda)
        })
      )
    }

    instructions.push(
      getTransferInstruction({
        source: source[0],
        destination: destination[0],
        authority: address(vaultPda),
        amount: BigInt(transferOptions.amount)
      })
    )

    return this._proposeVaultTransaction(
      this._compileTransactionMessage(address(vaultPda), instructions)
    )
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

  /**
   * Proposes a vault transaction carrying the given message, opening it for voting.
   *
   * @private
   */
  async _proposeVaultTransaction (message) {
    const {
      address: multisigPda,
      isCreated,
      threshold,
      transactionIndex,
      members
    } = await this._getMultisigAccount()

    if (!isCreated) {
      throw new Error(
        `The multisig account ${multisigPda} does not exist. Deploy it before proposing transactions.`
      )
    }

    const signerAddress = await this.getSignerAddress()
    const member = members.find((candidate) => candidate.address === signerAddress)

    if (!member) {
      throw new Error(
        `The signer ${signerAddress} is not a member of the multisig ${multisigPda}.`
      )
    }

    if (!(member.mask & PERMISSION_INITIATE)) {
      throw new Error(
        `The signer ${signerAddress} does not hold the permission to propose transactions.`
      )
    }

    const index = transactionIndex + 1n
    const [transactionPda, proposalPda] = await Promise.all([
      this._getTransactionPda(multisigPda, index),
      this._getProposalPda(multisigPda, index)
    ])

    const creator = { address: address(signerAddress), role: ACCOUNT_ROLE_WRITABLE_SIGNER }
    const systemProgram = { address: address(SYSTEM_PROGRAM_ADDRESS), role: ACCOUNT_ROLE_READONLY }

    const instructions = [
      {
        programAddress: this._programId,
        accounts: [
          { address: address(multisigPda), role: ACCOUNT_ROLE_WRITABLE },
          { address: transactionPda, role: ACCOUNT_ROLE_WRITABLE },
          creator,
          creator,
          systemProgram
        ],
        data: this._encodeVaultTransactionCreateData(message)
      },
      {
        programAddress: this._programId,
        accounts: [
          { address: address(multisigPda), role: ACCOUNT_ROLE_READONLY },
          { address: proposalPda, role: ACCOUNT_ROLE_WRITABLE },
          creator,
          creator,
          systemProgram
        ],
        data: this._encodeProposalCreateData(index)
      }
    ]

    const { hash, fee } = await this._signerAccount.sendTransaction({ instructions })

    return {
      proposalId: index.toString(),
      hash,
      fee,
      confirmations: 0,
      threshold,
      executed: false
    }
  }

  /** @private */
  _encodeTransactionMessage (vaultPda, tx) {
    if (!tx || tx.to === undefined || tx.value === undefined) {
      throw new NotImplementedError('sendTransaction(tx) for anything but a native transfer')
    }

    const data = new Uint8Array(SYSTEM_TRANSFER_DATA_SIZE)
    const view = new DataView(data.buffer)

    view.setUint32(0, SYSTEM_TRANSFER_INSTRUCTION, true)
    view.setBigUint64(4, BigInt(tx.value), true)

    return this._compileTransactionMessage(address(vaultPda), [
      {
        programAddress: address(SYSTEM_PROGRAM_ADDRESS),
        accounts: [
          { address: address(vaultPda), role: ACCOUNT_ROLE_WRITABLE_SIGNER },
          { address: address(tx.to), role: ACCOUNT_ROLE_WRITABLE }
        ],
        data
      }
    ])
  }

  /**
   * Compiles instructions into the message Squads takes as an instruction argument.
   *
   * Note this is not the message the program then stores: the argument uses one-byte
   * length prefixes where the stored account uses four-byte ones.
   *
   * @private
   */
  _compileTransactionMessage (payer, instructions) {
    const roles = new Map()
    const note = (candidate, signer, writable) => {
      const current = roles.get(candidate) ?? { signer: false, writable: false }

      roles.set(candidate, {
        signer: current.signer || signer,
        writable: current.writable || writable
      })
    }

    note(payer, true, true)

    for (const instruction of instructions) {
      // The program is recorded before its own accounts, which is the order the on-chain
      // message compiler uses and therefore the order the keys end up in.
      note(instruction.programAddress, false, false)

      for (const account of instruction.accounts) {
        note(
          account.address,
          account.role === ACCOUNT_ROLE_READONLY_SIGNER || account.role === ACCOUNT_ROLE_WRITABLE_SIGNER,
          account.role === ACCOUNT_ROLE_WRITABLE || account.role === ACCOUNT_ROLE_WRITABLE_SIGNER
        )
      }
    }

    const entries = [...roles.entries()]
    const group = (signer, writable) => entries
      .filter(([, role]) => role.signer === signer && role.writable === writable)
      .map(([candidate]) => candidate)

    const keys = [
      ...group(true, true),
      ...group(true, false),
      ...group(false, true),
      ...group(false, false)
    ]

    const compiled = instructions.map((instruction) => ({
      programIdIndex: keys.indexOf(instruction.programAddress),
      accountIndexes: instruction.accounts.map((account) => keys.indexOf(account.address)),
      data: instruction.data
    }))

    const size =
      MESSAGE_HEADER_SIZE +
      SMALL_PREFIX_SIZE + ADDRESS_SIZE * keys.length +
      SMALL_PREFIX_SIZE +
      compiled.reduce(
        (total, instruction) =>
          total +
          PROGRAM_ID_INDEX_SIZE +
          SMALL_PREFIX_SIZE + instruction.accountIndexes.length +
          DATA_PREFIX_SIZE + instruction.data.length,
        0
      ) +
      SMALL_PREFIX_SIZE

    const message = new Uint8Array(size)
    const view = new DataView(message.buffer)
    const addressEncoder = getAddressEncoder()

    message[0] = entries.filter(([, role]) => role.signer).length
    message[1] = group(true, true).length
    message[2] = group(false, true).length

    let offset = MESSAGE_HEADER_SIZE

    message[offset] = keys.length
    offset += SMALL_PREFIX_SIZE

    for (const key of keys) {
      message.set(addressEncoder.encode(key), offset)
      offset += ADDRESS_SIZE
    }

    message[offset] = compiled.length
    offset += SMALL_PREFIX_SIZE

    for (const instruction of compiled) {
      message[offset] = instruction.programIdIndex
      offset += PROGRAM_ID_INDEX_SIZE

      message[offset] = instruction.accountIndexes.length
      offset += SMALL_PREFIX_SIZE
      message.set(instruction.accountIndexes, offset)
      offset += instruction.accountIndexes.length

      view.setUint16(offset, instruction.data.length, true)
      offset += DATA_PREFIX_SIZE
      message.set(instruction.data, offset)
      offset += instruction.data.length
    }

    return message
  }

  /** @private */
  _encodeVaultTransactionCreateData (message) {
    const data = new Uint8Array(
      VAULT_TRANSACTION_CREATE_DISCRIMINATOR.length + 2 + VEC_PREFIX_SIZE + message.length + 1
    )
    const view = new DataView(data.buffer)

    data.set(VAULT_TRANSACTION_CREATE_DISCRIMINATOR, 0)

    let offset = VAULT_TRANSACTION_CREATE_DISCRIMINATOR.length

    data[offset] = DEFAULT_VAULT_INDEX
    data[offset + 1] = NO_EPHEMERAL_SIGNERS
    offset += 2

    view.setUint32(offset, message.length, true)
    offset += VEC_PREFIX_SIZE

    data.set(message, offset)
    data[offset + message.length] = OPTION_NONE

    return data
  }

  /** @private */
  _encodeProposalCreateData (index) {
    const data = new Uint8Array(PROPOSAL_CREATE_DISCRIMINATOR.length + 8 + 1)
    const view = new DataView(data.buffer)

    data.set(PROPOSAL_CREATE_DISCRIMINATOR, 0)
    view.setBigUint64(PROPOSAL_CREATE_DISCRIMINATOR.length, index, true)

    return data
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
