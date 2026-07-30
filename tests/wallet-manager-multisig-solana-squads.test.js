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

import { describe, it, expect, beforeEach } from '@jest/globals'

import WalletManagerMultisigSolanaSquads, {
  WalletAccountMultisigSolanaSquads
} from '@tetherto/wdk-protocol-multisig-squads'

const TEST_SEED_PHRASE =
  'test walk nut penalty hip pave soap entry language right filter choice'
const TEST_RPC_URL = 'https://mock-url.com'

describe('WalletManagerMultisigSolanaSquads', () => {
  let wallet

  beforeEach(() => {
    wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
      provider: TEST_RPC_URL,
      commitment: 'confirmed'
    })
  })

  it('derives a multisig account at the default index', async () => {
    const account = await wallet.getAccount(0)

    expect(account).toBeInstanceOf(WalletAccountMultisigSolanaSquads)
  })

  it('caches accounts by derivation path', async () => {
    const a = await wallet.getAccountByPath("0'/0'")
    const b = await wallet.getAccountByPath("0'/0'")

    expect(a).toBe(b)
  })
})
