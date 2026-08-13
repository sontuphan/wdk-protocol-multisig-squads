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
  SECRET_SIZE,
  TRANSACTION_KIND
} from './wallet-account-read-only-multisig-solana-squads.js'

import { NotSupportedError } from './errors.js'

import { address, getAddressEncoder } from '@solana/addresses'

import { getBase64Encoder } from '@solana/codecs'

import {
  ACCOUNT,
  CONFIG_ACTION,
  CONFIG_ACTIONS_ENCODER,
  INSTRUCTION,
  PROPOSAL_STATUS
} from './helpers/layouts.js'

import { getProgramDerivedAddressSync } from './helpers/program-derived-address.js'

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
/**
 * `MultisigOptions` widened with the Squads permission mask to grant the member being added: a
 * bitwise OR of `PERMISSION.initiate`, `PERMISSION.vote` and `PERMISSION.execute`. Both fields
 * are optional; the threshold and the mask each keep their default when omitted.
 *
 * @typedef {Partial<MultisigOptions> & { mask?: number }} SolanaMultisigAddOwnerOptions
 */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigMessageProposal} MultisigMessageProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigSignature} MultisigSignature */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@solana/signers').KeyPairSigner} KeyPairSigner */

/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */

/** @typedef {import('./wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsConfig} SolanaMultisigSquadsConfig */

/**
 * The Squads member permissions, as the bits of a member's mask.
 *
 * @type {{ initiate: 1, vote: 2, execute: 4 }}
 */
export const PERMISSION = { initiate: 1, vote: 2, execute: 4 }

const ALMIGHTY_PERMISSIONS = PERMISSION.initiate | PERMISSION.vote | PERMISSION.execute
const PROGRAM_ADDRESS = {
  system: '11111111111111111111111111111111',
  token2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  addressLookupTable: 'AddressLookupTab1e1111111111111111111111111'
}

const ACCOUNT_ROLE = { readonly: 0, writable: 1, readonlySigner: 2, writableSigner: 3 }

const SEED = { prefix: 'multisig', multisig: 'multisig' }

const DEFAULT = { threshold: 1, timeLock: 0, vaultIndex: 0 }

