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
  WalletAccountReadOnlyMultisigSolanaSquads
} from '@tetherto/wdk-protocol-multisig-squads'

const TEST_SEED_PHRASE =
  'test walk nut penalty hip pave soap entry language right filter choice'
const TEST_RPC_URL = 'https://mock-url.com'
const TEST_MULTISIG_PDA = '11111111111111111111111111111111'

describe('WalletAccountMultisigSolanaSquads', () => {
  let wallet
  let account

  beforeEach(async () => {
    wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
      provider: TEST_RPC_URL,
      commitment: 'confirmed',
      multisigPda: TEST_MULTISIG_PDA
    })
    account = await wallet.getAccount(0)
  })

  it('exposes the configured multisig address', async () => {
    expect(await account.getAddress()).toBe(TEST_MULTISIG_PDA)
  })

  it('exposes the signer address', async () => {
    const signerAddress = await account.getSignerAddress()

    expect(typeof signerAddress).toBe('string')
    expect(signerAddress.length).toBeGreaterThan(0)
  })

  it('returns a read-only view', () => {
    const readOnly = account.toReadOnlyAccount()

    expect(readOnly).toBeInstanceOf(WalletAccountReadOnlyMultisigSolanaSquads)
  })

  it('throws NotImplementedError for unimplemented write methods', async () => {
    await expect(account.deploy()).rejects.toThrow()
    await expect(account.approveTx(1)).rejects.toThrow()
    await expect(account.executeTx(1)).rejects.toThrow()
  })
})
