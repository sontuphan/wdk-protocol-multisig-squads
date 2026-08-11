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

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import * as multisig from '@sqds/multisig'
import { generated, utils } from '@sqds/multisig'
import { PublicKey, TransactionMessage, SystemProgram } from '@solana/web3.js'
import { getBase58Decoder } from '@solana/codecs'

import { address } from '@solana/addresses'
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS
} from '@solana-program/token'

import WalletManagerMultisigSolanaSquads, {
  SQUADS_PROGRAM_ADDRESS
} from '@tetherto/wdk-protocol-multisig-squads'

import { lookupTableAccount, multipleAccounts, stubSolanaRpc } from './helpers/rpc.js'

const TEST_SEED_PHRASE =
  'test walk nut penalty hip pave soap entry language right filter choice'

const TEST_MULTISIG = '11111111111111111111111111111111'

const ADDRESS_LOOKUP_TABLE_PROGRAM = 'AddressLookupTab1e1111111111111111111111111'

const OWNERS = [
  '3uXqWpwgqKVdiHAwF6Vmu4G4vdQzpR66xjPkz1G7zMKE',
  '2JvLzXomThTBMSj2YQY3wE21kiaSpwGyJ17nm9xiLMsE',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
]

/**
 * Converts a kit instruction to the web3.js shape the SDK helpers expect.
 *
 * @param {Object} instruction - The kit instruction.
 * @returns {Object} The web3.js instruction.
 */
function toWeb3 (instruction) {
  return {
    programId: new PublicKey(instruction.programAddress),
    keys: instruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.address),
      isSigner: account.role === 2 || account.role === 3,
      isWritable: account.role === 1 || account.role === 3
    })),
    data: Buffer.from(instruction.data)
  }
}

