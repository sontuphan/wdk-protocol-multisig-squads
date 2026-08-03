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

import { describe, it, expect, jest } from '@jest/globals'

import { getBase64Decoder } from '@solana/codecs'

import {
  WalletAccountReadOnlyMultisigSolanaSquads,
  SQUADS_PROGRAM_ADDRESS
} from '@tetherto/wdk-protocol-multisig-squads'

const TEST_RPC_URL = 'https://mock-url.com'
const TEST_MULTISIG_PDA = 'EEPqJbpYrwqisgoPt3Vu74YBqRji8mFrRxQdARVfDuNG'
const SYSTEM_PROGRAM_ADDRESS = '11111111111111111111111111111111'

// The create key and the multisig address it derives to, cross-checked against
// `getMultisigPda` from @sqds/multisig.
const TEST_CREATE_KEY = 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS'
const TEST_DERIVED_PDA = '882sFcorKiAAx51q86HcH2Lr8m1WGmAAuuiRFaNX9PR2'

const toBase64 = (bytes) => getBase64Decoder().decode(Uint8Array.from(bytes))

const MULTISIG_DISCRIMINATOR = [224, 116, 121, 186, 68, 161, 79, 236]
// The discriminator of the Squads `ProgramConfig` account: a real account type
// owned by the same program, so it must not be mistaken for a multisig.
const PROGRAM_CONFIG_DISCRIMINATOR = [196, 210, 90, 231, 144, 149, 140, 63]

/**
 * Builds a read-only account whose RPC returns a fixed `getAccountInfo` result.
 *
 * @param {Object|null} value - The `value` field of the RPC response.
 * @param {Object} [config] - Extra config for the account.
 * @returns {{ account: WalletAccountReadOnlyMultisigSolanaSquads, getAccountInfo: Function }}
 */
function mockAccount (value, config = { multisigPda: TEST_MULTISIG_PDA }) {
  const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
    provider: TEST_RPC_URL,
    commitment: 'confirmed',
    ...config
  })

  const getAccountInfo = jest.fn(() => ({ send: async () => ({ value }) }))

  account._rpc = { getAccountInfo }

  return { account, getAccountInfo }
}

/**
 * Builds an account whose RPC rejects.
 *
 * @param {Error} error - The error to reject with.
 * @returns {WalletAccountReadOnlyMultisigSolanaSquads}
 */
function mockFailingAccount (error) {
  const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
    provider: TEST_RPC_URL,
    multisigPda: TEST_MULTISIG_PDA
  })

  account._rpc = {
    getAccountInfo: () => ({ send: async () => { throw error } })
  }

  return account
}

describe('WalletAccountReadOnlyMultisigSolanaSquads', () => {
  describe('isDeployed', () => {
    it('returns true for an existing Multisig account', async () => {
      const { account } = mockAccount({
        owner: SQUADS_PROGRAM_ADDRESS,
        data: [toBase64(MULTISIG_DISCRIMINATOR), 'base64'],
        executable: false,
        lamports: 1893120n,
        space: 144n
      })

      expect(await account.isDeployed()).toBe(true)
    })

    it('returns false when the account does not exist', async () => {
      const { account } = mockAccount(null)

      expect(await account.isDeployed()).toBe(false)
    })

    it('returns false for an address someone pre-funded with lamports', async () => {
      // A plain transfer to an uncreated address leaves a System-Program-owned
      // account with no data. A bare existence check would report this as
      // deployed.
      const { account } = mockAccount({
        owner: SYSTEM_PROGRAM_ADDRESS,
        data: ['', 'base64'],
        executable: false,
        lamports: 1n,
        space: 0n
      })

      expect(await account.isDeployed()).toBe(false)
    })

    it('returns false for a different Squads account type at the address', async () => {
      const { account } = mockAccount({
        owner: SQUADS_PROGRAM_ADDRESS,
        data: [toBase64(PROGRAM_CONFIG_DISCRIMINATOR), 'base64'],
        executable: false,
        lamports: 1893120n,
        space: 144n
      })

      expect(await account.isDeployed()).toBe(false)
    })

    it('returns false when the account is owned by another program', async () => {
      const { account } = mockAccount({
        owner: SYSTEM_PROGRAM_ADDRESS,
        data: [toBase64(MULTISIG_DISCRIMINATOR), 'base64'],
        executable: false,
        lamports: 1893120n,
        space: 144n
      })

      expect(await account.isDeployed()).toBe(false)
    })

    it('honours a programId override when checking ownership', async () => {
      const { account } = mockAccount(
        {
          owner: SQUADS_PROGRAM_ADDRESS,
          data: [toBase64(MULTISIG_DISCRIMINATOR), 'base64'],
          executable: false,
          lamports: 1893120n,
          space: 144n
        },
        { multisigPda: TEST_MULTISIG_PDA, programId: SYSTEM_PROGRAM_ADDRESS }
      )

      expect(await account.isDeployed()).toBe(false)
    })

    it('propagates RPC failures instead of reporting "not deployed"', async () => {
      const account = mockFailingAccount(new Error('503 Service Unavailable'))

      // Swallowing this into `false` would invite a caller to redeploy an
      // existing multisig.
      await expect(account.isDeployed()).rejects.toThrow('503 Service Unavailable')
    })

    it('requests only the 8-byte discriminator', async () => {
      const { account, getAccountInfo } = mockAccount(null)

      await account.isDeployed()

      expect(getAccountInfo).toHaveBeenCalledWith(
        TEST_MULTISIG_PDA,
        expect.objectContaining({
          commitment: 'confirmed',
          encoding: 'base64',
          dataSlice: { offset: 0, length: 8 }
        })
      )
    })
  })

  describe('address resolution', () => {
    it('uses the configured multisigPda as-is', async () => {
      const { account } = mockAccount(null)

      expect(await account.getAddress()).toBe(TEST_MULTISIG_PDA)
    })

    it('derives the address from createKey when no multisigPda is given', async () => {
      const { account } = mockAccount(null, { createKey: TEST_CREATE_KEY })

      expect(await account.getAddress()).toBe(TEST_DERIVED_PDA)
    })

    it('queries the derived address', async () => {
      const { account, getAccountInfo } = mockAccount(null, { createKey: TEST_CREATE_KEY })

      await account.isDeployed()

      expect(getAccountInfo).toHaveBeenCalledWith(TEST_DERIVED_PDA, expect.anything())
    })

    it('throws without hitting the RPC when nothing is configured', async () => {
      const { account, getAccountInfo } = mockAccount(null, {})

      await expect(account.isDeployed()).rejects.toThrow(/multisigPda.*createKey/)
      expect(getAccountInfo).not.toHaveBeenCalled()
    })
  })
})
