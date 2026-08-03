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

import { getBase58Encoder, getBase64Decoder, getBase64Encoder } from '@solana/codecs'

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

// Members are stored sorted by raw pubkey bytes, which is *not* base58-string
// order. These two are deliberately chosen so the two orders disagree: MEMBER_A
// starts with byte 6 and MEMBER_B with byte 19, so this is on-chain order — but
// as strings '2Jv…' sorts before 'QqC…', so a naive sort would swap them.
const MEMBER_A = 'QqCCvshxtqMAL2CVALqiJB7uEeE8mjSPsFUruTpXtRz'
const MEMBER_B = '2JvLzXomThTBMSj2YQY3wE21kiaSpwGyJ17nm9xiLMsE'
const MEMBER_C = 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS'

/**
 * Serializes a `Multisig` account's data, per the layout in docs/getOwners.md.
 *
 * @param {Object} options - The account contents.
 * @param {Array<{ address: string, mask?: number }>} options.members - The members.
 * @param {boolean} [options.rentCollector=false] - Whether `rentCollector` is set.
 * @param {number} [options.threshold=1] - The approval threshold.
 * @param {bigint} [options.transactionIndex=0n] - The index of the latest transaction.
 * @param {number[]} [options.discriminator] - An override for the discriminator.
 * @param {number} [options.slack=0] - Trailing unused bytes, as Squads pre-allocates.
 * @returns {string} The account data, base64-encoded.
 */
function encodeMultisigAccount ({
  members,
  rentCollector = false,
  threshold = 1,
  transactionIndex = 0n,
  discriminator = MULTISIG_DISCRIMINATOR,
  slack = 0
}) {
  const size = 95 + (rentCollector ? 32 : 0) + 1 + 4 + members.length * 33 + slack
  const data = new Uint8Array(size)
  const view = new DataView(data.buffer)

  data.set(discriminator, 0)
  view.setUint16(72, threshold, true)
  view.setBigUint64(78, transactionIndex, true)

  let offset = 94

  // `rentCollector`: a 1-byte Option tag, then the pubkey only when set.
  data[offset] = rentCollector ? 1 : 0
  offset += 1
  if (rentCollector) {
    data.set(getBase58Encoder().encode(MEMBER_C), offset)
    offset += 32
  }

  data[offset] = 255 // bump
  offset += 1

  view.setUint32(offset, members.length, true)
  offset += 4

  for (const { address: memberAddress, mask = 7 } of members) {
    data.set(getBase58Encoder().encode(memberAddress), offset)
    data[offset + 32] = mask
    offset += 33
  }

  return getBase64Decoder().decode(data)
}

/**
 * Builds an RPC `value` for a `Multisig` account owned by the Squads program.
 *
 * @param {Object} options - Passed through to {@link encodeMultisigAccount}.
 * @returns {Object} The `value` field of a `getAccountInfo` response.
 */
