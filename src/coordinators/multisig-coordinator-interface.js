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

/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@solana/transactions').Transaction} Transaction */
/** @typedef {import('@solana/transaction-messages').BaseTransactionMessage} TransactionMessage */

/**
 * What a coordinator is given of the member it signs for: the address to name it by and a way to
 * add its signature to a transaction. Deliberately not the member's account, which would hand over
 * the key as well, and deliberately partial: a coordinator collects signatures, so it must be able
 * to add one without disturbing the others or compiling anything.
 *
 * @typedef {Object} CoordinatorSigner
 * @property {() => Promise<string>} getAddress - Returns the member's address.
 * @property {(tx: Transaction) => Promise<Transaction>} partiallySignTransaction - Adds this member's signature to a compiled transaction and changes nothing else, so signatures collected from several members merge in any order. The key itself stays in the account.
 */

/**
 * Builds the coordinator an account votes through, from a signer over the member's own key. One
 * configuration is shared by every account a manager derives, and each of those signs with a
 * different key, so the configuration carries this rather than a coordinator instance.
 *
 * @typedef {(config: CoordinatorSigner) => IMultisigCoordinator} MultisigCoordinatorFactory
 */

/**
 * Coordinator for collecting a proposal's approvals into one transaction, which is what turns the
 * N+2 transactions a Squads proposal costs into the three of `docs/COORDINATOR.md`.
 *
 * Creating a proposal, rejecting it and executing it are each one member's own transaction and
 * never reach a coordinator. Approvals do. Each member appends its own to the transaction
 * `getProposal` hands back and has `confirmProposal` sign it; while the approvals in it are short
 * of the threshold `submitProposal` keeps it circulating, and once they meet it the account
 * broadcasts it. So a coordinator signs and holds, and never reaches the cluster itself.
 *
 * What travels is a transaction message, not a transaction: uncompiled, so the next member's
 * approval can still be appended to it, and how each member's signature comes to be on it is the
 * implementation's business. `@solana/kit` offers the pieces: a signer on the instruction that
 * names the member, a `NoopSigner` to mark a slot for a signature collected later, partial
 * signatures merged over the compiled bytes. This contract takes no view on which.
 *
 * `submitProposal` resolves late, with the hash and fee of the transaction that eventually carries
 * the approvals it was given, which is what keeps the account's non-nullable `hash` honest. Three
 * is the floor, not the count: a message over the 1232-byte limit, or a threshold reached in
 * stages, splits the collecting transaction.
 *
 * A coordinator is configured with a `CoordinatorSigner`, not with the member's account: it can
 * name the member and sign as it, and cannot read the key it signs with.
 *
 * The contract deliberately has no proposal storage, no message sharing and no quoting: votes are
 * on-chain instructions, so the read-only account reads them from the cluster, and all a
 * coordinator holds is the transaction still being signed. Nor does it own an identity: the account
 * votes as the member it derived, and `getSignerAddress()` answers from that account, so the two
 * can never disagree.
 *
 * Implementations extend this class, which holds the configuration and leaves every method to
 * them. The configuration is the member's signer, widened by whatever else an implementation needs:
 * a service URL, a peer list, a key of its own.
 *
 * @template {CoordinatorSigner} [TCoordinatorConfig=CoordinatorSigner]
 */
export class IMultisigCoordinator {
  /**
   * Creates a coordinator over its configuration.
   *
   * @param {TCoordinatorConfig} config - The coordinator's configuration. It carries the member's signer, which names the member and signs as it without exposing its key.
   */
  constructor (config) {
    /**
     * The coordinator's configuration.
     *
     * @protected
     * @type {TCoordinatorConfig}
     */
    this._config = config
  }

  /**
   * Takes the partially signed transaction a proposal's approvals are accumulating in, to keep
   * circulating among the members while it is short of the threshold. Circulating is all it does:
   * a coordinator never puts a transaction on the cluster, which is the account's job. Resolving
   * late is the point: the promise settles when whoever completes the threshold broadcasts it,
   * which is what keeps the account's `hash` non-nullable.
   *
   * @param {string} proposalId - The proposal (transaction index) id.
   * @param {TransactionMessage} proposal - The message as this member left it, carrying every approval collected so far.
   * @returns {Promise<TransactionResult>} The signature and fee of the transaction that eventually carries these approvals.
   */
  async submitProposal (proposalId, proposal) {
    throw new NotImplementedError('submitProposal(proposalId, proposal)')
  }

  /**
   * Returns the partially signed transaction the coordinator is circulating for a proposal, so
   * that the next member can add its own vote to it rather than opening a second one.
   *
   * @param {string} proposalId - The proposal (transaction index) id.
   * @returns {Promise<TransactionMessage | null>} The message being circulated, whose instructions carry the approvals collected so far, or null when the coordinator is circulating nothing for that id.
   */
  async getProposal (proposalId) {
    throw new NotImplementedError('getProposal(proposalId)')
  }

  /**
   * Signs the member's approval. Signing is all it does: the account decides whether the result
   * keeps circulating or goes to the cluster.
   *
   * @param {TransactionMessage} proposal - The message to sign, whose instructions carry the approvals collected so far plus this member's, and the execution too when this approval reaches the threshold.
   * @returns {Promise<TransactionMessage>} The message with this member's signature accounted for, however the implementation carries it.
   */
  async confirmProposal (proposal) {
    throw new NotImplementedError('confirmProposal(proposal)')
  }
}
