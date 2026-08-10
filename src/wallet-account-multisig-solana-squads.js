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

import { NoSuchElementError, NotImplementedError, ValueError } from '@tetherto/wdk-wallet'

import { WalletAccountSolana } from '@tetherto/wdk-wallet-solana'

import WalletAccountReadOnlyMultisigSolanaSquads, {
  TRANSACTION_KIND
} from './wallet-account-read-only-multisig-solana-squads.js'

import { NotSupportedError } from './errors.js'

import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses'

import { getBase58Decoder, getBase58Encoder, getBase64Encoder } from '@solana/codecs'

import { createKeyPairSignerFromBytes, createKeyPairSignerFromPrivateKeyBytes } from '@solana/signers'

import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS
} from '@solana-program/token'

/** @typedef {import('@tetherto/wdk-wallet/multisig').IWalletAccountMultisig} IWalletAccountMultisig */
/** @typedef {import('@tetherto/wdk-wallet/multisig').IMultisigOwnerManagement} IMultisigOwnerManagement */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigAutoExecuteResult} MultisigAutoExecuteResult */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigProposal} MultisigProposal */
/**
 * `MultisigProposal` widened with the signature and fee of the transaction that carried the
 * call, plus `transaction` from `MultisigAutoExecuteResult`, which is set only when that same
 * call also executed the proposal.
 *
 * @typedef {MultisigProposal & MultisigAutoExecuteResult & { hash: string, fee: bigint }} SolanaMultisigProposalResult
 */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigTransactionOptions} MultisigTransactionOptions */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigOptions} MultisigOptions */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigMessageProposal} MultisigMessageProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigSignature} MultisigSignature */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */

/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */

/** @typedef {import('./wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsConfig} SolanaMultisigSquadsConfig */

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
const CONFIG_TRANSACTION_CREATE_DISCRIMINATOR = [155, 236, 87, 228, 137, 75, 81, 39]
const PROPOSAL_APPROVE_DISCRIMINATOR = [144, 37, 164, 136, 188, 216, 42, 248]
const PROPOSAL_REJECT_DISCRIMINATOR = [243, 62, 134, 156, 230, 106, 246, 135]
const VAULT_TRANSACTION_EXECUTE_DISCRIMINATOR = [194, 8, 161, 87, 153, 164, 25, 171]
const CONFIG_TRANSACTION_EXECUTE_DISCRIMINATOR = [114, 146, 244, 189, 252, 140, 36, 40]

const TOKEN_2022_PROGRAM_ADDRESS = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
const ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS = 'AddressLookupTab1e1111111111111111111111111'
const LOOKUP_TABLE_ADDRESSES_OFFSET = 56

const PERMISSION_INITIATE = 1
const PERMISSION_VOTE = 2
const PERMISSION_EXECUTE = 4

const PROPOSAL_STATUS_ACTIVE = 1
const PROPOSAL_STATUS_APPROVED = 3

const CONFIG_ACTION_ADD_MEMBER = 0
const CONFIG_ACTION_REMOVE_MEMBER = 1
const CONFIG_ACTION_CHANGE_THRESHOLD = 2

const OPTION_SOME = 1
const OPTION_TAG_SIZE = 1
const ENUM_TAG_SIZE = 1
const THRESHOLD_SIZE = 2
const MAX_THRESHOLD = 65535

const SYSTEM_TRANSFER_INSTRUCTION = 2
const SYSTEM_TRANSFER_DATA_SIZE = 12

const DEFAULT_VAULT_INDEX = 0
const NO_EPHEMERAL_SIGNERS = 0

const MESSAGE_HEADER_SIZE = 3
const PROGRAM_ID_INDEX_SIZE = 1
const SMALL_PREFIX_SIZE = 1
const DATA_PREFIX_SIZE = 2

