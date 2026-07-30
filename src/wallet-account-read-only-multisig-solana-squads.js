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

/** @typedef {ReturnType<typeof import('@solana/rpc').createSolanaRpc>} SolanaRpc */
/** @typedef {import('@solana/rpc-types').Commitment} Commitment */

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
     *
     * @protected
     * @type {string | null}
     */
    this._multisigPda = config.multisigPda ?? null

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
   * Builds a failover-backed Solana RPC client from a list of URLs.
   *
   * @private
   * @param {string[]} urls - The RPC URLs.
   * @param {number} retries - The number of retries.
   * @returns {SolanaRpc} The failover RPC client.
   */
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
   * @returns {Promise<string>} The multisig address.
   */
  async getAddress () {
    if (!this._multisigPda) {
      throw new Error('No multisig address is configured. Provide `multisigPda` in the config.')
    }

    return this._multisigPda
  }

  /**
   * Returns whether the multisig account is deployed on-chain.
   *
   * @returns {Promise<boolean>} Whether the multisig is deployed.
   */
  async isDeployed () {
    throw new NotImplementedError('isDeployed()')
  }

  /**
   * Returns the members of the multisig.
   *
   * @returns {Promise<string[]>} The member addresses.
   */
  async getOwners () {
    throw new NotImplementedError('getOwners()')
  }

  /**
   * Returns the approval threshold of the multisig.
   *
   * @returns {Promise<number>} The threshold.
   */
  async getThreshold () {
    throw new NotImplementedError('getThreshold()')
  }

  /**
   * Returns aggregated information about the multisig.
   *
   * @returns {Promise<MultisigInfo>} The multisig info.
   */
  async getMultisigInfo () {
    throw new NotImplementedError('getMultisigInfo()')
  }

  /**
   * Returns the current transaction index (nonce) of the multisig.
   *
   * @returns {Promise<bigint>} The transaction index.
   */
  async getNonce () {
    throw new NotImplementedError('getNonce()')
  }

  /**
   * Returns the on-chain version of the multisig program account.
   *
   * @returns {Promise<string>} The version.
   */
  async getVersion () {
    throw new NotImplementedError('getVersion()')
  }

  /**
   * Returns the native SOL balance of the multisig vault.
   *
   * @returns {Promise<bigint>} The balance in lamports.
   */
  async getBalance () {
    throw new NotImplementedError('getBalance()')
  }

  /**
   * Returns the SPL token balance of the multisig vault.
   *
   * @param {string} tokenAddress - The SPL token mint address.
   * @returns {Promise<bigint>} The token balance (in base unit).
   */
  async getTokenBalance (tokenAddress) {
    throw new NotImplementedError('getTokenBalance(tokenAddress)')
  }

  /**
   * Returns the receipt of a confirmed transaction.
   *
   * @param {string} hash - The transaction signature.
   * @returns {Promise<SolanaTransactionReceipt>} The transaction receipt.
   */
  async getTransactionReceipt (hash) {
    throw new NotImplementedError('getTransactionReceipt(hash)')
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
