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

import { access } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

import WalletManagerMultisigSolanaSquads, {
  WalletAccountMultisigSolanaSquads
} from '@tetherto/wdk-protocol-multisig-squads'

/**
 * Where `@tetherto/wdk-wallet-solana-gasless` lives. It is not a dependency of this package, so
 * the suite loads it from a sibling checkout, overridable for anyone whose layout differs.
 */
export const GASLESS_PACKAGE_PATH = process.env.WDK_WALLET_SOLANA_GASLESS_PATH ??
  fileURLToPath(new URL('../../../../wdk-wallet-solana-gasless/index.js', import.meta.url))

/** @returns {Promise<boolean>} */
export async function isGaslessPackageAvailable () {
  try {
    await access(GASLESS_PACKAGE_PATH)
    return true
  } catch {
    return false
  }
}

/** @returns {Promise<object>} The gasless package's module namespace. */
export async function loadGaslessPackage () {
  return await import(pathToFileURL(GASLESS_PACKAGE_PATH).href)
}

/**
 * Builds a Squads multisig account class whose underlying signer is a gasless account rather
 * than the plain `WalletAccountSolana` the constructor installs. This is the only seam the two
 * packages offer each other: the multisig account routes every write through
 * `this._signerAccount.sendTransaction({ instructions })`, and the gasless account answers that
 * same call, so replacing the field after `super()` is what "using them together" amounts to.
 *
 * @returns {Promise<{ Account: typeof WalletAccountMultisigSolanaSquads, Manager: typeof WalletManagerMultisigSolanaSquads }>}
 */
export async function createGaslessMultisig () {
  const { WalletAccountSolanaGasless } = await loadGaslessPackage()

  class WalletAccountMultisigSolanaSquadsGasless extends WalletAccountMultisigSolanaSquads {
    constructor (seed, path, config) {
      super(seed, path, config)

      this._signerAccount = new WalletAccountSolanaGasless(seed, path, config)
    }
  }

  class WalletManagerMultisigSolanaSquadsGasless extends WalletManagerMultisigSolanaSquads {
    async getAccountByPath (path) {
      if (!this._accounts[path]) {
        this._accounts[path] = new WalletAccountMultisigSolanaSquadsGasless(
          this.seed,
          path,
          this._config
        )
      }

      return this._accounts[path]
    }
  }

  return {
    Account: WalletAccountMultisigSolanaSquadsGasless,
    Manager: WalletManagerMultisigSolanaSquadsGasless
  }
}