const NO_EPHEMERAL_SIGNERS = 0
const NO_MEMO = null

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
   * Builds the signer a multisig is created with, from the secret its create key derives from.
   *
   * @param {string | Uint8Array} createKeySecret - The create key's secret. Base58 or raw bytes, either a 32-byte private key or a 64-byte keypair.
   * @returns {Promise<KeyPairSigner>} The create key signer.
   */
  static async getCreateKeySigner (createKeySecret) {
    const bytes = this.toCreateKeySecretBytes(createKeySecret)

    return bytes.length === SECRET_SIZE.privateKey
      ? createKeyPairSignerFromPrivateKeyBytes(bytes)
      : createKeyPairSignerFromBytes(bytes)
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
   * @throws {Error} If the signer is not a member of the multisig.
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
   * @throws {Error} If `createKeySecret` is missing, the arguments are invalid, the multisig already exists, or the quote exceeds `createMaxFee`.
   */
  async deploy (owners, threshold = DEFAULT.threshold) {
    const createKeySigner = await WalletAccountMultisigSolanaSquads.getCreateKeySigner(
      this._config.createKeySecret
    )
    const [expectedPda] = getProgramDerivedAddressSync({
      programAddress: this._programId,
      seeds: [SEED.prefix, SEED.multisig, getAddressEncoder().encode(createKeySigner.address)]
    })

    if (this._address && this._address !== expectedPda) {
      throw new Error(
        `The configured multisig ${this._address} does not derive from the configured createKeySecret (${expectedPda}).`
      )
    }

    const members = owners ?? [await this.getSignerAddress()]

    if (!Array.isArray(members) || !members.length) {
      throw new Error('At least one owner is required to create a multisig.')
    }

    this._validateMemberCount(members.length)

    if (new Set(members).size !== members.length) {
      throw new Error('The owners of a multisig must be unique.')
    }

    for (const member of members) {
      address(member)
    }

    this._validateThreshold(threshold, members.length)

    if (await this.isDeployed()) {
      throw new Error(`The multisig account ${expectedPda} already exists.`)
    }

    const [{ programConfigPda, treasury, creationFee }, rent] = await Promise.all([
      this._getProgramConfig(),
      this._rpc
        .getMinimumBalanceForRentExemption(BigInt(this._multisigAccountSize(members.length)))
        .send()
    ])

    const fee = this._quoteDeployFrom(creationFee, rent)
    const { createMaxFee } = this._config

    if (createMaxFee !== undefined && fee >= BigInt(createMaxFee)) {
      throw new Error('Exceeded maximum fee cost for the deploy operation.')
    }

    const instruction = {
      programAddress: this._programId,
      accounts: [
        { address: address(programConfigPda), role: ACCOUNT_ROLE.readonly },
        { address: address(treasury), role: ACCOUNT_ROLE.writable },
        { address: address(expectedPda), role: ACCOUNT_ROLE.writable },
        {
          address: createKeySigner.address,
          role: ACCOUNT_ROLE.readonlySigner,
          signer: createKeySigner
        },
        this._getRentPayerAccount(this._signerAddress),
        { address: address(PROGRAM_ADDRESS.system), role: ACCOUNT_ROLE.readonly }
      ],
      data: INSTRUCTION.multisigCreateV2.encode({
        configAuthority: null,
        threshold,
        members: members.map((member) => ({
          address: address(member),
          mask: ALMIGHTY_PERMISSIONS
        })),
        timeLock: DEFAULT.timeLock,
        rentCollector: null,
        memo: NO_MEMO
      })
    }

    const { hash } = await this._signerAccount.sendTransaction({ instructions: [instruction] })

    return { hash }
  }

  /**
   * Proposes a transaction to the multisig, open for voting. `tx` is either `{ to, value }` for a
   * SOL transfer or a message carrying `instructions`, which the vault executes as they stand.
   *
   * @param {SolanaTransaction} tx - The transaction to propose.
   * @param {MultisigTransactionOptions} [transactionOptions] - The multisig transaction's options. `autoExecute` executes the proposal in the same transaction only when it can: threshold 1, no time lock, and a signer holding both vote and execute. Where it cannot, it goes inert and the result's `status` stays `'pending'` rather than throwing.
   * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
   * @throws {ValueError} If `tx` is neither `{ to, value }` nor a message the vault can execute.
   * @throws {Error} If the multisig does not exist, the signer cannot propose, or the RPC request fails.
   */
  async propose (tx, transactionOptions = {}) {
    const vaultPda = address(await this.getVaultAddress(DEFAULT.vaultIndex))
    const compiled = this._compileTransactionMessage(
      vaultPda,
      this._toProposedInstructions(vaultPda, tx)
    )

    return this._proposeVaultTransaction(compiled, transactionOptions)
  }

  /**
   * Proposes an SPL token transfer to the multisig.
   *
   * @param {TransferOptions} transferOptions - The transfer options.
   * @param {MultisigTransactionOptions} [transactionOptions] - The multisig transaction's options. `autoExecute` executes the proposal in the same transaction only when it can: threshold 1, no time lock, and a signer holding both vote and execute. Where it cannot, it goes inert and the result's `status` stays `'pending'` rather than throwing.
   * @returns {Promise<SolanaMultisigProposalResult>} The transfer proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
   * @throws {Error} If the transfer options are invalid, the signer cannot propose, or the quote exceeds `transferMaxFee`.
   * @throws {NotSupportedError} If the mint belongs to the Token-2022 program. @todo Support Token-2022 (Token Extensions Program).
   */
  async transfer (transferOptions, transactionOptions = {}) {
    if (!this._rpc) {
      throw new Error('The wallet must be connected to a provider to propose transfers.')
    }

    const mint = address(transferOptions.token)
    const recipient = address(transferOptions.recipient)
    const vaultPda = address(await this.getVaultAddress(DEFAULT.vaultIndex))

    const [source, destination] = await Promise.all([
      findAssociatedTokenPda({ mint, owner: vaultPda, tokenProgram: TOKEN_PROGRAM_ADDRESS }),
      findAssociatedTokenPda({ mint, owner: recipient, tokenProgram: TOKEN_PROGRAM_ADDRESS })
    ])

    const multisig = await this._getMultisigAccount()

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

    if (mintAccount.owner === PROGRAM_ADDRESS.token2022) {
      throw new NotSupportedError(
        'transfer(transferOptions, options)',
        `the mint ${mint} belongs to the Token-2022 program, whose associated token accounts this package does not derive`
      )
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
        authority: vaultPda,
        amount: BigInt(transferOptions.amount)
      })
    )

    const compiled = this._compileTransactionMessage(vaultPda, instructions)
    const { rent, fee } = await this._quoteProposal(
      this._vaultTransactionSize(compiled.storedSize),
      multisig.members.length
    )
    const { transferMaxFee } = this._config

    if (transferMaxFee !== undefined && fee >= BigInt(transferMaxFee)) {
      throw new Error('Exceeded maximum fee cost for the transfer operation.')
    }

    return this._proposeVaultTransaction(compiled, { ...transactionOptions, multisig, rent })
  }

  /**
   * Approves a pending transaction proposal.
   *
   * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
   * @param {string} [memo] - An optional note recorded on chain with the vote. It costs rent, and an empty string is stored as a present-but-empty memo rather than none.
   * @returns {Promise<SolanaMultisigProposalResult>} The approval result.
   * @throws {NoSuchElementError} If no proposal exists at that id.
   * @throws {Error} If the proposal is not open to this signer's approval, or the RPC request fails.
   */
  async approveProposal (proposalId, memo) {
    const index = this._toProposalIndex(proposalId)
    const { multisig, proposal } = await this._getMultisigAndProposal(index)
    const signerAddress = await this._requireVotableProposal(multisig, proposal, index)

    if (proposal.approved.includes(signerAddress)) {
      throw new Error(`The signer ${signerAddress} has already approved the proposal ${index}.`)
    }

    const instruction = this._buildProposalVoteInstruction(
      INSTRUCTION.proposalApprove,
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
   * @param {string} [memo] - An optional note recorded on chain with the vote. It costs rent, and an empty string is stored as a present-but-empty memo rather than none.
   * @returns {Promise<SolanaMultisigProposalResult>} The rejection result.
   * @throws {NoSuchElementError} If no proposal exists at that id.
   * @throws {Error} If the proposal is not open to this signer's rejection, or the RPC request fails.
   */
  async rejectProposal (proposalId, memo) {
    const index = this._toProposalIndex(proposalId)
    const { multisig, proposal } = await this._getMultisigAndProposal(index)
    const signerAddress = await this._requireVotableProposal(multisig, proposal, index)

    if (proposal.rejected.includes(signerAddress)) {
      throw new Error(`The signer ${signerAddress} has already rejected the proposal ${index}.`)
    }

    const instruction = this._buildProposalVoteInstruction(
      INSTRUCTION.proposalReject,
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
   * @throws {ValueError} If the proposal has not reached the approval threshold, or its transaction account has been closed.
   * @throws {Error} If the proposal cannot be executed by this signer yet, or the RPC request fails.
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

    this._requirePermission(multisig, signerAddress, PERMISSION.execute, 'execute proposals')

    if (!proposal.exists) {
      throw new NoSuchElementError(
        `The multisig ${multisig.address} has no proposal at index ${index}.`
      )
    }

    if (proposal.status !== PROPOSAL_STATUS.approved) {
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

    if (!transaction.exists) {
      throw new ValueError(
        `The transaction account ${transaction.address} behind proposal ${index} has been closed.`
      )
    }

    const instruction = transaction.kind === TRANSACTION_KIND.config
      ? await this._buildConfigExecuteInstruction(multisig, proposal, transaction, signerAddress, index)
      : await this._buildVaultExecuteInstruction(multisig, proposal, transaction, signerAddress)

    return this._signerAccount.sendTransaction({ instructions: [instruction] })
  }

  /**
   * Proposes adding a new member to the multisig.
   *
   * @param {string} ownerAddress - The address of the member to add.
   * @param {SolanaMultisigAddOwnerOptions} [options] - The operation options. `mask` is the member's Squads permissions (default: all three).
   * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
   * @throws {Error} If the addition or the resulting configuration is invalid, the signer cannot propose, or the RPC request fails.
   */
  async addOwner (ownerAddress, options = {}) {
    const newOwner = address(ownerAddress)
    const mask = options.mask ?? ALMIGHTY_PERMISSIONS

    if (!Number.isInteger(mask) || mask < PERMISSION.initiate || mask > ALMIGHTY_PERMISSIONS) {
      throw new Error(
        `Invalid permission mask ${mask}. It must be an integer between ${PERMISSION.initiate} and ${ALMIGHTY_PERMISSIONS}, a bitwise OR of initiate (${PERMISSION.initiate}), vote (${PERMISSION.vote}) and execute (${PERMISSION.execute}).`
      )
    }

    const multisig = await this._getMultisigAccount()

    this._requireDeployed(multisig, 'proposing configuration changes')
    this._requireAutonomous(multisig)
    await this._requireCanPropose(multisig)

    if (multisig.members.some((member) => member.address === newOwner)) {
      throw new Error(
        `The address ${newOwner} is already a member of the multisig ${multisig.address}.`
      )
    }

    const resulting = [...multisig.members, { address: newOwner, mask }]

    this._requireViableMembers(resulting, options.threshold ?? multisig.threshold, multisig.address)

    const actions = [CONFIG_ACTION.addMember(newOwner, mask)]

    if (options.threshold !== undefined) {
      actions.push(CONFIG_ACTION.changeThreshold(options.threshold))
    }

    return this._proposeConfigTransaction(multisig, actions)
  }

  /**
   * Proposes removing a member from the multisig.
   *
   * @param {string} ownerAddress - The address of the member to remove.
   * @param {Partial<MultisigOptions>} [options] - The operation options.
   * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
   * @throws {Error} If the removal or the resulting configuration is invalid, the signer cannot propose, or the RPC request fails.
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

    const actions = [CONFIG_ACTION.removeMember(owner)]

    if (options.threshold !== undefined) {
      actions.push(CONFIG_ACTION.changeThreshold(options.threshold))
    }

    return this._proposeConfigTransaction(multisig, actions)
  }

  /**
   * Proposes swapping one member for another, the new member inheriting the old one's
   * permissions.
   *
   * @param {string} oldOwnerAddress - The address of the member to replace.
   * @param {string} newOwnerAddress - The address of the new member.
   * @param {Partial<MultisigOptions>} [options] - The operation options.
   * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
   * @throws {Error} If the swap or the resulting configuration is invalid, the signer cannot propose, or the RPC request fails.
   */
  async swapOwner (oldOwnerAddress, newOwnerAddress, options = {}) {
    const oldOwner = address(oldOwnerAddress)
    const newOwner = address(newOwnerAddress)

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
      CONFIG_ACTION.removeMember(oldOwner),
      CONFIG_ACTION.addMember(newOwner, replaced.mask)
    ]

    if (options.threshold !== undefined) {
      actions.push(CONFIG_ACTION.changeThreshold(options.threshold))
    }

    return this._proposeConfigTransaction(multisig, actions)
  }

  /**
   * Proposes changing the approval threshold of the multisig.
   *
   * @param {number} newThreshold - The new threshold.
   * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
   * @throws {Error} If the threshold is invalid or already in force, the signer cannot propose, or the RPC request fails.
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

    return this._proposeConfigTransaction(multisig, [
      CONFIG_ACTION.changeThreshold(newThreshold)
    ])
  }

  /**
   * Returns a read-only copy of the account. The multisig address is resolved first, since the
   * copy carries no `createKeySecret` to resolve it from.
   *
   * @returns {Promise<WalletAccountReadOnlyMultisigSolanaSquads>} The read-only account.
   * @throws {Error} If the multisig address cannot be resolved.
   */
  async toReadOnlyAccount () {
    const multisigPdaOrCreateKey = await this.getAddress()
    const { createKeySecret, ...config } = this._config

    return new WalletAccountReadOnlyMultisigSolanaSquads(this._signerAddress, {
      ...config,
      multisigPdaOrCreateKey
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
  async _proposeVaultTransaction (compiled, options = {}) {
    const multisig = options.multisig ?? await this._getMultisigAccount()

    return this._proposeTransaction(
      multisig,
      INSTRUCTION.vaultTransactionCreate.encode({
        vaultIndex: DEFAULT.vaultIndex,
        ephemeralSigners: NO_EPHEMERAL_SIGNERS,
        transactionMessage: compiled.bytes,
        memo: NO_MEMO
      }),
      this._vaultTransactionSize(compiled.storedSize),
      {
        buildExtraInstructions: options.autoExecute
          ? (context) => this._buildAutoExecuteInstructions(multisig, compiled, context)
          : null,
        rent: options.rent
      }
    )
  }

  /** @private */
  _getRentPayerAccount (signerAddress) {
    return {
      address: address(this._config.rentPayer ?? signerAddress),
      role: ACCOUNT_ROLE.writableSigner
    }
  }

  /** @private */
  async _proposeConfigTransaction (multisig, actions) {
    return this._proposeTransaction(
      multisig,
      INSTRUCTION.configTransactionCreate.encode({ actions, memo: NO_MEMO }),
      this._configTransactionSize(CONFIG_ACTIONS_ENCODER.getSizeFromValue(actions))
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
  async _proposeTransaction (multisig, data, transactionSize, options = {}) {
    const { address: multisigPda, threshold, transactionIndex, members } = multisig

    this._requireDeployed(multisig, 'proposing transactions')

    const signerAddress = await this.getSignerAddress()

    this._requirePermission(
      { address: multisigPda, members },
      signerAddress,
      PERMISSION.initiate,
      'propose transactions'
    )

    const index = transactionIndex + 1n
    const transactionPda = this._getTransactionPda(multisigPda, index)
    const proposalPda = this._getProposalPda(multisigPda, index)

    const rentPayer = this._getRentPayerAccount(signerAddress)
    const creator = rentPayer.address === signerAddress
      ? rentPayer
      : { address: address(signerAddress), role: ACCOUNT_ROLE.readonlySigner }
    const systemProgram = { address: address(PROGRAM_ADDRESS.system), role: ACCOUNT_ROLE.readonly }

    const instructions = [
      {
        programAddress: this._programId,
        accounts: [
          { address: address(multisigPda), role: ACCOUNT_ROLE.writable },
          { address: transactionPda, role: ACCOUNT_ROLE.writable },
          creator,
          rentPayer,
          systemProgram
        ],
        data
      },
      {
        programAddress: this._programId,
        accounts: [
          { address: address(multisigPda), role: ACCOUNT_ROLE.readonly },
          { address: proposalPda, role: ACCOUNT_ROLE.writable },
          creator,
          rentPayer,
          systemProgram
        ],
        data: INSTRUCTION.proposalCreate.encode({ transactionIndex: index, draft: false })
      }
    ]

    const extra = options.buildExtraInstructions
      ? await options.buildExtraInstructions({ index, transactionPda, proposalPda, signerAddress })
      : []

    instructions.push(...extra)

    const rent = options.rent ?? await this._quoteProposalRent(transactionSize, members.length)
    const { hash, fee } = await this._signerAccount.sendTransaction({ instructions })
    const executed = extra.length > 0

    const autoExecuteResult = executed
      ? { status: 'executed', transaction: { hash, fee } }
      : { status: 'pending' }

    return {
      proposalId: index.toString(),
      hash,
      fee: fee + rent,
      confirmations: executed ? 1 : 0,
      threshold,
      ...autoExecuteResult
    }
  }

  /** @private */
  async _buildAutoExecuteInstructions (multisig, compiled, context) {
    const { proposalPda, transactionPda, signerAddress } = context

    const signer = multisig.members.find((member) => member.address === signerAddress)
    const canAutoExecute = multisig.threshold === 1 && multisig.timeLock === 0 &&
      Boolean(signer && (signer.mask & PERMISSION.vote) && (signer.mask & PERMISSION.execute))

    if (!canAutoExecute) {
      return []
    }

    const vaultPda = await this.getVaultAddress(DEFAULT.vaultIndex)
    const transaction = {
      address: transactionPda,
      ephemeralSignerCount: NO_EPHEMERAL_SIGNERS,
      message: { ...compiled, addressTableLookups: [] }
    }

    return [
      this._buildProposalVoteInstruction(
        INSTRUCTION.proposalApprove, multisig.address, signerAddress, proposalPda
      ),
      {
        programAddress: this._programId,
        accounts: [
          { address: address(multisig.address), role: ACCOUNT_ROLE.readonly },
          { address: proposalPda, role: ACCOUNT_ROLE.writable },
          { address: transactionPda, role: ACCOUNT_ROLE.readonly },
          { address: address(signerAddress), role: ACCOUNT_ROLE.readonlySigner },
          ...await this._resolveExecutionAccounts(transaction, vaultPda)
        ],
        data: INSTRUCTION.vaultTransactionExecute.encode()
      }
    ]
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

    this._requirePermission(multisig, signerAddress, PERMISSION.vote, 'vote on proposals')

    if (!proposal.exists) {
      throw new NoSuchElementError(
        `The multisig ${multisig.address} has no proposal at index ${index}.`
      )
    }

    if (proposal.status !== PROPOSAL_STATUS.active) {
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
  _buildProposalVoteInstruction (vote, multisigPda, signerAddress, proposalPda, memo) {
    if (memo !== undefined && memo !== null && typeof memo !== 'string') {
      throw new Error(`Invalid memo ${memo}. It must be a string.`)
    }

    return {
      programAddress: this._programId,
      accounts: [
        { address: address(multisigPda), role: ACCOUNT_ROLE.readonly },
        { address: address(signerAddress), role: ACCOUNT_ROLE.writableSigner },
        { address: address(proposalPda), role: ACCOUNT_ROLE.writable }
      ],
      data: vote.encode({ memo: memo ?? NO_MEMO })
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
    const spendingLimits = transaction.actions
      .filter((action) => action.createKey || action.spendingLimit)
      .map((action) => action.spendingLimit
        ? address(action.spendingLimit)
        : this._getSpendingLimitPda(multisig.address, action.createKey))

    return {
      programAddress: this._programId,
      accounts: [
        { address: address(multisig.address), role: ACCOUNT_ROLE.writable },
        { address: member, role: ACCOUNT_ROLE.readonlySigner },
        { address: address(proposal.address), role: ACCOUNT_ROLE.writable },
        { address: address(transaction.address), role: ACCOUNT_ROLE.readonly },
        { address: member, role: ACCOUNT_ROLE.writableSigner },
        { address: address(PROGRAM_ADDRESS.system), role: ACCOUNT_ROLE.readonly },
        ...spendingLimits.map((spendingLimit) => ({ address: spendingLimit, role: ACCOUNT_ROLE.writable }))
      ],
      data: INSTRUCTION.configTransactionExecute.encode()
    }
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
        { address: address(multisig.address), role: ACCOUNT_ROLE.readonly },
        { address: address(proposal.address), role: ACCOUNT_ROLE.writable },
        { address: address(transaction.address), role: ACCOUNT_ROLE.readonly },
        { address: address(signerAddress), role: ACCOUNT_ROLE.readonlySigner },
        ...await this._resolveExecutionAccounts(transaction, vaultPda)
      ],
      data: INSTRUCTION.vaultTransactionExecute.encode()
    }
  }

  /** @private */
  async _resolveExecutionAccounts (transaction, vaultPda) {
    const { message } = transaction
    const signedForByProgram = new Set([
      vaultPda,
      ...this._getEphemeralSignerPdas(transaction.address, transaction.ephemeralSignerCount)
    ])
    const lookups = message.addressTableLookups
    const accounts = lookups.map((lookup) => ({
      address: address(lookup.accountKey),
      role: ACCOUNT_ROLE.readonly
    }))

    message.accountKeys.forEach((key, i) => {
      const writable = i < message.numWritableSigners ||
        (i >= message.numSigners && i - message.numSigners < message.numWritableNonSigners)
      const signer = i < message.numSigners && !signedForByProgram.has(key)
      const role = signer
        ? (writable ? ACCOUNT_ROLE.writableSigner : ACCOUNT_ROLE.readonlySigner)
        : (writable ? ACCOUNT_ROLE.writable : ACCOUNT_ROLE.readonly)

      accounts.push({ address: address(key), role })
    })

    if (!lookups.length) {
      return accounts
    }

    const tables = await this._getLookupTableAddresses(lookups)

    for (const lookup of lookups) {
      const addresses = tables.get(lookup.accountKey)

      for (const [indexes, role] of [
        [lookup.writableIndexes, ACCOUNT_ROLE.writable],
        [lookup.readonlyIndexes, ACCOUNT_ROLE.readonly]
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

    const tables = new Map()

    value.forEach((account, i) => {
      if (!account || account.owner !== PROGRAM_ADDRESS.addressLookupTable) {
        throw new Error(
          `The address lookup table ${keys[i]} does not exist, so the proposal can no longer be executed.`
        )
      }

      tables.set(
        keys[i],
        ACCOUNT.lookupTableAddresses.decode(getBase64Encoder().encode(account.data[0]))
      )
    })

    return tables
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
  }

  /** @private */
  async _requireCanPropose (multisig) {
    this._requirePermission(
      multisig,
      await this.getSignerAddress(),
      PERMISSION.initiate,
      'propose transactions'
    )
  }

  /** @private */
  _requireViableMembers (members, threshold, multisigPda) {
    if (!members.length) {
      throw new Error(`The multisig ${multisigPda} would be left with no members.`)
    }

    const required = [
      [PERMISSION.vote, 'vote on proposals'],
      [PERMISSION.initiate, 'propose transactions'],
      [PERMISSION.execute, 'execute proposals']
    ]

    for (const [mask, permission] of required) {
      if (!members.some((member) => member.mask & mask)) {
        throw new Error(
          `The multisig ${multisigPda} would be left with no member able to ${permission}.`
        )
      }
    }

    this._validateThreshold(threshold, members.filter((member) => member.mask & PERMISSION.vote).length)
  }
}
