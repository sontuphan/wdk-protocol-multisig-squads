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

/** @typedef {import('@solana/transactions').Transaction} Transaction */

/**
 * What a coordinator is given of the member it serves: its address, and nothing else. Signing stays
 * with the account.
 *
 * @typedef {Object} CoordinatorSigner
 * @property {() => Promise<string>} getAddress - Returns the member's address.
 */

/**
 * Builds the coordinator an account votes through. One configuration is shared by every account a
 * manager derives, and each signs with a different key, so it carries a factory rather than an
 * instance.
 *
 * @typedef {(config: CoordinatorSigner) => IMultisigCoordinator} MultisigCoordinatorFactory
 */

/**
 * Coordinator for collecting a proposal's approvals into one transaction.
 *
 * A coordinator decides which members will approve, builds their approvals and the execution if one
 * rides along, fixes the fee payer and the lifetime, and compiles. `getProposal` hands that bundle
 * to a member and `confirmProposal` takes back the signature the member's account puts on it, for
 * the coordinator to merge into the copy it holds. The member whose signature completes the bundle
 * broadcasts it, so a coordinator neither signs nor reaches the cluster. Creating a proposal,
 * rejecting it and executing it never reach a coordinator at all.
 *
 * Implementations declare `@implements` and keep the `CoordinatorSigner` the factory hands them in
 * whatever shape they need.
 *
 * @interface
 */
export class IMultisigCoordinator {
  /**
   * Returns the compiled bundle this member should sign, or null to leave it voting alone in its own
   * transaction. The bundle must carry this member's own approval of that proposal. Refuse by
   * answering null or by throwing.
   *
   * @param {string} proposalId - The proposal (transaction index) id.
   * @returns {Promise<Transaction | null>} The bundle, or null.
   */
  async getProposal (proposalId) {
    throw new NotImplementedError('getProposal(proposalId)')
  }

  /**
   * Takes this member's signature over the bundle `getProposal` handed out, for the coordinator to
   * put in its slot of the copy it holds.
   *
   * @param {string} proposalId - The proposal (transaction index) id.
   * @param {string} signature - The member's signature over the bundle, base58 encoded.
   * @returns {Promise<void>}
   */
  async confirmProposal (proposalId, signature) {
    throw new NotImplementedError('confirmProposal(proposalId, signature)')
  }
}