describe('wire format', () => {
  let account

  beforeEach(async () => {
    const wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
      provider: 'https://mock-url.com',
      createKeySecret: getBase58Decoder().decode(new Uint8Array(32).fill(9))
    })
    account = await wallet.getAccount(0)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('spending limit address', () => {
    // executeProposal derives this to pass through as a remaining account, so a wrong seed fails
    // only on chain. The SDK is the oracle.
    it.each([
      ['11111111111111111111111111111111', '2JvLzXomThTBMSj2YQY3wE21kiaSpwGyJ17nm9xiLMsE'],
      ['11111111111111111111111111111111', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
      ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '3uXqWpwgqKVdiHAwF6Vmu4G4vdQzpR66xjPkz1G7zMKE']
    ])('matches the SDK for multisig %s and create key %s', async (multisigPda, createKey) => {
      const [expected] = multisig.getSpendingLimitPda({
        multisigPda: new PublicKey(multisigPda),
        createKey: new PublicKey(createKey)
      })

      expect(await account._getSpendingLimitPda(multisigPda, createKey)).toBe(expected.toBase58())
    })
  })

  describe('configTransactionCreate instruction data', () => {
    const NEW_OWNER = '2JvLzXomThTBMSj2YQY3wE21kiaSpwGyJ17nm9xiLMsE'

    /**
     * Serializes the create args with the Squads SDK.
     *
     * @param {Object[]} actions - The SDK-shaped config actions.
     * @returns {number[]} The reference bytes.
     */
    function reference (actions) {
      const [bytes] = generated.configTransactionCreateStruct.serialize({
        instructionDiscriminator: generated.configTransactionCreateInstructionDiscriminator,
        args: { actions, memo: null }
      })

      return Array.from(bytes)
    }

    it('matches the SDK for a lone AddMember', () => {
      const mine = account._encodeConfigTransactionCreateData([
        account._encodeAddMemberAction(address(NEW_OWNER), 7)
      ])

      expect(mine).toHaveLength(47)
      expect(Array.from(mine)).toEqual(reference([
        { __kind: 'AddMember', newMember: { key: new PublicKey(NEW_OWNER), permissions: { mask: 7 } } }
      ]))
    })

    it('matches the SDK for a lone RemoveMember', () => {
      const mine = account._encodeConfigTransactionCreateData([
        account._encodeRemoveMemberAction(address(NEW_OWNER))
      ])

      // One byte shorter than AddMember, which also carries a permissions mask.
      expect(mine).toHaveLength(46)
      expect(Array.from(mine)).toEqual(reference([
        { __kind: 'RemoveMember', oldMember: new PublicKey(NEW_OWNER) }
      ]))
    })

    it('matches the SDK for RemoveMember plus ChangeThreshold', () => {
      const mine = account._encodeConfigTransactionCreateData([
        account._encodeRemoveMemberAction(address(NEW_OWNER)),
        account._encodeChangeThresholdAction(1)
      ])

      expect(mine).toHaveLength(49)
      expect(Array.from(mine)).toEqual(reference([
        { __kind: 'RemoveMember', oldMember: new PublicKey(NEW_OWNER) },
        { __kind: 'ChangeThreshold', newThreshold: 1 }
      ]))
    })

    it('matches the SDK for AddMember plus ChangeThreshold', () => {
      const mine = account._encodeConfigTransactionCreateData([
        account._encodeAddMemberAction(address(NEW_OWNER), 7),
        account._encodeChangeThresholdAction(2)
      ])

      expect(mine).toHaveLength(50)
      expect(Array.from(mine)).toEqual(reference([
        { __kind: 'AddMember', newMember: { key: new PublicKey(NEW_OWNER), permissions: { mask: 7 } } },
        { __kind: 'ChangeThreshold', newThreshold: 2 }
      ]))
    })

    it.each([
      ['inheriting a full mask', 7, 80],
      ['inheriting a limited mask', 5, 80]
    ])('matches the SDK for a swap %s', (_label, mask, size) => {
      const OLD = OWNERS[0]
      const mine = account._encodeConfigTransactionCreateData([
        account._encodeRemoveMemberAction(address(OLD)),
        account._encodeAddMemberAction(address(NEW_OWNER), mask)
      ])

      expect(mine).toHaveLength(size)
      expect(Array.from(mine)).toEqual(reference([
        { __kind: 'RemoveMember', oldMember: new PublicKey(OLD) },
        { __kind: 'AddMember', newMember: { key: new PublicKey(NEW_OWNER), permissions: { mask } } }
      ]))
    })

    it('matches the SDK for a swap plus ChangeThreshold', () => {
      const OLD = OWNERS[0]
      const mine = account._encodeConfigTransactionCreateData([
        account._encodeRemoveMemberAction(address(OLD)),
        account._encodeAddMemberAction(address(NEW_OWNER), 7),
        account._encodeChangeThresholdAction(2)
      ])

      expect(mine).toHaveLength(83)
      expect(Array.from(mine)).toEqual(reference([
        { __kind: 'RemoveMember', oldMember: new PublicKey(OLD) },
        { __kind: 'AddMember', newMember: { key: new PublicKey(NEW_OWNER), permissions: { mask: 7 } } },
        { __kind: 'ChangeThreshold', newThreshold: 2 }
      ]))
    })

    it.each([
      [1], [2], [255], [256], [65535]
    ])('encodes a threshold of %i as a u16', (threshold) => {
      const mine = account._encodeConfigTransactionCreateData([
        account._encodeChangeThresholdAction(threshold)
      ])

      expect(Array.from(mine)).toEqual(reference([
        { __kind: 'ChangeThreshold', newThreshold: threshold }
      ]))
    })

    it('matches the SDK for a lone ChangeThreshold', () => {
      const mine = account._encodeConfigTransactionCreateData([
        account._encodeChangeThresholdAction(2)
      ])

      // The smallest config transaction this package can build.
      expect(mine).toHaveLength(16)
      expect(Array.from(mine)).toEqual(reference([{ __kind: 'ChangeThreshold', newThreshold: 2 }]))
    })

    it('agrees with the SDK on the discriminator and the action tags', () => {
      expect(Array.from(generated.configTransactionCreateInstructionDiscriminator))
        .toEqual([155, 236, 87, 228, 137, 75, 81, 39])
      // Tag 0 is AddMember, 1 RemoveMember, 2 ChangeThreshold.
      expect(account._encodeAddMemberAction(address(NEW_OWNER), 7)[0]).toBe(0)
      expect(account._encodeRemoveMemberAction(address(NEW_OWNER))[0]).toBe(1)
      expect(account._encodeChangeThresholdAction(1)[0]).toBe(2)
    })
  })

  describe('proposal vote instruction data', () => {
    // Approve and reject share `ProposalVoteArgs`, so one encoder serves both and the diff
    // has to cover both discriminators.
    const VOTES = [
      ['proposalApprove', [144, 37, 164, 136, 188, 216, 42, 248], 'proposalApproveStruct', 'proposalApproveInstructionDiscriminator'],
      ['proposalReject', [243, 62, 134, 156, 230, 106, 246, 135], 'proposalRejectStruct', 'proposalRejectInstructionDiscriminator']
    ]
    const MEMOS = [
      ['no memo', undefined, 9],
      ['an empty memo', '', 13],
      ['a short memo', 'ok', 15],
      ['a longer memo', 'looks good to me', 29],
      ['a multi-byte memo', 'schön 👍', 24]
    ]

    const CASES = VOTES.flatMap(([name, discriminator, struct, tag]) =>
      MEMOS.map(([label, memo, size]) => [name, label, discriminator, struct, tag, memo, size])
    )

    it.each(CASES)('matches the SDK for %s with %s', (_name, _label, discriminator, struct, tag, memo, size) => {
      const [bytes] = generated[struct].serialize({
        instructionDiscriminator: generated[tag],
        args: { memo: memo ?? null }
      })

      const mine = account._encodeProposalVoteData(discriminator, memo)

      expect(mine).toHaveLength(size)
      expect(Array.from(mine)).toEqual(Array.from(bytes))
    })

    it('agrees with the SDK on both discriminators', () => {
      expect(Array.from(generated.proposalApproveInstructionDiscriminator))
        .toEqual([144, 37, 164, 136, 188, 216, 42, 248])
      expect(Array.from(generated.proposalRejectInstructionDiscriminator))
        .toEqual([243, 62, 134, 156, 230, 106, 246, 135])
    })
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

  describe('vault transaction execution accounts', () => {
    // The program checks `remaining_accounts` positionally and by flag, so the only
    // meaningful guard is a diff against the SDK's own resolver. The stored account is
    // built with the SDK, decoded by this package, then resolved — which exercises the
    // decoder and the resolver together.
    const RECIPIENT = '2JvLzXomThTBMSj2YQY3wE21kiaSpwGyJ17nm9xiLMsE'
    const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

    /**
     * Serializes a stored `VaultTransaction` holding the given message.
     *
     * @param {Object} message - A web3.js `TransactionMessage`.
     * @param {string} vault - The vault address.
     * @param {Object[]} [lookups] - Address table lookups to attach.
     * @returns {{ account: Object, message: Object }} The account value and the stored message.
     */
    function storedTransaction (message, vault, lookups = [], ephemeralSignerBumps = []) {
      const compiled = message.compileToV0Message(lookups.map((l) => l.account))
      const { header, staticAccountKeys } = compiled

      const stored = {
        numSigners: header.numRequiredSignatures,
        numWritableSigners: header.numRequiredSignatures - header.numReadonlySignedAccounts,
        numWritableNonSigners:
          staticAccountKeys.length - header.numRequiredSignatures - header.numReadonlyUnsignedAccounts,
        accountKeys: staticAccountKeys,
        instructions: compiled.compiledInstructions.map((ix) => ({
          programIdIndex: ix.programIdIndex,
          accountIndexes: Uint8Array.from(ix.accountKeyIndexes),
          data: Uint8Array.from(ix.data)
        })),
        addressTableLookups: compiled.addressTableLookups.map((l) => ({
          accountKey: l.accountKey,
          writableIndexes: Uint8Array.from(l.writableIndexes),
          readonlyIndexes: Uint8Array.from(l.readonlyIndexes)
        }))
      }

      const data = generated.VaultTransaction.fromArgs({
        multisig: new PublicKey(TEST_MULTISIG),
        creator: new PublicKey(OWNERS[0]),
        index: 1,
        bump: 255,
        vaultIndex: 0,
        vaultBump: 255,
        ephemeralSignerBumps: Uint8Array.from(ephemeralSignerBumps),
        message: stored
      }).serialize()[0]

      return {
        account: {
          owner: SQUADS_PROGRAM_ADDRESS,
          data: [data.toString('base64'), 'base64'],
          executable: false,
          lamports: 2039280n,
          space: BigInt(data.length)
        },
        message: stored
      }
    }

    /**
     * Builds a web3.js message carrying an SPL transfer out of the vault.
     *
     * @param {string} vault - The vault address.
     * @param {boolean} createAta - Whether to prepend an ATA creation.
     * @returns {Promise<Object>} The web3.js TransactionMessage.
     */
    async function splMessage (vault, createAta) {
      const mint = address(MINT)
      const [source] = await findAssociatedTokenPda({ mint, owner: address(vault), tokenProgram: TOKEN_PROGRAM_ADDRESS })
      const [destination] = await findAssociatedTokenPda({ mint, owner: address(RECIPIENT), tokenProgram: TOKEN_PROGRAM_ADDRESS })

      const instructions = []

      if (createAta) {
        instructions.push(getCreateAssociatedTokenIdempotentInstruction({
          ata: destination, mint, owner: address(RECIPIENT), payer: address(vault)
        }))
      }

      instructions.push(getTransferInstruction({
        source, destination, authority: address(vault), amount: 1000n
      }))

      return new TransactionMessage({
        payerKey: new PublicKey(vault),
        recentBlockhash: '11111111111111111111111111111111',
        instructions: instructions.map(toWeb3)
      })
    }

    /**
     * Resolves the SDK's reference account metas for a stored message.
     *
     * @param {Object} stored - The stored message.
     * @param {string} vault - The vault address.
     * @param {Object[]} lookups - The lookup table accounts, if any.
     * @returns {Promise<Array>} The reference metas.
     */
    async function reference (stored, vault, lookups, ephemeralSignerBumps = []) {
      const { accountMetas } = await utils.accountsForTransactionExecute({
        connection: null,
        transactionPda: new PublicKey(TEST_MULTISIG),
        vaultPda: new PublicKey(vault),
        message: stored,
        ephemeralSignerBumps,
        addressLookupTableAccounts: lookups.map((l) => l.account)
      })

      return accountMetas.map((m) => ({
        address: m.pubkey.toBase58(),
        signer: m.isSigner,
        writable: m.isWritable
      }))
    }

    /**
     * Flattens this package's roles into the SDK's flag shape.
     *
     * @param {Array} accounts - The kit account metas.
     * @returns {Array} The comparable shape.
     */
    function flatten (accounts) {
      return accounts.map(({ address: a, role }) => ({
        address: a,
        signer: role === 2 || role === 3,
        writable: role === 1 || role === 3
      }))
    }

    it.each([
      ['a SOL transfer', null],
      ['an SPL transfer', false],
      ['an SPL transfer creating the recipient account', true]
    ])('matches the SDK for %s', async (_label, createAta) => {
      const vault = await account.getVaultAddress()
      const message = createAta === null
        ? new TransactionMessage({
          payerKey: new PublicKey(vault),
          recentBlockhash: '11111111111111111111111111111111',
          instructions: [SystemProgram.transfer({
            fromPubkey: new PublicKey(vault),
            toPubkey: new PublicKey(RECIPIENT),
            lamports: 1000
          })]
        })
        : await splMessage(vault, createAta)

      const { account: stored, message: storedMessage } = storedTransaction(message, vault)
      const decoded = account._decodeTransactionAccount(TEST_MULTISIG, stored)

      expect(decoded.kind).toBe('vault')
      expect(decoded.vaultIndex).toBe(0)
      expect(decoded.ephemeralSignerCount).toBe(0)

      const mine = flatten(await account._resolveExecutionAccounts(decoded, vault))

      expect(mine).toEqual(await reference(storedMessage, vault, []))
    })

    it('marks the vault writable but not a signer', async () => {
      const vault = await account.getVaultAddress()
      const message = new TransactionMessage({
        payerKey: new PublicKey(vault),
        recentBlockhash: '11111111111111111111111111111111',
        instructions: [SystemProgram.transfer({
          fromPubkey: new PublicKey(vault),
          toPubkey: new PublicKey(RECIPIENT),
          lamports: 1000
        })]
      })
      const { account: stored } = storedTransaction(message, vault)
      const decoded = account._decodeTransactionAccount(TEST_MULTISIG, stored)
      const resolved = await account._resolveExecutionAccounts(decoded, vault)
      const vaultMeta = resolved.find((a) => a.address === vault)

      // Role 1 is writable non-signer. The program signs for the vault itself.
      expect(vaultMeta.role).toBe(1)
    })

    it('decodes the message account keys the SDK stored', async () => {
      const vault = await account.getVaultAddress()
      const message = await splMessage(vault, true)
      const { account: stored, message: storedMessage } = storedTransaction(message, vault)
      const decoded = account._decodeTransactionAccount(TEST_MULTISIG, stored)

      expect(decoded.message.accountKeys)
        .toEqual(storedMessage.accountKeys.map((k) => k.toBase58()))
      expect(decoded.message.numSigners).toBe(storedMessage.numSigners)
      expect(decoded.message.numWritableSigners).toBe(storedMessage.numWritableSigners)
      expect(decoded.message.numWritableNonSigners).toBe(storedMessage.numWritableNonSigners)
      expect(decoded.message.addressTableLookups).toEqual([])
    })

    it('matches the SDK when the message uses an address lookup table', async () => {
      const vault = await account.getVaultAddress()
      const extra = OWNERS.map((o) => new PublicKey(o))
      const tableKey = new PublicKey('7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2')
      const table = {
        key: tableKey,
        state: {
          deactivationSlot: 2n ** 64n - 1n,
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          addresses: extra
        },
        isActive: () => true
      }

      // The transfer recipient lives only in the table, so it must be resolved from it.
      const message = new TransactionMessage({
        payerKey: new PublicKey(vault),
        recentBlockhash: '11111111111111111111111111111111',
        instructions: [SystemProgram.transfer({
          fromPubkey: new PublicKey(vault),
          toPubkey: extra[1],
          lamports: 1000
        })]
      })

      const { account: stored, message: storedMessage } =
        storedTransaction(message, vault, [{ account: table }])
      const decoded = account._decodeTransactionAccount(TEST_MULTISIG, stored)

      expect(decoded.message.addressTableLookups).toHaveLength(1)
      expect(decoded.message.addressTableLookups[0].accountKey).toBe(tableKey.toBase58())

      const fetchMock = stubSolanaRpc({
        getMultipleAccounts: () => multipleAccounts([
          lookupTableAccount(ADDRESS_LOOKUP_TABLE_PROGRAM, extra.map((key) => key.toBytes()))
        ])
      })

      const mine = flatten(await account._resolveExecutionAccounts(decoded, vault))

      // The table was read by address, and read once.
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).params[0])
        .toEqual([tableKey.toBase58()])

      expect(mine).toEqual(await reference(storedMessage, vault, [{ account: table }]))

      // Group 1 first, group 3 last.
      expect(mine[0].address).toBe(tableKey.toBase58())
      expect(mine[mine.length - 1].address).toBe(extra[1].toBase58())
    })

    it('matches the SDK when the message needs ephemeral signers', async () => {
      const vault = await account.getVaultAddress()
      const [ephemeral] = multisig.getEphemeralSignerPda({
        transactionPda: new PublicKey(TEST_MULTISIG),
        ephemeralSignerIndex: 0
      })

      // A transfer *from* the ephemeral signer, so the message marks it a writable signer.
      const message = new TransactionMessage({
        payerKey: new PublicKey(vault),
        recentBlockhash: '11111111111111111111111111111111',
        instructions: [SystemProgram.transfer({
          fromPubkey: ephemeral,
          toPubkey: new PublicKey(RECIPIENT),
          lamports: 1000
        })]
      })

      const { account: stored, message: storedMessage } =
        storedTransaction(message, vault, [], [255])
      const decoded = account._decodeTransactionAccount(TEST_MULTISIG, stored)

      expect(decoded.ephemeralSignerCount).toBe(1)

      const mine = flatten(await account._resolveExecutionAccounts(decoded, vault))

      expect(mine).toEqual(await reference(storedMessage, vault, [], [255]))
      expect(mine.find((a) => a.address === ephemeral.toBase58()))
        .toEqual({ address: ephemeral.toBase58(), signer: false, writable: true })
    })

    it('derives ephemeral signer addresses the SDK agrees with', async () => {
      const mine = await account._getEphemeralSignerPdas(TEST_MULTISIG, 3)

      expect(mine).toEqual([0, 1, 2].map((i) => multisig.getEphemeralSignerPda({
        transactionPda: new PublicKey(TEST_MULTISIG),
        ephemeralSignerIndex: i
      })[0].toBase58()))
    })

    it('refuses a lookup table that no longer exists', async () => {
      const vault = await account.getVaultAddress()
      const extra = OWNERS.map((o) => new PublicKey(o))
      const table = {
        key: new PublicKey('7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2'),
        state: { deactivationSlot: 2n ** 64n - 1n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, addresses: extra },
        isActive: () => true
      }
      const message = new TransactionMessage({
        payerKey: new PublicKey(vault),
        recentBlockhash: '11111111111111111111111111111111',
        instructions: [SystemProgram.transfer({
          fromPubkey: new PublicKey(vault), toPubkey: extra[1], lamports: 1000
        })]
      })
      const { account: stored } = storedTransaction(message, vault, [{ account: table }])
      const decoded = account._decodeTransactionAccount(TEST_MULTISIG, stored)

      stubSolanaRpc({ getMultipleAccounts: () => multipleAccounts([null]) })

      await expect(account._resolveExecutionAccounts(decoded, vault))
        .rejects.toThrow(/no longer be executed/)
    })

    it('refuses an account at the lookup table address that is not a lookup table', async () => {
      const vault = await account.getVaultAddress()
      const extra = OWNERS.map((o) => new PublicKey(o))
      const table = {
        key: new PublicKey('7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2'),
        state: { deactivationSlot: 2n ** 64n - 1n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, addresses: extra },
        isActive: () => true
      }
      const message = new TransactionMessage({
        payerKey: new PublicKey(vault),
        recentBlockhash: '11111111111111111111111111111111',
        instructions: [SystemProgram.transfer({
          fromPubkey: new PublicKey(vault), toPubkey: extra[1], lamports: 1000
        })]
      })
      const { account: stored } = storedTransaction(message, vault, [{ account: table }])
      const decoded = account._decodeTransactionAccount(TEST_MULTISIG, stored)

      stubSolanaRpc({
        getMultipleAccounts: () => multipleAccounts([
          lookupTableAccount(SQUADS_PROGRAM_ADDRESS, extra.map((key) => key.toBytes()))
        ])
      })

      await expect(account._resolveExecutionAccounts(decoded, vault))
        .rejects.toThrow(/does not exist/)
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

        expect(Array.from(account._encodeTransactionMessage(vault, { to: RECIPIENT, value }).bytes))
          .toEqual(reference(vault, value))
      }
    )

    it('is 120 bytes for a native transfer', async () => {
      const vault = await account.getVaultAddress()

      expect(account._encodeTransactionMessage(vault, { to: RECIPIENT, value: 1n }).bytes)
        .toHaveLength(120)
    })

    it('rejects anything but a native transfer', async () => {
      const vault = await account.getVaultAddress()

      expect(() => account._encodeTransactionMessage(vault, { instructions: [] })).toThrow()
    })
  })

  describe('spl transfer message', () => {
    const RECIPIENT = '2JvLzXomThTBMSj2YQY3wE21kiaSpwGyJ17nm9xiLMsE'
    const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

    /**
     * Builds the transfer instructions, optionally preceded by an ATA creation.
     *
     * @param {string} vault - The vault address.
     * @param {boolean} createAta - Whether to include the creation instruction.
     * @returns {Promise<Object[]>} The kit instructions.
     */
    async function buildInstructions (vault, createAta) {
      const mint = address(MINT)
      const [source] = await findAssociatedTokenPda({ mint, owner: address(vault), tokenProgram: TOKEN_PROGRAM_ADDRESS })
      const [destination] = await findAssociatedTokenPda({ mint, owner: address(RECIPIENT), tokenProgram: TOKEN_PROGRAM_ADDRESS })

      const instructions = []

      if (createAta) {
        instructions.push(getCreateAssociatedTokenIdempotentInstruction({
          ata: destination,
          mint,
          owner: address(RECIPIENT),
          payer: address(vault)
        }))
      }

      instructions.push(getTransferInstruction({
        source,
        destination,
        authority: address(vault),
        amount: 1000000n
      }))

      return instructions
    }

    it.each([
      ['the recipient already holds the token', false, 150],
      ['the recipient token account must be created', true, 289]
    ])('matches the SDK when %s', async (_label, createAta, size) => {
      const vault = await account.getVaultAddress()
      const instructions = await buildInstructions(vault, createAta)

      const mine = account._compileTransactionMessage(address(vault), instructions).bytes
      const reference = utils.transactionMessageToMultisigTransactionMessageBytes({
        message: new TransactionMessage({
          payerKey: new PublicKey(vault),
          recentBlockhash: '11111111111111111111111111111111',
          instructions: instructions.map(toWeb3)
        }),
        vaultPda: new PublicKey(vault)
      })

      expect(mine).toHaveLength(size)
      expect(Array.from(mine)).toEqual(Array.from(reference))
    })
  })
})
