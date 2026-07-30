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
   * @param {string | Uint8Array} message - The message to propose.
   * @returns {Promise<MessageProposal>} The message proposal.
   */
  async proposeMessage (message) {
    throw new NotImplementedError('proposeMessage(message)')
  }

  /**
   * Approves a pending message proposal.
   *
   * @param {string} messageHash - The hash of the proposed message.
   * @returns {Promise<MessageProposal>} The updated message proposal.
   */
  async approveMessage (messageHash) {
    throw new NotImplementedError('approveMessage(messageHash)')
  }

  /**
   * Validates that the signer is a member of the multisig.
   *
   * @returns {Promise<void>}
   * @throws {Error} If the signer is not a member.
   */
  async validateSignerIsOwner () {
    throw new NotImplementedError('validateSignerIsOwner()')
  }

  /**
   * Deploys (creates) the multisig account on-chain.
   *
   * @returns {Promise<MultisigResult>} The deploy result.
   */
  async deploy () {
    throw new NotImplementedError('deploy()')
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
}
