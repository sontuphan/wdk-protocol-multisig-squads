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

import { InvalidSignerError } from '@tetherto/wdk-wallet'

/** @typedef {import('./index.js').IMultisigCoordinator} IMultisigCoordinator */

/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */
/** @typedef {import('@tetherto/wdk-wallet-solana').WalletAccountSolana} WalletAccountSolana */

/**
 * The coordinator a Squads account uses when the configuration names none: the member signs with
 * the key derived from its own seed and broadcasts immediately. This is the only place in the
 * package that reaches a signer account to put a transaction on the cluster.
 *
 * @implements {IMultisigCoordinator}
 */
export default class LocalSignerCoordinator {
  /**
   * Creates a coordinator over a local signer account.
   *
   * @param {WalletAccountSolana} signerAccount - The member's signer account. It is not owned by the coordinator, which never erases its key.
   */
  constructor (signerAccount) {
    /**
     * The member's signer account.
     *
     * @protected
     * @type {WalletAccountSolana | undefined}
     */
    this._signerAccount = signerAccount
  }

  /**
   * Signs a transaction with the member's key and broadcasts it.
   *
   * @param {SolanaTransaction} tx - The unsigned transaction.
   * @returns {Promise<TransactionResult>} The transaction's signature and the fee it paid.
   * @throws {InvalidSignerError} The coordinator must not have been disposed.
   */
  async sendTransaction (tx) {
    if (!this._signerAccount) {
      throw new InvalidSignerError('The coordinator has been disposed.')
    }

    return this._signerAccount.sendTransaction(tx)
  }

  /**
   * Drops the reference to the signer account. The account that created it erases its key.
   *
   * @returns {void}
   */
  dispose () {
    this._signerAccount = undefined
  }
}
