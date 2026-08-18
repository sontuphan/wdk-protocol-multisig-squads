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
 * Builds the transport an account votes and proposes through, from the member's own signer
 * account. One configuration is shared by every account a manager derives, and each of those
 * signs with a different key, so the configuration carries this rather than a transport instance.
 *
 * @typedef {(signerAccount: WalletAccountSolana) => ISquadsTransactionTransport} SquadsTransactionTransportFactory
 */

/**
 * Transport for getting a Squads transaction signed and broadcast.
 *
 * The account builds unsigned Solana instructions and hands them here; the transport owns
 * everything from that point: which signatures the transaction needs, how they are collected, and
 * when it reaches the cluster. The default, `LocalSignerTransport`, signs with the local member
 * key and broadcasts at once, which is what the package did before transports existed. A
 * peer-to-peer implementation would instead distribute the transaction to the other members and
 * broadcast once enough of them have signed, resolving late rather than returning early: the
 * account's public results carry a non-nullable `hash`.
 *
 * Squads keeps its votes on chain, one transaction per vote, so this contract is about reaching
 * the cluster and nothing else. It deliberately has no proposal storage, no message sharing and no
 * quoting: proposals and votes are read from the chain by the read-only account, and the fee a
 * transaction paid comes back from `sendTransaction`. Nor does it own an identity: the account
 * votes as the member it derived, and `getSignerAddress()` answers from that account, so the two
 * can never disagree.
 *
 * A transport disposes what it created. The signer account it is given is owned by the caller,
 * which zeroes that key itself.
 *
 * @interface
 */
export class ISquadsTransactionTransport {
  /**
   * Signs a transaction and broadcasts it, resolving once it has reached the cluster.
   *
   * @param {SolanaTransaction} tx - The unsigned transaction. Its instructions may carry embedded signers, which the transport must honour.
   * @returns {Promise<TransactionResult>} The transaction's signature and the fee it paid.
   * @throws {NotImplementedError} An implementation must provide this method.
   */
  async sendTransaction (tx) {
    throw new NotImplementedError('sendTransaction(tx)')
  }

  /**
   * Releases the transport's resources, erasing any key material it created.
   *
   * @returns {void}
   * @throws {NotImplementedError} An implementation must provide this method.
   */
  dispose () {
    throw new NotImplementedError('dispose()')
  }
}
