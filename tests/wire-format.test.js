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

// Diffs the instruction data this package builds against @sqds/multisig, which defines the
// on-chain wire format. The SDK is a dev-time reference only; it is never imported by src.

import { describe, it, expect, beforeEach } from '@jest/globals'

import { generated, utils } from '@sqds/multisig'
import { PublicKey, TransactionMessage, SystemProgram } from '@solana/web3.js'
import { getBase58Decoder } from '@solana/codecs'

import WalletManagerMultisigSolanaSquads from '@tetherto/wdk-protocol-multisig-squads'

const TEST_SEED_PHRASE =
  'test walk nut penalty hip pave soap entry language right filter choice'

const OWNERS = [
  '3uXqWpwgqKVdiHAwF6Vmu4G4vdQzpR66xjPkz1G7zMKE',
  '2JvLzXomThTBMSj2YQY3wE21kiaSpwGyJ17nm9xiLMsE',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
]

describe('wire format', () => {
  let account

  beforeEach(async () => {
    const wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
      provider: 'https://mock-url.com',
      createKeySecret: getBase58Decoder().decode(new Uint8Array(32).fill(9))
    })
    account = await wallet.getAccount(0)
  })

  describe('multisigCreateV2 instruction data', () => {
    /**
     * Serializes the create args with the Squads SDK.
     *
     * @param {string[]} owners - The member addresses.
     * @param {number} threshold - The approval threshold.
     * @returns {number[]} The reference bytes.
     */
    function reference (owners, threshold) {
      const [bytes] = generated.multisigCreateV2Struct.serialize({
        instructionDiscriminator: generated.multisigCreateV2InstructionDiscriminator,
        args: {
          configAuthority: null,
          threshold,
          members: owners.map((owner) => ({ key: new PublicKey(owner), permissions: { mask: 7 } })),
          timeLock: 0,
          rentCollector: null,
          memo: null
        }
      })

      return Array.from(bytes)
    }

    it.each([
      [1, 1],
      [2, 2],
      [3, 2]
    ])('matches the SDK for %i owner(s) at threshold %i', (count, threshold) => {
      const owners = OWNERS.slice(0, count)

      expect(Array.from(account._encodeMultisigCreateV2Data(owners, threshold)))
        .toEqual(reference(owners, threshold))
    })

    it('is 21 bytes plus 33 per owner', () => {
      expect(account._encodeMultisigCreateV2Data(OWNERS.slice(0, 1), 1)).toHaveLength(54)
      expect(account._encodeMultisigCreateV2Data(OWNERS.slice(0, 2), 2)).toHaveLength(87)
      expect(account._encodeMultisigCreateV2Data(OWNERS, 2)).toHaveLength(120)
    })
  })

  describe('vault transaction message', () => {
    // The instruction argument uses one-byte length prefixes; the message the program
    // stores from it uses four-byte ones. Getting the two confused yields an unparseable
    // message, so this diff is the guard.
    const RECIPIENT = '2JvLzXomThTBMSj2YQY3wE21kiaSpwGyJ17nm9xiLMsE'

    /**
     * Builds the reference message with the Squads SDK.
     *
     * @param {string} vault - The vault address.
     * @param {bigint} value - The lamports to transfer.
     * @returns {number[]} The reference bytes.
     */
    function reference (vault, value) {
      const message = new TransactionMessage({
        payerKey: new PublicKey(vault),
        recentBlockhash: '11111111111111111111111111111111',
        instructions: [
          SystemProgram.transfer({
            fromPubkey: new PublicKey(vault),
            toPubkey: new PublicKey(RECIPIENT),
            lamports: value
          })
        ]
      })

      return Array.from(
        utils.transactionMessageToMultisigTransactionMessageBytes({
          message,
          vaultPda: new PublicKey(vault)
        })
      )
    }

    it.each([1n, 1000000n, 18446744073709551615n])(
      'matches the SDK for a transfer of %s lamports',
      async (value) => {
        const vault = await account.getVaultAddress()

        expect(Array.from(account._encodeTransactionMessage(vault, { to: RECIPIENT, value })))
          .toEqual(reference(vault, value))
      }
    )

    it('is 120 bytes for a native transfer', async () => {
      const vault = await account.getVaultAddress()

      expect(account._encodeTransactionMessage(vault, { to: RECIPIENT, value: 1n }))
        .toHaveLength(120)
    })

    it('rejects anything but a native transfer', async () => {
      const vault = await account.getVaultAddress()

      expect(() => account._encodeTransactionMessage(vault, { instructions: [] })).toThrow()
    })
  })
})
