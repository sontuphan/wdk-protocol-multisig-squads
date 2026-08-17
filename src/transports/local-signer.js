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

import ISquadsTransactionTransport from './squads-transaction-transport-interface.js'

/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */
/** @typedef {import('@tetherto/wdk-wallet-solana').WalletAccountSolana} WalletAccountSolana */

/**
 * The transport a Squads account uses when the configuration names none: the member signs with
 * the key derived from its own seed and broadcasts immediately. This is the only place in the
 * package that reaches a signer account to put a transaction on the cluster.
 *
 * @implements {ISquadsTransactionTransport}
 */
export default class LocalSignerTransport extends ISquadsTransactionTransport {
  /**
   * Creates a transport over a local signer account.
   *
   * @param {WalletAccountSolana} signerAccount - The member's signer account. It is not owned by the transport, which never erases its key.
   */
  constructor (signerAccount) {
    super()

    /**
     * The member's signer account.
     *
     * @protected
     * @type {WalletAccountSolana | null}
     */
    this._signerAccount = signerAccount
  }

  /**
   * Signs a transaction with the member's key and broadcasts it.
   *
   * @param {SolanaTransaction} tx - The unsigned transaction.
   * @returns {Promise<TransactionResult>} The transaction's signature and the fee it paid.
   * @throws {Error} The transport must not have been disposed.
   */
  async sendTransaction (tx) {
    return this._requireSignerAccount().sendTransaction(tx)
  }

  /**
   * Drops the reference to the signer account. The account that created it erases its key.
   */
  dispose () {
    this._signerAccount = null
  }

  /**
   * Returns the signer account, refusing to work once the transport has been disposed.
   *
   * @protected
   * @returns {WalletAccountSolana} The member's signer account.
   * @throws {Error} The transport must not have been disposed.
   */
  _requireSignerAccount () {
    if (!this._signerAccount) {
      throw new Error('The transport has been disposed.')
    }

    return this._signerAccount
  }
}
