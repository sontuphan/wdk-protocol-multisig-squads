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
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */
/** @typedef {import('@tetherto/wdk-wallet-solana').WalletAccountSolana} WalletAccountSolana */

/**
 * Builds the coordinator an account votes and proposes through, from the member's own signer
 * account. One configuration is shared by every account a manager derives, and each of those
 * signs with a different key, so the configuration carries this rather than a coordinator instance.
 *
 * @typedef {(signerAccount: WalletAccountSolana) => IMultisigCoordinator} MultisigCoordinatorFactory
 */

/**
 * Coordinator for getting a Squads transaction signed and broadcast, and the only place a
 * proposal's N+2 transactions can become two.
 *
 * The first of the two creates the proposal and is the proposer's own transaction, which no
 * coordinator sees: it has to land before any approval can name its address. The second is this
 * contract's whole job. It carries the members' `proposalApprove` instructions together with the
 * execute, which is possible because a coordinator may hold what it is given: several members each
 * call `sendTransaction` with their own approval, and one message is compiled once enough of them
 * have arrived. Those calls resolve late, with the hash and fee of the transaction that landed, so
 * the account's public results keep a non-nullable `hash`. Two is the floor, not the count: a
 * message over the 1232-byte limit or a threshold reached in stages splits the second transaction.
 *
 * The account builds the unsigned vote and execute instructions and hands them here; the
 * coordinator owns everything from that point: which signatures the transaction needs, how they
 * are collected, and when it reaches the cluster. The default, `LocalSignerCoordinator`, signs with
 * the local member key and broadcasts at once, which is what the package did before coordinators
 * existed and leaves the bare N+2 shape untouched.
 *
 * Squads keeps its votes on chain, so this contract is about reaching the cluster and nothing else.
 * It deliberately has no proposal storage, no message sharing and no quoting: proposals and votes
 * are read from the chain by the read-only account, and the fee a transaction paid comes back from
 * `sendTransaction`. Nor does it own an identity: the account votes as the member it derived, and
 * `getSignerAddress()` answers from that account, so the two can never disagree.
 *
 * A coordinator disposes what it created. The signer account it is given is owned by the caller,
 * which zeroes that key itself.
 *
 * @interface
 */
export class IMultisigCoordinator {
  /**
   * Signs a transaction and broadcasts it, resolving once it has reached the cluster.
   *
   * @param {SolanaTransaction} tx - The unsigned transaction. Its instructions may carry embedded signers, which the coordinator must honour.
   * @returns {Promise<TransactionResult>} The transaction's signature and the fee it paid.
   */
  async sendTransaction (tx) {
    throw new NotImplementedError('sendTransaction(tx)')
  }

  /**
   * Releases the coordinator's resources, erasing any key material it created.
   *
   * @returns {void}
   */
  dispose () {
    throw new NotImplementedError('dispose()')
  }
}
