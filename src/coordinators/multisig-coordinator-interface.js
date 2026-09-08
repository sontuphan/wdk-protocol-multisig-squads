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
 * N+2 transactions a Squads proposal costs into three.
 *
 * Creating a proposal, rejecting it and executing it are each one member's own transaction and
 * never reach a coordinator. Approvals do: each member appends its own to the message
 * `getProposal` hands back and has `confirmProposal` sign it, then `submitProposal` keeps it
 * circulating while the approvals in it are short of the threshold. The account that meets the
 * threshold broadcasts, so a coordinator signs and holds and never reaches the cluster itself.
 *
 * What travels is a message, not a transaction: uncompiled, so the next approval can still be
 * appended, which also means no signature exists on it yet. How one comes to be there is the
 * implementation's business, and `@solana/kit` offers the pieces: a signer on the instruction that
 * names the member, or a `NoopSigner` marking a slot for a signature collected over the compiled
 * bytes later, which is what `CoordinatorSigner.partiallySignTransaction` is for.
 *
 * `submitProposal` resolves late, with the hash and fee of the transaction that eventually carries
 * the approvals it was given, which is what keeps the account's non-nullable `hash` honest.
 *
 * It has no proposal storage, no message sharing and no quoting: approvals are on-chain
 * instructions, so the read-only account reads them from the cluster. Nor does it own an identity:
 * the account votes as the member it derived.
 *
 * Implementations extend this class, which holds the configuration and leaves every method to
 * them. The configuration is the member's signer, widened by whatever else an implementation needs:
 * a service URL, a transport, a key of its own.
 *
 * @template {CoordinatorSigner} [TCoordinatorConfig=CoordinatorSigner]
 */
export class IMultisigCoordinator {
  /**
   * Creates a coordinator over its configuration.
   *
   * @param {TCoordinatorConfig} config - The member's signer, widened by whatever else the implementation needs.
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
   * Takes the message a proposal's approvals accumulate in, to keep circulating while they are
   * short of the threshold. Circulating is all it does: reaching the cluster is the account's job.
   *
   * @param {string} proposalId - The proposal (transaction index) id.
   * @param {TransactionMessage} proposal - The message as this member left it, carrying every approval collected so far.
   * @returns {Promise<TransactionResult>} The signature and fee of the transaction that eventually carries these approvals, which is why it resolves late.
   */
  async submitProposal (proposalId, proposal) {
    throw new NotImplementedError('submitProposal(proposalId, proposal)')
  }

  /**
   * Returns the message being circulated for a proposal, so the next member can add its approval
   * to it rather than opening a transaction of its own.
   *
   * Every instruction in it must be one member's approval of that proposal, and nothing else:
   * the account appends its own and counts what it finds towards the threshold without inspecting
   * it, so a rejection, an execution or padding of any kind is malformed and counts as that many
   * approvals. The message `submitProposal` was handed is already of that shape, so an
   * implementation that returns what it was given, however it carries the signatures, satisfies
   * this without checking. One that batches anything else keeps it out of what this hands back.
   * At most one of those approvals may be any one member's; `confirmProposal` is where a second
   * one is caught, since it is the account's own append that creates it.
   *
   * @param {string} proposalId - The proposal (transaction index) id.
   * @returns {Promise<TransactionMessage | null>} The message, carrying the approvals collected so far and nothing else, or null when nothing is circulating for that id.
   */
  async getProposal (proposalId) {
    throw new NotImplementedError('getProposal(proposalId)')
  }

  /**
   * Signs the member's approval. Signing is all it does: the account decides whether the result
   * keeps circulating or goes to the cluster.
   *
   * This is the only method handed the complete list, the member's own approval included, so it is
   * where an implementation refuses one it should not sign. Two approvals from one member is the
   * case to refuse: the account's own guard reads the cluster, which has not recorded an approval
   * that is still circulating, so a member that votes twice before the batch lands appends a
   * second one and the account cannot see it. Squads rejects the second, and the whole batch with
   * it. Refuse by throwing `ValueError`, which this package re-exports and which is what the
   * account itself raises when the cluster shows the same member has already approved, so both
   * halves of the condition surface the same way. It reaches the caller unchanged.
   *
   * @param {TransactionMessage} proposal - The message to sign, carrying the approvals collected so far plus this member's, and the execution too when this one reaches the threshold. At most one approval per member, which is the precondition this method is the last place to check.
   * @returns {Promise<TransactionMessage>} The message with this member's signature accounted for, however the implementation carries it.
   */
  async confirmProposal (proposal) {
    throw new NotImplementedError('confirmProposal(proposal)')
  }
}
