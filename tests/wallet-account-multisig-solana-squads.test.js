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

import { getBase58Decoder, getBase58Encoder, getBase64Decoder } from '@solana/codecs'

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
const THIRD_MEMBER = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const MULTISIG_DISCRIMINATOR = [224, 116, 121, 186, 68, 161, 79, 236]

// Program-derived, so identical on every cluster.
const PROGRAM_CONFIG_PDA = 'BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr'

/**
 * Serves a `Multisig` account holding the given members, so membership checks can run
 * without a network. Only the fields those checks read are populated.
 *
 * @param {Array<{ address: string, mask?: number }>|null} members - The members, or null
 *   to report the multisig as absent.
 * @returns {Function} A `getAccountInfo` mock.
 */
function multisigAccountValue (members) {
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

  return {
    owner: SQUADS_PROGRAM_ADDRESS,
    data: [getBase64Decoder().decode(data), 'base64'],
    executable: false,
    lamports: 2039280n,
    space: BigInt(data.length)
  }
}

/**
 * Wraps account values in a `getAccountInfo` mock.
 *
 * @param {Object|null} value - The value every query resolves to.
 * @returns {Function} A `getAccountInfo` mock.
 */
function serveAccount (value) {
  return jest.fn(() => ({ send: async () => ({ value }) }))
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
    await expect(account.sendTransaction({ to: TEST_SIGNER, value: 1n })).rejects.toThrow()
    await expect(account.approveTx(1)).rejects.toThrow()
    await expect(account.executeTx(1)).rejects.toThrow()
  })

  it('throws NotSupportedError for message proposals', async () => {
    // Not pending work: Squads cannot produce a multisig signature at all.
    await expect(account.proposeMessage('hello')).rejects.toThrow(NotSupportedError)
    await expect(account.approveMessage('abc')).rejects.toThrow(NotSupportedError)
  })

  it('separates unsupported message proposals from unimplemented writes', async () => {
    await expect(account.approveTx(1)).rejects.not.toThrow(NotSupportedError)
  })

  describe('deploy', () => {
    // A fixed 32-byte create key secret, so the derived multisig address is stable.
    const CREATE_KEY_SECRET = getBase58Decoder().decode(new Uint8Array(32).fill(9))

    /**
     * Builds a deploying account whose RPC and send are stubbed.
     *
     * @param {Object} [options] - The scenario.
     * @param {boolean} [options.deployed=false] - Whether the multisig already exists.
     * @param {Object} [options.config] - Extra configuration.
     * @returns {Promise<{ account: Object, sendTransaction: Function }>}
     */
    async function deployingAccount ({ deployed = false, config = {} } = {}) {
      const wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
        provider: TEST_RPC_URL,
        createKeySecret: CREATE_KEY_SECRET,
        ...config
      })
      const account = await wallet.getAccount(0)

      // ProgramConfig: discriminator(8) authority(32) creationFee(u64) treasury(32) reserved(64)
      const programConfig = new Uint8Array(144)
      programConfig.set([196, 210, 90, 231, 144, 149, 140, 63], 0)
      programConfig.set(getBase58Encoder().encode(OTHER_MEMBER), 48)

      const programConfigValue = {
        owner: SQUADS_PROGRAM_ADDRESS,
        data: [getBase64Decoder().decode(programConfig), 'base64'],
        executable: false,
        lamports: 1893120n,
        space: 144n
      }

      const multisigValue = deployed ? multisigAccountValue([{ address: TEST_SIGNER }]) : null

      account._rpc = {
        getAccountInfo: jest.fn((queried) => ({
          send: async () => ({
            value: queried === PROGRAM_CONFIG_PDA ? programConfigValue : multisigValue
          })
        })),
        getMinimumBalanceForRentExemption: jest.fn(() => ({ send: async () => 2039280n }))
      }

      const sendTransaction = jest.fn(async () => ({ hash: 'deadbeef', fee: 5000n }))
      account._signerAccount.sendTransaction = sendTransaction

      return { account, sendTransaction }
    }

    it('builds instruction data byte-identical to the Squads SDK', async () => {
      // Golden bytes captured from `multisigCreateV2Struct.serialize` in @sqds/multisig,
      // which is the arbiter of the wire format. The SDK cannot be imported here — it
      // pulls in @solana/web3.js, whose rpc-websockets dependency will not load under
      // Jest — so regenerate these with scripts/verify-create-wire-format.mjs.
      const golden = {
        1: [50, 221, 199, 93, 40, 245, 139, 233, 0, 1, 0, 1, 0, 0, 0, 43, 44, 113, 92, 44, 242, 77, 181, 126, 149, 164, 77, 243, 76, 180, 36, 222, 36, 96, 232, 108, 79, 110, 190, 123, 166, 43, 87, 72, 48, 222, 25, 7, 0, 0, 0, 0, 0, 0],
        2: [50, 221, 199, 93, 40, 245, 139, 233, 0, 2, 0, 2, 0, 0, 0, 43, 44, 113, 92, 44, 242, 77, 181, 126, 149, 164, 77, 243, 76, 180, 36, 222, 36, 96, 232, 108, 79, 110, 190, 123, 166, 43, 87, 72, 48, 222, 25, 7, 19, 114, 224, 177, 185, 215, 69, 96, 71, 110, 69, 181, 226, 111, 65, 68, 88, 184, 197, 87, 145, 132, 122, 168, 70, 192, 211, 64, 7, 73, 17, 25, 7, 0, 0, 0, 0, 0, 0],
        3: [50, 221, 199, 93, 40, 245, 139, 233, 0, 2, 0, 3, 0, 0, 0, 43, 44, 113, 92, 44, 242, 77, 181, 126, 149, 164, 77, 243, 76, 180, 36, 222, 36, 96, 232, 108, 79, 110, 190, 123, 166, 43, 87, 72, 48, 222, 25, 7, 19, 114, 224, 177, 185, 215, 69, 96, 71, 110, 69, 181, 226, 111, 65, 68, 88, 184, 197, 87, 145, 132, 122, 168, 70, 192, 211, 64, 7, 73, 17, 25, 7, 198, 250, 122, 243, 190, 219, 173, 58, 61, 101, 243, 106, 171, 201, 116, 49, 177, 187, 228, 194, 210, 246, 224, 228, 124, 166, 2, 3, 69, 47, 93, 97, 7, 0, 0, 0, 0, 0, 0]
      }

      const { account } = await deployingAccount()

      for (const [owners, threshold] of [
        [[TEST_SIGNER], 1],
        [[TEST_SIGNER, OTHER_MEMBER], 2],
        [[TEST_SIGNER, OTHER_MEMBER, THIRD_MEMBER], 2]
      ]) {
        const mine = account._encodeMultisigCreateV2Data(owners, threshold)

        expect(Array.from(mine)).toEqual(golden[owners.length])
      }
    })

    it('sizes the instruction data as 21 + 33 per owner', async () => {
      const { account } = await deployingAccount()

      expect(account._encodeMultisigCreateV2Data([TEST_SIGNER], 1)).toHaveLength(54)
      expect(account._encodeMultisigCreateV2Data([TEST_SIGNER, OTHER_MEMBER], 2)).toHaveLength(87)
    })

    it('sends six accounts with createKey and creator as signers', async () => {
      const { account, sendTransaction } = await deployingAccount()

      await account.deploy()

      const [{ instructions }] = sendTransaction.mock.calls[0]
      const [instruction] = instructions

      expect(instruction.accounts).toHaveLength(6)
      expect(instruction.accounts.map((a) => a.role)).toEqual([0, 1, 1, 2, 3, 0])
      // The createKey must carry a signer so kit signs with it.
      expect(instruction.accounts[3].signer).toBeDefined()
      expect(instruction.accounts[4].address).toBe(TEST_SIGNER)
      expect(instruction.programAddress).toBe(SQUADS_PROGRAM_ADDRESS)
    })

    it('defaults to the signer alone with threshold 1', async () => {
      const { account, sendTransaction } = await deployingAccount()

      await account.deploy()

      const [{ instructions }] = sendTransaction.mock.calls[0]
      const data = instructions[0].data

      expect(data).toHaveLength(54)
      // threshold u16 at offset 9, member count u32 at 11
      expect(new DataView(data.buffer).getUint16(9, true)).toBe(1)
      expect(new DataView(data.buffer).getUint32(11, true)).toBe(1)
    })

    it('returns the transaction hash', async () => {
      const { account } = await deployingAccount()

      expect(await account.deploy()).toEqual({ hash: 'deadbeef' })
    })

    it('resolves the multisig address from createKeySecret alone', async () => {
      const { account } = await deployingAccount()

      // No multisigPda and no createKey configured — only the secret.
      await expect(account.getAddress()).resolves.toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    })

    it('throws without a createKeySecret', async () => {
      const wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      const account = await wallet.getAccount(0)

      await expect(account.deploy()).rejects.toThrow(/createKeySecret. is required/)
    })

    it('throws when the multisig already exists', async () => {
      const { account, sendTransaction } = await deployingAccount({ deployed: true })

      await expect(account.deploy()).rejects.toThrow(/already exists/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('rejects invalid owners and thresholds without sending', async () => {
      const { account, sendTransaction } = await deployingAccount()

      await expect(account.deploy([], 1)).rejects.toThrow(/At least one owner/)
      await expect(account.deploy([TEST_SIGNER, TEST_SIGNER], 1)).rejects.toThrow(/must be unique/)
      await expect(account.deploy([TEST_SIGNER], 0)).rejects.toThrow(/Invalid threshold/)
      await expect(account.deploy([TEST_SIGNER], 2)).rejects.toThrow(/Invalid threshold/)
      await expect(account.deploy(['nope'], 1)).rejects.toThrow()
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('refuses when the quote exceeds createMaxFee', async () => {
      const { account, sendTransaction } = await deployingAccount({
        config: { createMaxFee: 1000n }
      })

      await expect(account.deploy()).rejects.toThrow(/maximum fee/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws when a configured multisigPda does not match the createKeySecret', async () => {
      const { account } = await deployingAccount({
        config: { multisigPda: TEST_MULTISIG_PDA }
      })

      await expect(account.deploy()).rejects.toThrow(/does not derive from/)
    })
  })

  describe('validateSignerIsOwner', () => {
    it('resolves when the signer is a member', async () => {
      account._rpc = { getAccountInfo: serveAccount(multisigAccountValue([{ address: TEST_SIGNER }])) }

      await expect(account.validateSignerIsOwner()).resolves.toBeUndefined()
    })

    it('resolves for a member found alongside others', async () => {
      account._rpc = {
        getAccountInfo: serveAccount(multisigAccountValue([
          { address: OTHER_MEMBER },
          { address: TEST_SIGNER }
        ]))
      }

      await expect(account.validateSignerIsOwner()).resolves.toBeUndefined()
    })

    it('throws naming both the signer and the multisig when not a member', async () => {
      account._rpc = { getAccountInfo: serveAccount(multisigAccountValue([{ address: OTHER_MEMBER }])) }

      const error = await account.validateSignerIsOwner().catch((e) => e)

      expect(error.message).toContain(TEST_SIGNER)
      expect(error.message).toContain(TEST_MULTISIG_PDA)
    })

    it('resolves for a member holding no permissions', async () => {
      // Mask 0 is a member who can do nothing. This method checks membership only, so it
      // passes — delete this test if it ever becomes permission-aware.
      account._rpc = { getAccountInfo: serveAccount(multisigAccountValue([{ address: TEST_SIGNER, mask: 0 }])) }

      await expect(account.validateSignerIsOwner()).resolves.toBeUndefined()
    })

    it('throws when the multisig does not exist', async () => {
      account._rpc = { getAccountInfo: serveAccount(null) }

      await expect(account.validateSignerIsOwner()).rejects.toThrow(/does not exist/)
    })

    it('distinguishes a missing signer from a non-member', async () => {
      const readOnly = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      readOnly._rpc = { getAccountInfo: serveAccount(multisigAccountValue([{ address: OTHER_MEMBER }])) }

      // A read-only account has no signer, so borrow the signing implementation.
      await expect(
        account.validateSignerIsOwner.call(readOnly)
      ).rejects.toThrow(/No signer/)
    })

    it('reads the multisig once', async () => {
      const getAccountInfo = serveAccount(multisigAccountValue([{ address: TEST_SIGNER }]))
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