/**
 * Solana Squads multisig wallet account implementation.
 *
 * @implements {IWalletAccountMultisig}
 * @implements {IMultisigOwnerManagement}
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

    super(signerAccount._address, config)

    /**
     * The underlying Solana signer account.
     *
     * @protected
     * @type {WalletAccountSolana}
     */
    this._signerAccount = signerAccount
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
  get index () {
    return this._signerAccount.index
  }

  /**
   * The derivation path of this account (see [SLIP-0010](https://slips.readthedocs.io/en/latest/slip-0010/)).
   *
   * @type {string}
   */
  get path () {
    return this._signerAccount.path
  }

  /**
   * The key pair of the signer account.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return this._signerAccount.keyPair
  }

  /**
   * Returns the address of the Squads multisig account.
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
   * Returns the address of the member this account votes and proposes as.
   *
   * @returns {Promise<string>} The signer's address.
   */
  async getSignerAddress () {
    return this._signerAccount.getAddress()
  }

  /**
   * Signs a message with the signer account.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The signature.
   */
  async sign (message) {
    return this._signerAccount.sign(message)
  }

  /**
   * Signs a transaction with the signer account. Not supported by Squads.
   *
   * @param {SolanaTransaction} tx - The transaction to sign.
   * @returns {Promise<SolanaTransaction>} The signed transaction.
   * @throws {NotSupportedError} Always, since a multisig cannot sign a transaction itself.
   */
  async signTransaction (tx) {
    throw new NotSupportedError(
      'signTransaction(tx)',
      'a Squads multisig is a program-derived address with no private key, so it cannot sign. Propose the transaction with propose(tx) and let the members approve it instead.'
    )
  }

  /**
   * Sends a transaction from the multisig. Not supported by Squads.
   *
   * @param {SolanaTransaction} tx - The transaction to send.
   * @returns {Promise<TransactionResult>} The transaction's result.
   * @throws {NotSupportedError} Always, since a multisig does not submit transactions itself.
   */
  async sendTransaction (tx) {
    throw new NotSupportedError(
      'sendTransaction(tx)',
      'a Squads multisig does not submit transactions directly: it proposes them and executes once the approval threshold is met. Use propose(tx) and then executeProposal(proposalId) instead.'
    )
  }

  /**
   * Proposes a message to be signed by the multisig members. Not supported by Squads.
   *
   * @param {string} message - The message to propose.
   * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The message proposal.
   * @throws {NotSupportedError} Always, since Squads has no message-signing primitive.
   */
  async proposeMessage (message) {
    throw new NotSupportedError(
      'proposeMessage(message)',
      'Squads has no message-signing primitive, and a multisig cannot produce a signature because its accounts are program-derived addresses with no private key. Use sign(message) to sign with this account\'s own signer key instead.'
    )
  }

  /**
   * Approves a pending message proposal. Not supported by Squads.
   *
   * @param {string} messageId - The hash of the proposed message.
   * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The updated message proposal.
   * @throws {NotSupportedError} Always, since Squads has no message-signing primitive.
   */
  async approveMessageProposal (messageId) {
    throw new NotSupportedError(
      'approveMessageProposal(messageId)',
      'Squads has no message-signing primitive, and a message hash cannot be resolved to a Squads account, which are keyed by sequential transaction index'
    )
  }

  /**
   * Validates that the signer is a member of the multisig.
   *
   * @returns {Promise<void>} Resolves if the signer is a member, otherwise throws.
   * @throws {Error} If the multisig does not exist, or the signer is not one of its members.
   */
  async validateSignerIsOwner () {
    const signerAddress = await this.getSignerAddress()

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
   * Creates the multisig account on-chain, deriving its address from the configured
   * `createKeySecret`.
   *
   * @param {string[]} [owners] - The member addresses. Defaults to this account's signer.
   * @param {number} [threshold] - The approvals a proposal needs (default: 1).
   * @returns {Promise<Pick<TransactionResult, 'hash'>>} The creation transaction's signature.
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
   * Proposes a transaction to the multisig, open for voting.
   *
   * @param {SolanaTransaction} tx - The transaction to propose.
   * @param {MultisigTransactionOptions} [transactionOptions] - The multisig transaction's options.
   * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
   * @throws {Error} If the multisig does not exist, the signer cannot propose, or the RPC
   *   request fails.
   * @todo Support transaction messages beyond a native transfer.
   */
  async propose (tx, transactionOptions = {}) {
    const vaultPda = await this.getVaultAddress(DEFAULT_VAULT_INDEX)

    return this._proposeVaultTransaction(
      this._encodeTransactionMessage(vaultPda, tx),
      transactionOptions
    )
  }

  /**
   * Proposes an SPL token transfer to the multisig.
   *
   * @param {TransferOptions} transferOptions - The transfer options.
   * @param {MultisigTransactionOptions} [transactionOptions] - The multisig transaction's options.
   * @returns {Promise<SolanaMultisigProposalResult>} The transfer proposal result.
   * @throws {Error} If the mint or recipient is malformed, the mint does not exist, the
   *   signer cannot propose, or the quote exceeds `transferMaxFee`.
   * @throws {NotSupportedError} If the mint belongs to the Token-2022 program.
   * @todo Support Token-2022 (Token Extensions Program).
   */
  async transfer (transferOptions, transactionOptions = {}) {
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to propose transfers.')
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
      this._compileTransactionMessage(address(vaultPda), instructions),
      transactionOptions
    )
  }

  /**
   * Approves a pending transaction proposal.
   *
   * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
   * @param {string} [memo] - An optional note recorded on chain with the vote. It costs
   *   rent, and an empty string is stored as a present-but-empty memo rather than none.
   * @returns {Promise<SolanaMultisigProposalResult>} The approval result.
   * @throws {NoSuchElementError} If no proposal exists at that id.
   * @throws {Error} If the id is invalid, the multisig does not exist, the signer cannot
   *   vote, the proposal is not open for voting, the signer has already approved it, or the
   *   RPC request fails.
   */
  async approveProposal (proposalId, memo) {
    const index = this._toProposalIndex(proposalId)
    const { multisig, proposal } = await this._getMultisigAndProposal(index)
    const signerAddress = await this._requireVotableProposal(multisig, proposal, index)

    if (proposal.approved.includes(signerAddress)) {
      throw new Error(`The signer ${signerAddress} has already approved the proposal ${index}.`)
    }

    const instruction = this._buildProposalVoteInstruction(
      PROPOSAL_APPROVE_DISCRIMINATOR,
      multisig.address,
      signerAddress,
      proposal.address,
      memo
    )

    const { hash, fee } = await this._signerAccount.sendTransaction({
      instructions: [instruction]
    })

    return {
      proposalId: index.toString(),
      hash,
      fee,
      confirmations: proposal.approved.length + 1,
      threshold: multisig.threshold,
      status: 'pending'
    }
  }

  /**
   * Rejects a pending transaction proposal.
   *
   * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
   * @param {string} [memo] - An optional note recorded on chain with the vote. It costs
   *   rent, and an empty string is stored as a present-but-empty memo rather than none.
   * @returns {Promise<SolanaMultisigProposalResult>} The rejection result.
   * @throws {NoSuchElementError} If no proposal exists at that id.
   * @throws {Error} If the id is invalid, the multisig does not exist, the signer cannot
   *   vote, the proposal is not open for voting, the signer has already rejected it, or the
   *   RPC request fails.
   */
  async rejectProposal (proposalId, memo) {
    const index = this._toProposalIndex(proposalId)
    const { multisig, proposal } = await this._getMultisigAndProposal(index)
    const signerAddress = await this._requireVotableProposal(multisig, proposal, index)

    if (proposal.rejected.includes(signerAddress)) {
      throw new Error(`The signer ${signerAddress} has already rejected the proposal ${index}.`)
    }

    const instruction = this._buildProposalVoteInstruction(
      PROPOSAL_REJECT_DISCRIMINATOR,
      multisig.address,
      signerAddress,
      proposal.address,
      memo
    )

    const { hash, fee } = await this._signerAccount.sendTransaction({
      instructions: [instruction]
    })

    return {
      proposalId: index.toString(),
      hash,
      fee,
      // The rejection withdraws this member's approval, so the count can go down.
      confirmations: proposal.approved.length - (proposal.approved.includes(signerAddress) ? 1 : 0),
      threshold: multisig.threshold,
      status: 'pending'
    }
  }

  /**
   * Submits an approved proposal for on-chain execution.
   *
   * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
   * @returns {Promise<TransactionResult>} The execution transaction's result.
   * @throws {NoSuchElementError} If no proposal exists at that id.
   * @throws {ValueError} If the proposal has not reached the approval threshold.
   * @throws {Error} If the id is invalid, the multisig does not exist, the signer cannot
   *   execute, its time lock has not elapsed, a config proposal has been invalidated, or the
   *   RPC request fails.
   * @throws {NotImplementedError} If the proposal backs a batch.
   */
  async executeProposal (proposalId) {
    const index = this._toProposalIndex(proposalId)
    const { multisig, proposal, transaction, now } =
      await this._getMultisigProposalAndTransaction(index)

    if (!multisig.isCreated) {
      throw new Error(
        `The multisig account ${multisig.address} does not exist. Deploy it before executing proposals.`
      )
    }

    const signerAddress = await this.getSignerAddress()

    this._requirePermission(multisig, signerAddress, PERMISSION_EXECUTE, 'execute proposals')

    if (!proposal.exists) {
      throw new NoSuchElementError(
        `The multisig ${multisig.address} has no proposal at index ${index}.`
      )
    }

    if (proposal.status !== PROPOSAL_STATUS_APPROVED) {
      throw new ValueError(
        `The proposal ${index} is ${proposal.statusPhrase} rather than approved and ready to execute.`
      )
    }

    const remaining = BigInt(multisig.timeLock) - (now - proposal.statusTimestamp)

    if (remaining > 0n) {
      throw new Error(
        `The proposal ${index} is under a time lock for another ${remaining} seconds.`
      )
    }

    const instruction = transaction.kind === TRANSACTION_KIND.config
      ? await this._buildConfigExecuteInstruction(multisig, proposal, transaction, signerAddress, index)
      : await this._buildVaultExecuteInstruction(multisig, proposal, transaction, signerAddress)

    return this._signerAccount.sendTransaction({ instructions: [instruction] })
  }

  /**
   * Proposes adding a new member to the multisig, with full permissions.
   *
   * @param {string} ownerAddress - The address of the member to add.
   * @param {Partial<MultisigOptions>} [options] - The operation options.
   * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
   * @throws {Error} If the address is malformed or already a member, the threshold is out of
   *   range, the multisig does not exist or is controlled by a configuration authority, the
   *   signer cannot propose, or the RPC request fails.
   * @todo Let the caller choose the new member's permissions.
   */
  async addOwner (ownerAddress, options = {}) {
    const newOwner = address(ownerAddress)
    const multisig = await this._getMultisigAccount()

    this._requireDeployed(multisig, 'proposing configuration changes')
    this._requireAutonomous(multisig)
    await this._requireCanPropose(multisig)

    if (multisig.members.some((member) => member.address === newOwner)) {
      throw new Error(
        `The address ${newOwner} is already a member of the multisig ${multisig.address}.`
      )
    }

    const resulting = [...multisig.members, { address: newOwner, mask: ALMIGHTY_PERMISSIONS }]

    this._requireViableMembers(resulting, options.threshold ?? multisig.threshold, multisig.address)

    const actions = [this._encodeAddMemberAction(newOwner, ALMIGHTY_PERMISSIONS)]

    if (options.threshold !== undefined) {
      actions.push(this._encodeChangeThresholdAction(options.threshold))
    }

    return this._proposeTransaction(multisig, this._encodeConfigTransactionCreateData(actions))
  }

  /**
   * Proposes removing a member from the multisig.
   *
   * @param {string} ownerAddress - The address of the member to remove.
   * @param {Partial<MultisigOptions>} [options] - The operation options.
   * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
   * @throws {Error} If the address is malformed or not a member, the removal would leave the
   *   multisig with no members or nobody able to vote, propose or execute, the threshold would
   *   exceed the remaining voters, the multisig does not exist or is controlled by a
   *   configuration authority, the signer cannot propose, or the RPC request fails.
   */
  async removeOwner (ownerAddress, options = {}) {
    const owner = address(ownerAddress)
    const multisig = await this._getMultisigAccount()

    this._requireDeployed(multisig, 'proposing configuration changes')
    this._requireAutonomous(multisig)
    await this._requireCanPropose(multisig)

    if (!multisig.members.some((member) => member.address === owner)) {
      throw new Error(
        `The address ${owner} is not a member of the multisig ${multisig.address}.`
      )
    }

    const remaining = multisig.members.filter((member) => member.address !== owner)

    this._requireViableMembers(remaining, options.threshold ?? multisig.threshold, multisig.address)

    const actions = [this._encodeRemoveMemberAction(owner)]

    if (options.threshold !== undefined) {
      actions.push(this._encodeChangeThresholdAction(options.threshold))
    }

    return this._proposeTransaction(multisig, this._encodeConfigTransactionCreateData(actions))
  }

  /**
   * Proposes swapping one member for another, the new member inheriting the old one's
   * permissions.
   *
   * @param {string} oldOwnerAddress - The address of the member to replace.
   * @param {string} newOwnerAddress - The address of the new member.
   * @param {Partial<MultisigOptions>} [options] - The operation options.
   * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
   * @throws {Error} If either address is malformed, they are equal, the old address is not a
   *   member, the new one already is, the threshold would exceed the resulting voters, the
   *   multisig does not exist or is controlled by a configuration authority, the signer cannot
   *   propose, or the RPC request fails.
   */
  async swapOwner (oldOwnerAddress, newOwnerAddress, options = {}) {
    const oldOwner = address(oldOwnerAddress)
    const newOwner = address(newOwnerAddress)

    // Swapping a member for itself changes nothing, yet still costs a vote round and
    // invalidates every other pending proposal.
    if (oldOwner === newOwner) {
      throw new Error(`Cannot swap the member ${oldOwner} of the multisig for itself.`)
    }

    const multisig = await this._getMultisigAccount()

    this._requireDeployed(multisig, 'proposing configuration changes')
    this._requireAutonomous(multisig)
    await this._requireCanPropose(multisig)

    const replaced = multisig.members.find((member) => member.address === oldOwner)

    if (!replaced) {
      throw new Error(
        `The address ${oldOwner} is not a member of the multisig ${multisig.address}.`
      )
    }

    if (multisig.members.some((member) => member.address === newOwner)) {
      throw new Error(
        `The address ${newOwner} is already a member of the multisig ${multisig.address}.`
      )
    }

    const resulting = [
      ...multisig.members.filter((member) => member.address !== oldOwner),
      { address: newOwner, mask: replaced.mask }
    ]

    this._requireViableMembers(resulting, options.threshold ?? multisig.threshold, multisig.address)

    const actions = [
      this._encodeRemoveMemberAction(oldOwner),
      this._encodeAddMemberAction(newOwner, replaced.mask)
    ]

    if (options.threshold !== undefined) {
      actions.push(this._encodeChangeThresholdAction(options.threshold))
    }

    return this._proposeTransaction(multisig, this._encodeConfigTransactionCreateData(actions))
  }

  /**
   * Proposes changing the approval threshold of the multisig.
   *
   * @param {number} newThreshold - The new threshold.
   * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
   * @throws {Error} If the threshold is not an integer between 1 and the number of owners able
   *   to vote, is the threshold already in force, the multisig does not exist or is controlled
   *   by a configuration authority, the signer cannot propose, or the RPC request fails.
   */
  async changeThreshold (newThreshold) {
    const multisig = await this._getMultisigAccount()

    this._requireDeployed(multisig, 'proposing configuration changes')
    this._requireAutonomous(multisig)
    await this._requireCanPropose(multisig)

    if (newThreshold === multisig.threshold) {
      throw new Error(
        `The multisig ${multisig.address} already requires ${newThreshold} approvals.`
      )
    }

    this._requireViableMembers(multisig.members, newThreshold, multisig.address)

    return this._proposeTransaction(
      multisig,
      this._encodeConfigTransactionCreateData([this._encodeChangeThresholdAction(newThreshold)])
    )
  }

  /**
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<WalletAccountReadOnlyMultisigSolanaSquads>} The read-only account.
   */
  async toReadOnlyAccount () {
    const { createKeySecret, ...config } = this._config

    return new WalletAccountReadOnlyMultisigSolanaSquads(this._signerAddress, {
      ...config,
      multisigPda: this._multisigPda,
      createKey: this._createKey
    })
  }

  /**
   * Disposes the wallet account, erasing the private key from the memory.
   *
   * @returns {void} Nothing; the account cannot sign once disposed.
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

    this._validateThreshold(threshold, owners.length)
  }

  /** @private */
  async _proposeVaultTransaction (compiled, options = {}) {
    const multisig = await this._getMultisigAccount()

    return this._proposeTransaction(
      multisig,
      this._encodeVaultTransactionCreateData(compiled.bytes),
      options.autoExecute
        ? (context) => this._buildAutoExecuteInstructions(multisig, compiled, context)
        : null
    )
  }

  /** @private */
  _requireDeployed (multisig, action) {
    if (!multisig.isCreated) {
      throw new Error(
        `The multisig account ${multisig.address} does not exist. Deploy it before ${action}.`
      )
    }
  }

  /** @private */
  async _proposeTransaction (multisig, data, buildExtraInstructions = null) {
    const { address: multisigPda, threshold, transactionIndex, members } = multisig

    this._requireDeployed(multisig, 'proposing transactions')

    const signerAddress = await this.getSignerAddress()

    this._requirePermission(
      { address: multisigPda, members },
      signerAddress,
      PERMISSION_INITIATE,
      'propose transactions'
    )

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
        data
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

    const extra = buildExtraInstructions
      ? await buildExtraInstructions({ index, transactionPda, proposalPda, signerAddress })
      : []

    instructions.push(...extra)

    const { hash, fee } = await this._signerAccount.sendTransaction({ instructions })
    const executed = extra.length > 0

    // The auto-executing instructions ride in the transaction that created the proposal,
    // so the execution's result is that transaction's own.
    const autoExecuteResult = executed
      ? { status: 'executed', transaction: { hash, fee } }
      : { status: 'pending' }

    return {
      proposalId: index.toString(),
      hash,
      fee,
      confirmations: executed ? 1 : 0,
      threshold,
      ...autoExecuteResult
    }
  }

  /** @private */
  async _buildAutoExecuteInstructions (multisig, compiled, context) {
    const { proposalPda, transactionPda, signerAddress } = context

    if (!this._canAutoExecute(multisig, signerAddress)) {
      return []
    }

    const vaultPda = await this.getVaultAddress(DEFAULT_VAULT_INDEX)
    const transaction = {
      address: transactionPda,
      ephemeralSignerCount: NO_EPHEMERAL_SIGNERS,
      message: { ...compiled, addressTableLookups: [] }
    }

    return [
      this._buildProposalVoteInstruction(
        PROPOSAL_APPROVE_DISCRIMINATOR, multisig.address, signerAddress, proposalPda
      ),
      {
        programAddress: this._programId,
        accounts: [
          { address: address(multisig.address), role: ACCOUNT_ROLE_READONLY },
          { address: proposalPda, role: ACCOUNT_ROLE_WRITABLE },
          { address: transactionPda, role: ACCOUNT_ROLE_READONLY },
          { address: address(signerAddress), role: ACCOUNT_ROLE_READONLY_SIGNER },
          ...await this._resolveExecutionAccounts(transaction, vaultPda)
        ],
        data: Uint8Array.from(VAULT_TRANSACTION_EXECUTE_DISCRIMINATOR)
      }
    ]
  }

  /** @private */
  _canAutoExecute (multisig, signerAddress) {
    if (multisig.threshold !== 1 || multisig.timeLock !== 0) {
      return false
    }

    const member = multisig.members.find((candidate) => candidate.address === signerAddress)

    return Boolean(member && (member.mask & PERMISSION_VOTE) && (member.mask & PERMISSION_EXECUTE))
  }

  /** @private */
  _encodeTransactionMessage (vaultPda, tx) {
    if (!tx || tx.to === undefined || tx.value === undefined) {
      throw new NotImplementedError('propose(tx) for anything but a native transfer')
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

  /** @private */
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

    return {
      bytes: message,
      accountKeys: keys,
      numSigners: message[0],
      numWritableSigners: message[1],
      numWritableNonSigners: message[2]
    }
  }

  /** @private */
  _requirePermission (multisig, signerAddress, mask, permission) {
    const member = multisig.members.find((candidate) => candidate.address === signerAddress)

    if (!member) {
      throw new Error(
        `The signer ${signerAddress} is not a member of the multisig ${multisig.address}.`
      )
    }

    if (!(member.mask & mask)) {
      throw new Error(
        `The signer ${signerAddress} does not hold the permission to ${permission}.`
      )
    }

    return member
  }

  /** @private */
  async _requireVotableProposal (multisig, proposal, index) {
    if (!multisig.isCreated) {
      throw new Error(
        `The multisig account ${multisig.address} does not exist. Deploy it before voting on proposals.`
      )
    }

    const signerAddress = await this.getSignerAddress()

    this._requirePermission(multisig, signerAddress, PERMISSION_VOTE, 'vote on proposals')

    if (!proposal.exists) {
      throw new NoSuchElementError(
        `The multisig ${multisig.address} has no proposal at index ${index}.`
      )
    }

    if (proposal.status !== PROPOSAL_STATUS_ACTIVE) {
      throw new Error(
        `The proposal ${index} is ${proposal.statusPhrase} rather than open for voting.`
      )
    }

    if (index <= multisig.staleTransactionIndex) {
      throw new Error(
        `The proposal ${index} was invalidated by a later configuration change and can no longer be voted on.`
      )
    }

    return signerAddress
  }

  /** @private */
  _buildProposalVoteInstruction (discriminator, multisigPda, signerAddress, proposalPda, memo) {
    return {
      programAddress: this._programId,
      accounts: [
        { address: address(multisigPda), role: ACCOUNT_ROLE_READONLY },
        { address: address(signerAddress), role: ACCOUNT_ROLE_WRITABLE_SIGNER },
        { address: address(proposalPda), role: ACCOUNT_ROLE_WRITABLE }
      ],
      data: this._encodeProposalVoteData(discriminator, memo)
    }
  }

  /** @private */
  async _buildConfigExecuteInstruction (multisig, proposal, transaction, signerAddress, index) {
    if (index <= multisig.staleTransactionIndex) {
      throw new Error(
        `The config proposal ${index} was invalidated by a later configuration change and can no longer be executed.`
      )
    }

    const member = address(signerAddress)

    return {
      programAddress: this._programId,
      accounts: [
        { address: address(multisig.address), role: ACCOUNT_ROLE_WRITABLE },
        { address: member, role: ACCOUNT_ROLE_READONLY_SIGNER },
        { address: address(proposal.address), role: ACCOUNT_ROLE_WRITABLE },
        { address: address(transaction.address), role: ACCOUNT_ROLE_READONLY },
        { address: member, role: ACCOUNT_ROLE_WRITABLE_SIGNER },
        { address: address(SYSTEM_PROGRAM_ADDRESS), role: ACCOUNT_ROLE_READONLY },
        ...await this._resolveSpendingLimitAccounts(multisig.address, transaction.actions)
      ],
      data: Uint8Array.from(CONFIG_TRANSACTION_EXECUTE_DISCRIMINATOR)
    }
  }

  /** @private */
  async _resolveSpendingLimitAccounts (multisigPda, actions) {
    const addresses = await Promise.all(
      actions
        .filter((action) => action.createKey || action.spendingLimit)
        .map((action) => action.spendingLimit
          ? address(action.spendingLimit)
          : this._getSpendingLimitPda(multisigPda, action.createKey))
    )

    return addresses.map((spendingLimit) => ({
      address: spendingLimit,
      role: ACCOUNT_ROLE_WRITABLE
    }))
  }

  /** @private */
  async _buildVaultExecuteInstruction (multisig, proposal, transaction, signerAddress) {
    if (transaction.kind !== TRANSACTION_KIND.vault) {
      throw new NotImplementedError(
        `executeProposal(proposalId) for a ${transaction.kind ?? 'transaction of an unrecognized kind'}`
      )
    }

    const vaultPda = await this.getVaultAddress(transaction.vaultIndex)

    return {
      programAddress: this._programId,
      accounts: [
        { address: address(multisig.address), role: ACCOUNT_ROLE_READONLY },
        { address: address(proposal.address), role: ACCOUNT_ROLE_WRITABLE },
        { address: address(transaction.address), role: ACCOUNT_ROLE_READONLY },
        { address: address(signerAddress), role: ACCOUNT_ROLE_READONLY_SIGNER },
        ...await this._resolveExecutionAccounts(transaction, vaultPda)
      ],
      data: Uint8Array.from(VAULT_TRANSACTION_EXECUTE_DISCRIMINATOR)
    }
  }

  /** @private */
  async _resolveExecutionAccounts (transaction, vaultPda) {
    const { message } = transaction
    const signedForByProgram = new Set([
      vaultPda,
      ...await this._getEphemeralSignerPdas(transaction.address, transaction.ephemeralSignerCount)
    ])
    const lookups = message.addressTableLookups
    const accounts = lookups.map((lookup) => ({
      address: address(lookup.accountKey),
      role: ACCOUNT_ROLE_READONLY
    }))

    message.accountKeys.forEach((key, i) => {
      const writable = this._isStaticWritableIndex(message, i)
      const signer = i < message.numSigners && !signedForByProgram.has(key)

      accounts.push({ address: address(key), role: this._toAccountRole(signer, writable) })
    })

    if (!lookups.length) {
      return accounts
    }

    const tables = await this._getLookupTableAddresses(lookups)

    for (const lookup of lookups) {
      const addresses = tables.get(lookup.accountKey)

      for (const [indexes, role] of [
        [lookup.writableIndexes, ACCOUNT_ROLE_WRITABLE],
        [lookup.readonlyIndexes, ACCOUNT_ROLE_READONLY]
      ]) {
        for (const i of indexes) {
          if (!addresses[i]) {
            throw new Error(
              `The address lookup table ${lookup.accountKey} holds no address at index ${i}, so the proposal cannot be executed.`
            )
          }

          accounts.push({ address: addresses[i], role })
        }
      }
    }

    return accounts
  }

  /** @private */
  async _getLookupTableAddresses (lookups) {
    const keys = lookups.map((lookup) => address(lookup.accountKey))

    const { value } = await this._rpc
      .getMultipleAccounts(keys, { commitment: this._commitment, encoding: 'base64' })
      .send()

    const addressDecoder = getBase58Decoder()
    const tables = new Map()

    value.forEach((account, i) => {
      if (!account || account.owner !== ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS) {
        throw new Error(
          `The address lookup table ${keys[i]} does not exist, so the proposal can no longer be executed.`
        )
      }

      const data = getBase64Encoder().encode(account.data[0])
      const addresses = []

      for (let offset = LOOKUP_TABLE_ADDRESSES_OFFSET; offset < data.length; offset += ADDRESS_SIZE) {
        addresses.push(addressDecoder.decode(data.subarray(offset, offset + ADDRESS_SIZE)))
      }

      tables.set(keys[i], addresses)
    })

    return tables
  }

  /** @private */
  _isStaticWritableIndex (message, index) {
    if (index < message.numWritableSigners) {
      return true
    }

    if (index >= message.numSigners) {
      return index - message.numSigners < message.numWritableNonSigners
    }

    return false
  }

  /** @private */
  _toAccountRole (signer, writable) {
    if (signer) {
      return writable ? ACCOUNT_ROLE_WRITABLE_SIGNER : ACCOUNT_ROLE_READONLY_SIGNER
    }

    return writable ? ACCOUNT_ROLE_WRITABLE : ACCOUNT_ROLE_READONLY
  }

  /** @private */
  _encodeProposalVoteData (discriminator, memo) {
    if (memo === undefined || memo === null) {
      const data = new Uint8Array(discriminator.length + OPTION_TAG_SIZE)

      data.set(discriminator, 0)
      data[discriminator.length] = OPTION_NONE

      return data
    }

    if (typeof memo !== 'string') {
      throw new Error(`Invalid memo ${memo}. It must be a string.`)
    }

    const bytes = new TextEncoder().encode(memo)
    const data = new Uint8Array(
      discriminator.length + OPTION_TAG_SIZE + VEC_PREFIX_SIZE + bytes.length
    )
    const view = new DataView(data.buffer)

    data.set(discriminator, 0)
    data[discriminator.length] = OPTION_SOME

    let offset = discriminator.length + OPTION_TAG_SIZE

    view.setUint32(offset, bytes.length, true)
    offset += VEC_PREFIX_SIZE

    data.set(bytes, offset)

    return data
  }

  /** @private */
  _requireAutonomous (multisig) {
    if (multisig.configAuthority) {
      throw new Error(
        `The multisig ${multisig.address} is controlled by the configuration authority ${multisig.configAuthority}, which alone can change its members and threshold.`
      )
    }
  }

  /** @private */
  _validateThreshold (threshold, voterCount) {
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > voterCount) {
      throw new Error(
        `Invalid threshold ${threshold}. It must be an integer between 1 and the number of owners able to vote (${voterCount}).`
      )
    }

    if (threshold > MAX_THRESHOLD) {
      throw new Error(`Invalid threshold ${threshold}. It must not exceed ${MAX_THRESHOLD}.`)
    }
  }

  /** @private */
  async _requireCanPropose (multisig) {
    this._requirePermission(
      multisig,
      await this.getSignerAddress(),
      PERMISSION_INITIATE,
      'propose transactions'
    )
  }

  /** @private */
  _countVoters (members) {
    return members.filter((member) => member.mask & PERMISSION_VOTE).length
  }

  /** @private */
  _requireViableMembers (members, threshold, multisigPda) {
    if (!members.length) {
      throw new Error(`The multisig ${multisigPda} would be left with no members.`)
    }

    const required = [
      [PERMISSION_VOTE, 'vote on proposals'],
      [PERMISSION_INITIATE, 'propose transactions'],
      [PERMISSION_EXECUTE, 'execute proposals']
    ]

    for (const [mask, permission] of required) {
      if (!members.some((member) => member.mask & mask)) {
        throw new Error(
          `The multisig ${multisigPda} would be left with no member able to ${permission}.`
        )
      }
    }

    this._validateThreshold(threshold, this._countVoters(members))
  }

  /** @private */
  _encodeRemoveMemberAction (owner) {
    const action = new Uint8Array(ENUM_TAG_SIZE + ADDRESS_SIZE)

    action[0] = CONFIG_ACTION_REMOVE_MEMBER
    action.set(getAddressEncoder().encode(owner), ENUM_TAG_SIZE)

    return action
  }

  /** @private */
  _encodeAddMemberAction (owner, mask) {
    const action = new Uint8Array(ENUM_TAG_SIZE + ADDRESS_SIZE + 1)

    action[0] = CONFIG_ACTION_ADD_MEMBER
    action.set(getAddressEncoder().encode(owner), ENUM_TAG_SIZE)
    action[ENUM_TAG_SIZE + ADDRESS_SIZE] = mask

    return action
  }

  /** @private */
  _encodeChangeThresholdAction (threshold) {
    const action = new Uint8Array(ENUM_TAG_SIZE + THRESHOLD_SIZE)

    action[0] = CONFIG_ACTION_CHANGE_THRESHOLD
    new DataView(action.buffer).setUint16(ENUM_TAG_SIZE, threshold, true)

    return action
  }

  /** @private */
  _encodeConfigTransactionCreateData (actions) {
    const body = actions.reduce((total, action) => total + action.length, 0)
    const data = new Uint8Array(
      CONFIG_TRANSACTION_CREATE_DISCRIMINATOR.length + VEC_PREFIX_SIZE + body + OPTION_TAG_SIZE
    )
    const view = new DataView(data.buffer)

    data.set(CONFIG_TRANSACTION_CREATE_DISCRIMINATOR, 0)

    let offset = CONFIG_TRANSACTION_CREATE_DISCRIMINATOR.length

    view.setUint32(offset, actions.length, true)
    offset += VEC_PREFIX_SIZE

    for (const action of actions) {
      data.set(action, offset)
      offset += action.length
    }

    data[offset] = OPTION_NONE

    return data
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