function multisigAccountValue (options) {
  return {
    owner: SQUADS_PROGRAM_ADDRESS,
    data: [encodeMultisigAccount(options), 'base64'],
    executable: false,
    lamports: 2039280n,
    space: 165n
  }
}

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

  describe('getOwners', () => {
    it('returns the member addresses', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }, { address: MEMBER_B }]
      }))

      expect(await account.getOwners()).toEqual([MEMBER_A, MEMBER_B])
    })

    it('returns the same members when rentCollector is set', async () => {
      // `rentCollector` shifts every following field by 32 bytes, so a decoder
      // that ignores the Option tag reads garbage for exactly this case.
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }, { address: MEMBER_B }],
        rentCollector: true
      }))

      expect(await account.getOwners()).toEqual([MEMBER_A, MEMBER_B])
    })

    it('includes members that cannot vote', async () => {
      // Mask 5 is proposer + executor with no voter bit. Filtering such members
      // out would make them unreachable from removeOwner().
      const { account } = mockAccount(multisigAccountValue({
        members: [
          { address: MEMBER_A, mask: 5 },
          { address: MEMBER_B, mask: 2 },
          { address: MEMBER_C, mask: 7 }
        ]
      }))

      expect(await account.getOwners()).toEqual([MEMBER_A, MEMBER_B, MEMBER_C])
    })

    it('ignores the space Squads pre-allocates for future members', async () => {
      // Room for 9 more members, as seen on mainnet. Reading to the end of the
      // data would emit 9 phantom members with all-zero addresses.
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        slack: 9 * 33
      }))

      expect(await account.getOwners()).toEqual([MEMBER_A])
    })

    it('preserves on-chain order rather than base58 order', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }, { address: MEMBER_B }]
      }))

      const owners = await account.getOwners()

      expect(owners).toEqual([MEMBER_A, MEMBER_B])
      expect(owners).not.toEqual([...owners].sort())
    })

    it('delegates to getMultisigInfo with a single account read', async () => {
      const { account, getAccountInfo } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }]
      }))

      await account.getOwners()

      expect(getAccountInfo).toHaveBeenCalledTimes(1)
      expect(getAccountInfo).toHaveBeenCalledWith(
        TEST_MULTISIG_PDA,
        expect.not.objectContaining({ dataSlice: expect.anything() })
      )
    })

    it('throws when the multisig does not exist', async () => {
      const { account } = mockAccount(null)

      // Returning [] would be a valid-looking answer that means something false.
      await expect(account.getOwners()).rejects.toThrow(/does not exist/)
    })

    it('throws rather than decoding another Squads account type', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        discriminator: PROGRAM_CONFIG_DISCRIMINATOR
      }))

      await expect(account.getOwners()).rejects.toThrow(/not a Squads multisig/)
    })

    it('throws when the account is owned by another program', async () => {
      const { account } = mockAccount({
        ...multisigAccountValue({ members: [{ address: MEMBER_A }] }),
        owner: SYSTEM_PROGRAM_ADDRESS
      })

      await expect(account.getOwners()).rejects.toThrow(/not a Squads multisig/)
    })

    it('propagates RPC failures', async () => {
      const account = mockFailingAccount(new Error('503 Service Unavailable'))

      await expect(account.getOwners()).rejects.toThrow('503 Service Unavailable')
    })
  })

  describe('getMultisigInfo', () => {
    it('returns address, owners, threshold and isCreated from one read', async () => {
      const { account, getAccountInfo } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }, { address: MEMBER_B }],
        threshold: 2
      }))

      expect(await account.getMultisigInfo()).toEqual({
        address: TEST_MULTISIG_PDA,
        owners: [MEMBER_A, MEMBER_B],
        threshold: 2,
        isCreated: true
      })
      expect(getAccountInfo).toHaveBeenCalledTimes(1)
    })

    it('decodes correctly when rentCollector is set', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }, { address: MEMBER_B }],
        threshold: 2,
        rentCollector: true
      }))

      expect(await account.getMultisigInfo()).toEqual({
        address: TEST_MULTISIG_PDA,
        owners: [MEMBER_A, MEMBER_B],
        threshold: 2,
        isCreated: true
      })
    })

    it('includes members that cannot vote', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [
          { address: MEMBER_A, mask: 6 },
          { address: MEMBER_B, mask: 5 }
        ],
        threshold: 1
      }))

      const { owners, threshold } = await account.getMultisigInfo()

      expect(owners).toEqual([MEMBER_A, MEMBER_B])
      // 2 owners but only 1 voter, so this is a 1-of-1 despite owners.length === 2.
      expect(threshold).toBe(1)
    })

    it('ignores pre-allocated slack', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        slack: 9 * 33
      }))

      expect((await account.getMultisigInfo()).owners).toEqual([MEMBER_A])
    })

    it('reports isCreated false without throwing when the account is missing', async () => {
      const { account } = mockAccount(null)

      expect(await account.getMultisigInfo()).toEqual({
        address: TEST_MULTISIG_PDA,
        owners: [],
        threshold: 0,
        isCreated: false
      })
    })

    it('sets isCreated explicitly rather than leaving it undefined', async () => {
      // `undefined` is falsy, so an omitted flag would make a real multisig read
      // as absent to `if (!info.isCreated)`.
      const { account: missing } = mockAccount(null)
      const { account: present } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }]
      }))

      expect(Object.keys(await missing.getMultisigInfo())).toContain('isCreated')
      expect((await missing.getMultisigInfo()).isCreated).toBe(false)
      expect((await present.getMultisigInfo()).isCreated).toBe(true)
    })

    it('throws rather than reporting isCreated false for another account type', async () => {
      // isCreated false invites a caller to deploy; the address is already taken.
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        discriminator: PROGRAM_CONFIG_DISCRIMINATOR
      }))

      await expect(account.getMultisigInfo()).rejects.toThrow(/not a Squads multisig/)
    })

    it('throws when the account is owned by another program', async () => {
      const { account } = mockAccount({
        ...multisigAccountValue({ members: [{ address: MEMBER_A }] }),
        owner: SYSTEM_PROGRAM_ADDRESS
      })

      await expect(account.getMultisigInfo()).rejects.toThrow(/not a Squads multisig/)
    })

    it('propagates RPC failures', async () => {
      const account = mockFailingAccount(new Error('503 Service Unavailable'))

      await expect(account.getMultisigInfo()).rejects.toThrow('503 Service Unavailable')
    })

    it('reports the derived address when only a createKey is configured', async () => {
      const { account } = mockAccount(
        multisigAccountValue({ members: [{ address: MEMBER_A }] }),
        { createKey: TEST_CREATE_KEY }
      )

      expect((await account.getMultisigInfo()).address).toBe(TEST_DERIVED_PDA)
    })
  })

  describe('getThreshold', () => {
    it('returns the threshold', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }, { address: MEMBER_B }],
        threshold: 2
      }))

      expect(await account.getThreshold()).toBe(2)
    })

    it('returns a threshold of 1', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        threshold: 1
      }))

      expect(await account.getThreshold()).toBe(1)
    })

    it('reads the full u16 range', async () => {
      // Catches a getUint8, or a signed read that would report -1.
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        threshold: 65535
      }))

      expect(await account.getThreshold()).toBe(65535)
    })

    it('is unaffected by rentCollector being set', async () => {
      // `threshold` sits at offset 72, before the optional `rentCollector` at 94,
      // so its offset is fixed. This fails if the method ever borrows
      // getOwners()'s offset walk.
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }, { address: MEMBER_B }],
        threshold: 2,
        rentCollector: true
      }))

      expect(await account.getThreshold()).toBe(2)
    })

    it('reports the raw threshold even when some members cannot vote', async () => {
      // Masks 6 and 5: only the first holds the voter bit, so this is a 1-of-1
      // despite having 2 members. The threshold is still 1.
      const { account } = mockAccount(multisigAccountValue({
        members: [
          { address: MEMBER_A, mask: 6 },
          { address: MEMBER_B, mask: 5 }
        ],
        threshold: 1
      }))

      expect(await account.getThreshold()).toBe(1)
    })

    it('delegates to getMultisigInfo with a single account read', async () => {
      const { account, getAccountInfo } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        threshold: 1
      }))

      await account.getThreshold()

      expect(getAccountInfo).toHaveBeenCalledTimes(1)
      expect(getAccountInfo).toHaveBeenCalledWith(
        TEST_MULTISIG_PDA,
        expect.not.objectContaining({ dataSlice: expect.anything() })
      )
    })

    it('throws when the multisig does not exist', async () => {
      const { account } = mockAccount(null)

      // Returning 0 would read as "no approvals required".
      await expect(account.getThreshold()).rejects.toThrow(/does not exist/)
    })

    it('throws rather than decoding another Squads account type', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        discriminator: PROGRAM_CONFIG_DISCRIMINATOR
      }))

      await expect(account.getThreshold()).rejects.toThrow(/not a Squads multisig/)
    })

    it('throws when the account is owned by another program', async () => {
      const { account } = mockAccount({
        ...multisigAccountValue({ members: [{ address: MEMBER_A }] }),
        owner: SYSTEM_PROGRAM_ADDRESS
      })

      await expect(account.getThreshold()).rejects.toThrow(/not a Squads multisig/)
    })

    it('propagates RPC failures', async () => {
      const account = mockFailingAccount(new Error('503 Service Unavailable'))

      await expect(account.getThreshold()).rejects.toThrow('503 Service Unavailable')
    })
  })

  describe('getNonce', () => {
    it('returns the transaction index as a bigint', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        transactionIndex: 238n
      }))

      const nonce = await account.getNonce()

      expect(nonce).toBe(238n)
      expect(typeof nonce).toBe('bigint')
    })

    it('returns 0n for a multisig with no transactions yet', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        transactionIndex: 0n
      }))

      expect(await account.getNonce()).toBe(0n)
    })

    it('preserves values beyond Number.MAX_SAFE_INTEGER', async () => {
      // The field is a u64, so it cannot be narrowed to a JS number without
      // silently losing precision at the top of the range.
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        transactionIndex: 18446744073709551615n
      }))

      expect(await account.getNonce()).toBe(18446744073709551615n)
    })

    it('is unaffected by rentCollector being set', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        transactionIndex: 7n,
        rentCollector: true
      }))

      expect(await account.getNonce()).toBe(7n)
    })

    it('does not confuse the threshold with the transaction index', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }, { address: MEMBER_B }],
        threshold: 2,
        transactionIndex: 9n
      }))

      expect(await account.getNonce()).toBe(9n)
      expect(await account.getThreshold()).toBe(2)
    })

    it('decodes a response truncated to the requested 86 bytes', async () => {
      const full = encodeMultisigAccount({
        members: [{ address: MEMBER_A }],
        transactionIndex: 238n
      })
      const truncated = getBase64Decoder().decode(
        getBase64Encoder().encode(full).subarray(0, 86)
      )

      const { account } = mockAccount({
        owner: SQUADS_PROGRAM_ADDRESS,
        data: [truncated, 'base64'],
        executable: false,
        lamports: 2039280n,
        space: 165n
      })

      expect(await account.getNonce()).toBe(238n)
    })

    it('reads only the bytes up to the transaction index field', async () => {
      const { account, getAccountInfo } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }]
      }))

      await account.getNonce()

      expect(getAccountInfo).toHaveBeenCalledWith(
        TEST_MULTISIG_PDA,
        expect.objectContaining({ dataSlice: { offset: 0, length: 86 } })
      )
    })

    it('throws when the multisig does not exist', async () => {
      const { account } = mockAccount(null)

      // Returning 0n would claim the multisig exists with no transactions.
      await expect(account.getNonce()).rejects.toThrow(/does not exist/)
    })

    it('throws rather than decoding another Squads account type', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }],
        discriminator: PROGRAM_CONFIG_DISCRIMINATOR
      }))

      await expect(account.getNonce()).rejects.toThrow(/not a Squads multisig/)
    })

    it('throws when the account is owned by another program', async () => {
      const { account } = mockAccount({
        ...multisigAccountValue({ members: [{ address: MEMBER_A }] }),
        owner: SYSTEM_PROGRAM_ADDRESS
      })

      await expect(account.getNonce()).rejects.toThrow(/not a Squads multisig/)
    })

    it('propagates RPC failures', async () => {
      const account = mockFailingAccount(new Error('503 Service Unavailable'))

      await expect(account.getNonce()).rejects.toThrow('503 Service Unavailable')
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
