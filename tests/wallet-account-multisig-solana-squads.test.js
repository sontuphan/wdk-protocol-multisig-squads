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

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

import { getBase58Encoder, getBase64Decoder } from '@solana/codecs'

import WalletManagerMultisigSolanaSquads, {
  WalletAccountReadOnlyMultisigSolanaSquads,
  SQUADS_PROGRAM_ADDRESS,
  NotSupportedError
} from '@tetherto/wdk-protocol-multisig-squads'

const TEST_SEED_PHRASE =
  'test walk nut penalty hip pave soap entry language right filter choice'
const TEST_RPC_URL = 'https://mock-url.com'
const TEST_MULTISIG_PDA = '11111111111111111111111111111111'

// The member key `getAccount(0)` derives from TEST_SEED_PHRASE.
const TEST_SIGNER = '3uXqWpwgqKVdiHAwF6Vmu4G4vdQzpR66xjPkz1G7zMKE'
const OTHER_MEMBER = '2JvLzXomThTBMSj2YQY3wE21kiaSpwGyJ17nm9xiLMsE'

const MULTISIG_DISCRIMINATOR = [224, 116, 121, 186, 68, 161, 79, 236]

/**
 * Serves a `Multisig` account holding the given members, so membership checks can run
 * without a network. Only the fields those checks read are populated.
 *
 * @param {Array<{ address: string, mask?: number }>|null} members - The members, or null
 *   to report the multisig as absent.
 * @returns {Function} A `getAccountInfo` mock.
 */
function serveMultisig (members) {
  if (!members) {
    return jest.fn(() => ({ send: async () => ({ value: null }) }))
  }

  const data = new Uint8Array(95 + 1 + 4 + members.length * 33)
  const view = new DataView(data.buffer)

  data.set(MULTISIG_DISCRIMINATOR, 0)
  view.setUint16(72, 1, true)

  let offset = 96

  view.setUint32(offset, members.length, true)
  offset += 4

  for (const { address, mask = 7 } of members) {
    data.set(getBase58Encoder().encode(address), offset)
    data[offset + 32] = mask
    offset += 33
  }

  return jest.fn(() => ({
    send: async () => ({
      value: {
        owner: SQUADS_PROGRAM_ADDRESS,
        data: [getBase64Decoder().decode(data), 'base64'],
        executable: false,
        lamports: 2039280n,
        space: BigInt(data.length)
      }
    })
  }))
}

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

  it('throws NotSupportedError for message proposals', async () => {
    // Not pending work: Squads cannot produce a multisig signature at all.
    await expect(account.proposeMessage('hello')).rejects.toThrow(NotSupportedError)
    await expect(account.approveMessage('abc')).rejects.toThrow(NotSupportedError)
  })

  it('separates unsupported message proposals from unimplemented writes', async () => {
    await expect(account.deploy()).rejects.not.toThrow(NotSupportedError)
  })

  describe('validateSignerIsOwner', () => {
    it('resolves when the signer is a member', async () => {
      account._rpc = { getAccountInfo: serveMultisig([{ address: TEST_SIGNER }]) }

      await expect(account.validateSignerIsOwner()).resolves.toBeUndefined()
    })

    it('resolves for a member found alongside others', async () => {
      account._rpc = {
        getAccountInfo: serveMultisig([
          { address: OTHER_MEMBER },
          { address: TEST_SIGNER }
        ])
      }

      await expect(account.validateSignerIsOwner()).resolves.toBeUndefined()
    })

    it('throws naming both the signer and the multisig when not a member', async () => {
      account._rpc = { getAccountInfo: serveMultisig([{ address: OTHER_MEMBER }]) }

      const error = await account.validateSignerIsOwner().catch((e) => e)

      expect(error.message).toContain(TEST_SIGNER)
      expect(error.message).toContain(TEST_MULTISIG_PDA)
    })

    it('resolves for a member holding no permissions', async () => {
      // Mask 0 is a member who can do nothing. This method checks membership only, so it
      // passes — delete this test if it ever becomes permission-aware.
      account._rpc = { getAccountInfo: serveMultisig([{ address: TEST_SIGNER, mask: 0 }]) }

      await expect(account.validateSignerIsOwner()).resolves.toBeUndefined()
    })

    it('throws when the multisig does not exist', async () => {
      account._rpc = { getAccountInfo: serveMultisig(null) }

      await expect(account.validateSignerIsOwner()).rejects.toThrow(/does not exist/)
    })

    it('distinguishes a missing signer from a non-member', async () => {
      const readOnly = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      readOnly._rpc = { getAccountInfo: serveMultisig([{ address: OTHER_MEMBER }]) }

      // A read-only account has no signer, so borrow the signing implementation.
      await expect(
        account.validateSignerIsOwner.call(readOnly)
      ).rejects.toThrow(/No signer/)
    })

    it('reads the multisig once', async () => {
      const getAccountInfo = serveMultisig([{ address: TEST_SIGNER }])
      account._rpc = { getAccountInfo }

      await account.validateSignerIsOwner()

      expect(getAccountInfo).toHaveBeenCalledTimes(1)
    })

    it('propagates RPC failures', async () => {
      account._rpc = {
        getAccountInfo: () => ({
          send: async () => { throw new Error('503 Service Unavailable') }
        })
      }

      await expect(account.validateSignerIsOwner()).rejects.toThrow('503 Service Unavailable')
    })
  })

  it('still signs with the member key', async () => {
    // sign() is the one message operation that works — one member's consent.
    const signature = await account.sign('hello')

    expect(typeof signature).toBe('string')
    expect(signature.length).toBeGreaterThan(0)
  })
})
