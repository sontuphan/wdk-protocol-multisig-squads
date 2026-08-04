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
const PROPOSAL_DISCRIMINATOR = [26, 94, 189, 187, 116, 136, 53, 33]
const VAULT_TRANSACTION_DISCRIMINATOR = [168, 250, 162, 100, 81, 14, 162, 207]
const CONFIG_TRANSACTION_DISCRIMINATOR = [94, 8, 4, 35, 113, 139, 139, 112]
const BATCH_DISCRIMINATOR = [156, 194, 70, 44, 22, 88, 137, 44]
const SYSTEM_PROGRAM = '11111111111111111111111111111111'

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
function multisigAccountValue (members, {
  threshold = 1,
  transactionIndex = 0n,
  staleTransactionIndex = 0n,
  timeLock = 0
} = {}) {
  const data = new Uint8Array(95 + 1 + 4 + members.length * 33)
  const view = new DataView(data.buffer)

  data.set(MULTISIG_DISCRIMINATOR, 0)
  view.setUint16(72, threshold, true)
  view.setUint32(74, timeLock, true)
  view.setBigUint64(78, transactionIndex, true)
  view.setBigUint64(86, staleTransactionIndex, true)

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
 * Serves a `Proposal` account in the given status, holding the given votes.
 *
 * @param {Object} [options] - The proposal state.
 * @param {number} [options.status=1] - The status enum tag; 1 is open for voting.
 * @param {string[]} [options.approved] - The members who have approved.
 * @param {string[]} [options.rejected] - The members who have rejected.
 * @returns {Object} An account value.
 */
function proposalAccountValue ({ status = 1, approved = [], rejected = [], timestamp = 0n } = {}) {
  const voters = [approved, rejected, []]
  const data = new Uint8Array(58 + voters.reduce((total, list) => total + 4 + list.length * 32, 0))
  const view = new DataView(data.buffer)

  data.set(PROPOSAL_DISCRIMINATOR, 0)
  data[48] = status

  if (status !== 4) {
    view.setBigInt64(49, timestamp, true)
  }

  // The status carries an i64 timestamp for every tag but Executing, then the bump.
  let offset = status === 4 ? 50 : 58

  for (const list of voters) {
    view.setUint32(offset, list.length, true)
    offset += 4

    for (const voter of list) {
      data.set(getBase58Encoder().encode(voter), offset)
      offset += 32
    }
  }

  return {
    owner: SQUADS_PROGRAM_ADDRESS,
    data: [getBase64Decoder().decode(data.subarray(0, offset)), 'base64'],
    executable: false,
    lamports: 2039280n,
    space: BigInt(offset)
  }
}

/**
 * Serves a `VaultTransaction` account holding a message over the given keys.
 *
 * @param {Object} [options] - The transaction state.
 * @param {string[]} [options.accountKeys] - The message's account keys.
 * @param {number} [options.vaultIndex=0] - The vault the transaction belongs to.
 * @param {number} [options.ephemeralSignerCount=0] - How many ephemeral signers it needs.
 * @returns {Object} An account value.
 */
function vaultTransactionAccountValue ({
  accountKeys = [TEST_SIGNER, OTHER_MEMBER, SYSTEM_PROGRAM],
  vaultIndex = 0,
  ephemeralSignerCount = 0
} = {}) {
  // 87 fixed fields, the ephemeral bumps, then the message: 3 header bytes, the key vec,
  // and empty instruction and lookup vecs.
  const size = 87 + ephemeralSignerCount + 3 + 4 + accountKeys.length * 32 + 4 + 4
  const data = new Uint8Array(size)
  const view = new DataView(data.buffer)

  data.set(VAULT_TRANSACTION_DISCRIMINATOR, 0)
  data[81] = vaultIndex
  view.setUint32(83, ephemeralSignerCount, true)

  let offset = 87 + ephemeralSignerCount

  // One writable signer (the vault), then one writable non-signer, then the program.
  data[offset] = 1
  data[offset + 1] = 1
  data[offset + 2] = 1
  offset += 3

  view.setUint32(offset, accountKeys.length, true)
  offset += 4

  for (const key of accountKeys) {
    data.set(getBase58Encoder().encode(key), offset)
    offset += 32
  }

  // Zero instructions, zero lookups.
  return accountValue(data)
}

/**
 * Serves a `ConfigTransaction` account holding the given actions.
 *
 * `SetRentCollectorSome` writes the `Some` form of `SetRentCollector`, whose body is 32
 * bytes longer than the `None` form.
 *
 * @param {string[]} kinds - The action kinds, by name.
 * @returns {Object} An account value.
 */
function configTransactionAccountValue (kinds) {
  const TAGS = [
    'AddMember',
    'RemoveMember',
    'ChangeThreshold',
    'SetTimeLock',
    'AddSpendingLimit',
    'RemoveSpendingLimit',
    'SetRentCollector'
  ]
  const BODIES = {
    AddMember: 33,
    RemoveMember: 32,
    ChangeThreshold: 2,
    SetTimeLock: 4,
    AddSpendingLimit: 74 + 4 + 4,
    RemoveSpendingLimit: 32,
    SetRentCollector: 1,
    SetRentCollectorSome: 33
  }
  const size = 85 + kinds.reduce((total, kind) => total + 1 + BODIES[kind], 0)
  const data = new Uint8Array(size)
  const view = new DataView(data.buffer)

  data.set(CONFIG_TRANSACTION_DISCRIMINATOR, 0)
  view.setUint32(81, kinds.length, true)

  let offset = 85

  for (const kind of kinds) {
    data[offset] = TAGS.indexOf(kind.replace(/Some$/, ''))

    if (kind === 'SetRentCollectorSome') {
      data[offset + 1] = 1
    }

    offset += 1 + BODIES[kind]
  }

  return accountValue(data)
}

/**
 * Serves the clock sysvar reporting the given Unix timestamp.
 *
 * @param {bigint} now - The timestamp.
 * @returns {Object} An account value.
 */
function clockAccountValue (now) {
  const data = new Uint8Array(40)

  new DataView(data.buffer).setBigInt64(32, now, true)

  return { ...accountValue(data), owner: 'Sysvar1111111111111111111111111111111111111' }
}

/**
 * Wraps raw account data in the RPC's account shape.
 *
 * @param {Uint8Array} data - The account data.
 * @returns {Object} An account value.
 */
function accountValue (data) {
  return {
    owner: SQUADS_PROGRAM_ADDRESS,
    data: [getBase64Decoder().decode(data), 'base64'],
    executable: false,
    lamports: 2039280n,
    space: BigInt(data.length)
  }
}

  /**
   * Builds a voting account with a stubbed RPC and send.
   *
   * @param {Object} [options] - The scenario.
   * @param {number} [options.mask=7] - The signer's permission mask.
   * @param {boolean} [options.isMember=true] - Whether the signer is a member.
   * @param {boolean} [options.deployed=true] - Whether the multisig exists.
   * @param {Object|null} [options.proposal] - The proposal state, or null for absent.
   * @param {bigint} [options.staleTransactionIndex=0n] - The multisig's stale index.
   * @returns {Promise<{ account: Object, sendTransaction: Function, getMultipleAccounts: Function }>}
   */
  async function votingAccount ({
    mask = 7,
    isMember = true,
    deployed = true,
    proposal = {},
    staleTransactionIndex = 0n
  } = {}) {
    const wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
      provider: TEST_RPC_URL,
      multisigPda: TEST_MULTISIG_PDA
    })
    const account = await wallet.getAccount(0)

    const members = isMember
      ? [{ address: TEST_SIGNER, mask }, { address: OTHER_MEMBER, mask: 7 }]
      : [{ address: OTHER_MEMBER, mask: 7 }]

    const getMultipleAccounts = jest.fn(() => ({
      send: async () => ({
        value: [
          deployed
            ? multisigAccountValue(members, { threshold: 2, transactionIndex: 7n, staleTransactionIndex })
            : null,
          proposal && proposalAccountValue(proposal)
        ]
      })
    }))
    const sendTransaction = jest.fn(async () => ({ hash: 'deadbeef', fee: 5000n }))

    account._rpc = { getMultipleAccounts }
    account._signerAccount.sendTransaction = sendTransaction

    return { account, sendTransaction, getMultipleAccounts }
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
    // Only methods that still throw before touching the network belong here.
    await expect(account.addOwner(TEST_SIGNER)).rejects.toThrow()
    await expect(account.updateOwners([TEST_SIGNER], 1)).rejects.toThrow()
  })

  it('throws NotSupportedError for message proposals', async () => {
    // Not pending work: Squads cannot produce a multisig signature at all.
    await expect(account.proposeMessage('hello')).rejects.toThrow(NotSupportedError)
    await expect(account.approveMessage('abc')).rejects.toThrow(NotSupportedError)
  })

  it('separates unsupported message proposals from unimplemented writes', async () => {
    await expect(account.addOwner(TEST_SIGNER)).rejects.not.toThrow(NotSupportedError)
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

  describe('sendTransaction', () => {
    const TX = { to: OTHER_MEMBER, value: 100000n }

    /**
     * Builds a proposing account with a stubbed RPC and send.
     *
     * @param {Object} [options] - The scenario.
     * @param {number} [options.mask=7] - The signer's permission mask.
     * @param {bigint} [options.transactionIndex=0n] - The multisig's current index.
     * @param {boolean} [options.isMember=true] - Whether the signer is a member.
     * @param {boolean} [options.deployed=true] - Whether the multisig exists.
     * @returns {Promise<{ account: Object, sendTransaction: Function, getAccountInfo: Function }>}
     */
    async function proposingAccount ({
      mask = 7,
      transactionIndex = 0n,
      isMember = true,
      deployed = true
    } = {}) {
      const wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      const account = await wallet.getAccount(0)

      const members = isMember
        ? [{ address: TEST_SIGNER, mask }]
        : [{ address: OTHER_MEMBER, mask: 7 }]

      const getAccountInfo = serveAccount(
        deployed ? multisigAccountValue(members, { threshold: 2, transactionIndex }) : null
      )
      const sendTransaction = jest.fn(async () => ({ hash: 'cafebabe', fee: 5000n }))

      account._rpc = { getAccountInfo }
      account._signerAccount.sendTransaction = sendTransaction

      return { account, sendTransaction, getAccountInfo }
    }

    it('creates the transaction and its proposal in one transaction', async () => {
      const { account, sendTransaction } = await proposingAccount()

      await account.sendTransaction(TX)

      const [{ instructions }] = sendTransaction.mock.calls[0]

      expect(sendTransaction).toHaveBeenCalledTimes(1)
      expect(instructions).toHaveLength(2)
      expect(Array.from(instructions[0].data.slice(0, 8)))
        .toEqual([48, 250, 78, 168, 208, 226, 218, 211])
      expect(Array.from(instructions[1].data.slice(0, 8)))
        .toEqual([220, 60, 73, 224, 30, 108, 79, 159])
    })

    it('proposes at the next transaction index', async () => {
      const { account, sendTransaction } = await proposingAccount({ transactionIndex: 41n })

      const result = await account.sendTransaction(TX)
      const [{ instructions }] = sendTransaction.mock.calls[0]
      const data = instructions[1].data

      expect(result.proposalId).toBe('42')
      expect(new DataView(data.buffer).getBigUint64(8, true)).toBe(42n)
    })

    it('opens the proposal for voting rather than as a draft', async () => {
      const { account, sendTransaction } = await proposingAccount()

      await account.sendTransaction(TX)

      const [{ instructions }] = sendTransaction.mock.calls[0]

      // draft is the byte after the u64 index
      expect(instructions[1].data[16]).toBe(0)
    })

    it('returns the proposal with no confirmations of its own', async () => {
      const { account } = await proposingAccount()

      expect(await account.sendTransaction(TX)).toEqual({
        proposalId: '1',
        hash: 'cafebabe',
        fee: 5000n,
        confirmations: 0,
        threshold: 2,
        executed: false
      })
    })

    it('reads the multisig once for both index and threshold', async () => {
      const { account, getAccountInfo } = await proposingAccount()

      await account.sendTransaction(TX)

      expect(getAccountInfo).toHaveBeenCalledTimes(1)
    })

    it('throws when the signer cannot propose', async () => {
      // Mask 2 is vote-only: a member, but without the permission to initiate.
      const { account, sendTransaction } = await proposingAccount({ mask: 2 })

      await expect(account.sendTransaction(TX)).rejects.toThrow(/permission to propose/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws when the signer is not a member', async () => {
      const { account } = await proposingAccount({ isMember: false })

      await expect(account.sendTransaction(TX)).rejects.toThrow(/not a member/)
    })

    it('throws when the multisig does not exist', async () => {
      const { account } = await proposingAccount({ deployed: false })

      await expect(account.sendTransaction(TX)).rejects.toThrow(/does not exist/)
    })

    it('rejects autoExecute as unimplemented rather than ignoring it', async () => {
      const { account, sendTransaction } = await proposingAccount()

      await expect(account.sendTransaction(TX, { autoExecute: true })).rejects.toThrow()
      expect(sendTransaction).not.toHaveBeenCalled()
    })
  })

  describe('approveTx', () => {
    it('sends a single proposalApprove instruction', async () => {
      const { account, sendTransaction } = await votingAccount()

      await account.approveTx(3)

      const [{ instructions }] = sendTransaction.mock.calls[0]

      expect(instructions).toHaveLength(1)
      expect(Array.from(instructions[0].data))
        .toEqual([144, 37, 164, 136, 188, 216, 42, 248, 0])
      expect(instructions[0].accounts.map((a) => a.role)).toEqual([0, 3, 1])
    })

    it('addresses the proposal at the given index', async () => {
      const { account, sendTransaction, getMultipleAccounts } = await votingAccount()

      await account.approveTx(3)

      const [[queried]] = getMultipleAccounts.mock.calls[0]
      const [{ instructions }] = sendTransaction.mock.calls[0]
      const expected = await account._getProposalPda(TEST_MULTISIG_PDA, 3n)

      expect(queried).toBe(TEST_MULTISIG_PDA)
      expect(instructions[0].accounts[2].address).toBe(expected)
    })

    it('carries a memo when one is given', async () => {
      const { account, sendTransaction } = await votingAccount()

      await account.approveTx(3, 'ok')

      const [{ instructions }] = sendTransaction.mock.calls[0]

      expect(Array.from(instructions[0].data.slice(8)))
        .toEqual([1, 2, 0, 0, 0, 111, 107])
    })

    it('counts the approval it is about to add', async () => {
      const { account } = await votingAccount({ proposal: { approved: [OTHER_MEMBER] } })

      expect(await account.approveTx(3)).toEqual({
        proposalId: '3',
        hash: 'deadbeef',
        fee: 5000n,
        confirmations: 2,
        threshold: 2,
        executed: false
      })
    })

    it('reads the multisig and the proposal in one request', async () => {
      const { account, getMultipleAccounts } = await votingAccount()

      await account.approveTx(3)

      expect(getMultipleAccounts).toHaveBeenCalledTimes(1)
    })

    it('lets a member switch a rejection to an approval', async () => {
      const { account, sendTransaction } = await votingAccount({
        proposal: { rejected: [TEST_SIGNER] }
      })

      await expect(account.approveTx(3)).resolves.toMatchObject({ confirmations: 1 })
      expect(sendTransaction).toHaveBeenCalledTimes(1)
    })

    it('refuses a second approval from the same member', async () => {
      const { account, sendTransaction } = await votingAccount({
        proposal: { approved: [TEST_SIGNER] }
      })

      await expect(account.approveTx(3)).rejects.toThrow(/already approved/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws when the signer cannot vote', async () => {
      // Mask 5 is propose plus execute: a member, but unable to vote.
      const { account, sendTransaction } = await votingAccount({ mask: 5 })

      await expect(account.approveTx(3)).rejects.toThrow(/permission to vote/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws when the signer is not a member', async () => {
      const { account } = await votingAccount({ isMember: false })

      await expect(account.approveTx(3)).rejects.toThrow(/not a member/)
    })

    it('throws when the multisig does not exist', async () => {
      const { account } = await votingAccount({ deployed: false })

      await expect(account.approveTx(3)).rejects.toThrow(/does not exist/)
    })

    it('throws when the proposal does not exist', async () => {
      const { account } = await votingAccount({ proposal: null })

      await expect(account.approveTx(3)).rejects.toThrow(/no proposal at index 3/)
    })

    it.each([
      ['a draft', 0, /is a draft/],
      ['rejected', 2, /is rejected/],
      ['approved', 3, /is approved/],
      ['executing', 4, /is executing/],
      ['executed', 5, /is executed/],
      ['cancelled', 6, /is cancelled/]
    ])('names the status when the proposal is %s', async (_label, status, message) => {
      const { account, sendTransaction } = await votingAccount({ proposal: { status } })

      await expect(account.approveTx(3)).rejects.toThrow(message)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws when the proposal has gone stale', async () => {
      const { account, sendTransaction } = await votingAccount({ staleTransactionIndex: 3n })

      await expect(account.approveTx(3)).rejects.toThrow(/invalidated/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws on an invalid proposal id before any RPC call', async () => {
      const { account, getMultipleAccounts } = await votingAccount()

      await expect(account.approveTx(-1)).rejects.toThrow(/Invalid proposal id/)
      expect(getMultipleAccounts).not.toHaveBeenCalled()
    })

    it('throws on a non-string memo', async () => {
      const { account, sendTransaction } = await votingAccount()

      await expect(account.approveTx(3, 42)).rejects.toThrow(/must be a string/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })
  })

  describe('rejectTx', () => {
    it('sends a single proposalReject instruction', async () => {
      const { account, sendTransaction } = await votingAccount()

      await account.rejectTx(3)

      const [{ instructions }] = sendTransaction.mock.calls[0]

      expect(instructions).toHaveLength(1)
      expect(Array.from(instructions[0].data))
        .toEqual([243, 62, 134, 156, 230, 106, 246, 135, 0])
    })

    it('uses the same accounts and roles as an approval', async () => {
      const { account: a, sendTransaction: approve } = await votingAccount()
      const { account: r, sendTransaction: reject } = await votingAccount()

      await a.approveTx(3)
      await r.rejectTx(3)

      const shape = (mock) => mock.mock.calls[0][0].instructions[0].accounts
        .map(({ address, role }) => ({ address, role }))

      expect(shape(reject)).toEqual(shape(approve))
    })

    it('carries a memo when one is given', async () => {
      const { account, sendTransaction } = await votingAccount()

      await account.rejectTx(3, 'ok')

      const [{ instructions }] = sendTransaction.mock.calls[0]

      expect(Array.from(instructions[0].data.slice(8)))
        .toEqual([1, 2, 0, 0, 0, 111, 107])
    })

    it('leaves confirmations alone when the signer had not voted', async () => {
      const { account } = await votingAccount({ proposal: { approved: [OTHER_MEMBER] } })

      expect(await account.rejectTx(3)).toEqual({
        proposalId: '3',
        hash: 'deadbeef',
        fee: 5000n,
        confirmations: 1,
        threshold: 2,
        executed: false
      })
    })

    it('decrements confirmations when the signer had approved', async () => {
      // The rejection withdraws the prior approval, so the count goes down, not up.
      const { account } = await votingAccount({
        proposal: { approved: [TEST_SIGNER, OTHER_MEMBER] }
      })

      await expect(account.rejectTx(3)).resolves.toMatchObject({ confirmations: 1 })
    })

    it('reports no confirmations when the signer was the only approver', async () => {
      const { account } = await votingAccount({ proposal: { approved: [TEST_SIGNER] } })

      await expect(account.rejectTx(3)).resolves.toMatchObject({ confirmations: 0 })
    })

    it('lets a member switch an approval to a rejection', async () => {
      const { account, sendTransaction } = await votingAccount({
        proposal: { approved: [TEST_SIGNER] }
      })

      await expect(account.rejectTx(3)).resolves.toMatchObject({ proposalId: '3' })
      expect(sendTransaction).toHaveBeenCalledTimes(1)
    })

    it('refuses a second rejection from the same member', async () => {
      const { account, sendTransaction } = await votingAccount({
        proposal: { rejected: [TEST_SIGNER] }
      })

      await expect(account.rejectTx(3)).rejects.toThrow(/already rejected/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('reads the multisig and the proposal in one request', async () => {
      const { account, getMultipleAccounts } = await votingAccount()

      await account.rejectTx(3)

      expect(getMultipleAccounts).toHaveBeenCalledTimes(1)
    })

    it('throws when the signer cannot vote', async () => {
      const { account, sendTransaction } = await votingAccount({ mask: 5 })

      await expect(account.rejectTx(3)).rejects.toThrow(/permission to vote/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws when the signer is not a member', async () => {
      const { account } = await votingAccount({ isMember: false })

      await expect(account.rejectTx(3)).rejects.toThrow(/not a member/)
    })

    it('throws when the multisig does not exist', async () => {
      const { account } = await votingAccount({ deployed: false })

      await expect(account.rejectTx(3)).rejects.toThrow(/does not exist/)
    })

    it('throws when the proposal does not exist', async () => {
      const { account } = await votingAccount({ proposal: null })

      await expect(account.rejectTx(3)).rejects.toThrow(/no proposal at index 3/)
    })

    it.each([
      ['a draft', 0],
      ['approved', 3],
      ['executed', 5],
      ['cancelled', 6]
    ])('throws when the proposal is %s', async (_label, status) => {
      const { account, sendTransaction } = await votingAccount({ proposal: { status } })

      await expect(account.rejectTx(3)).rejects.toThrow(/rather than open for voting/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws when the proposal has gone stale', async () => {
      const { account, sendTransaction } = await votingAccount({ staleTransactionIndex: 3n })

      await expect(account.rejectTx(3)).rejects.toThrow(/invalidated/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws on an invalid proposal id before any RPC call', async () => {
      const { account, getMultipleAccounts } = await votingAccount()

      await expect(account.rejectTx(-1)).rejects.toThrow(/Invalid proposal id/)
      expect(getMultipleAccounts).not.toHaveBeenCalled()
    })

    it('throws on a non-string memo', async () => {
      const { account, sendTransaction } = await votingAccount()

      await expect(account.rejectTx(3, 42)).rejects.toThrow(/must be a string/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })
  })

  describe('proposal decoding', () => {
    it('reads the status timestamp every status but Executing carries', async () => {
      const decoded = account._decodeProposalAccount(
        TEST_MULTISIG_PDA,
        proposalAccountValue({ status: 3, timestamp: 1700000000n })
      )

      expect(decoded.status).toBe(3)
      expect(decoded.statusTimestamp).toBe(1700000000n)
    })

    it('reports no timestamp for Executing, whose variant carries none', async () => {
      // Reading one anyway would return the first bytes of the approved-voter list.
      const decoded = account._decodeProposalAccount(
        TEST_MULTISIG_PDA,
        proposalAccountValue({ status: 4, approved: [TEST_SIGNER, OTHER_MEMBER] })
      )

      expect(decoded.statusTimestamp).toBeNull()
      expect(decoded.approved).toEqual([TEST_SIGNER, OTHER_MEMBER])
    })
  })

  describe('executeTx', () => {
    /**
     * Builds an executing account with a stubbed RPC and send.
     *
     * @param {Object} [options] - The scenario.
     * @param {number} [options.mask=7] - The signer's permission mask.
     * @param {Object|null} [options.proposal] - The proposal state, or null for absent.
     * @param {Object|null} [options.transaction] - The backing transaction account.
     * @param {bigint} [options.staleTransactionIndex=0n] - The multisig's stale index.
     * @param {number} [options.timeLock=0] - The multisig's time lock, in seconds.
     * @param {bigint} [options.now=0n] - The cluster's current timestamp.
     * @param {boolean} [options.deployed=true] - Whether the multisig exists.
     * @returns {Promise<{ account: Object, sendTransaction: Function, getMultipleAccounts: Function }>}
     */
    async function executingAccount ({
      mask = 7,
      proposal = { status: 3 },
      transaction = vaultTransactionAccountValue(),
      staleTransactionIndex = 0n,
      timeLock = 0,
      now = 0n,
      deployed = true
    } = {}) {
      const wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      const account = await wallet.getAccount(0)

      const getMultipleAccounts = jest.fn(() => ({
        send: async () => ({
          value: [
            deployed
              ? multisigAccountValue([{ address: TEST_SIGNER, mask }], {
                threshold: 1, transactionIndex: 7n, staleTransactionIndex, timeLock
              })
              : null,
            proposal && proposalAccountValue(proposal),
            transaction,
            clockAccountValue(now)
          ]
        })
      }))
      const sendTransaction = jest.fn(async () => ({ hash: 'c0ffee', fee: 5000n }))

      account._rpc = { getMultipleAccounts }
      account._signerAccount.sendTransaction = sendTransaction

      return { account, sendTransaction, getMultipleAccounts }
    }

    it('sends a single vaultTransactionExecute instruction', async () => {
      const { account, sendTransaction } = await executingAccount()

      await account.executeTx(3)

      const [{ instructions }] = sendTransaction.mock.calls[0]

      expect(instructions).toHaveLength(1)
      expect(Array.from(instructions[0].data))
        .toEqual([194, 8, 161, 87, 153, 164, 25, 171])
    })

    it('puts the four fixed accounts first, with the multisig read-only', async () => {
      const { account, sendTransaction } = await executingAccount()

      await account.executeTx(3)

      const [{ instructions }] = sendTransaction.mock.calls[0]
      const roles = instructions[0].accounts.slice(0, 4).map((a) => a.role)

      // multisig readonly, proposal writable, transaction readonly, member readonly signer.
      expect(roles).toEqual([0, 1, 0, 2])
      expect(instructions[0].accounts[0].address).toBe(TEST_MULTISIG_PDA)
    })

    it('appends the message accounts and de-signs the vault', async () => {
      const { account, sendTransaction } = await executingAccount({
        transaction: vaultTransactionAccountValue({
          accountKeys: [TEST_SIGNER, OTHER_MEMBER, SYSTEM_PROGRAM]
        })
      })

      await account.executeTx(3)

      const [{ instructions }] = sendTransaction.mock.calls[0]
      const remaining = instructions[0].accounts.slice(4)

      // The first key is the message's writable signer, and it is not TEST_SIGNER's vault,
      // so it keeps its signer flag; the second is a writable non-signer; the third readonly.
      expect(remaining.map((a) => a.address)).toEqual([TEST_SIGNER, OTHER_MEMBER, SYSTEM_PROGRAM])
      expect(remaining.map((a) => a.role)).toEqual([3, 1, 0])
    })

    it('strips the signer flag from the vault itself', async () => {
      const wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
        provider: TEST_RPC_URL, multisigPda: TEST_MULTISIG_PDA
      })
      const probe = await wallet.getAccount(0)
      const vault = await probe.getVaultAddress()

      const { account, sendTransaction } = await executingAccount({
        transaction: vaultTransactionAccountValue({
          accountKeys: [vault, OTHER_MEMBER, SYSTEM_PROGRAM]
        })
      })

      await account.executeTx(3)

      const [{ instructions }] = sendTransaction.mock.calls[0]
      const vaultMeta = instructions[0].accounts.slice(4)[0]

      expect(vaultMeta.address).toBe(vault)
      // Writable, but not a signer: the program signs for it.
      expect(vaultMeta.role).toBe(1)
    })

    it('returns only the hash and the fee', async () => {
      const { account } = await executingAccount()

      expect(await account.executeTx(3)).toEqual({ hash: 'c0ffee', fee: 5000n })
    })

    it('reads the multisig, proposal, transaction and clock in one request', async () => {
      const { account, getMultipleAccounts } = await executingAccount()

      await account.executeTx(3)

      expect(getMultipleAccounts).toHaveBeenCalledTimes(1)
      expect(getMultipleAccounts.mock.calls[0][0]).toHaveLength(4)
    })

    it('executes a stale but approved vault proposal', async () => {
      const { account, sendTransaction } = await executingAccount({ staleTransactionIndex: 5n })

      await expect(account.executeTx(3)).resolves.toEqual({ hash: 'c0ffee', fee: 5000n })
      expect(sendTransaction).toHaveBeenCalledTimes(1)
    })

    it('throws when the signer cannot execute', async () => {
      // Mask 3 is propose plus vote: a member, but unable to execute.
      const { account, sendTransaction } = await executingAccount({ mask: 3 })

      await expect(account.executeTx(3)).rejects.toThrow(/permission to execute/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it.each([
      ['open for voting', 1],
      ['a draft', 0],
      ['rejected', 2],
      ['executed', 5]
    ])('throws when the proposal is %s', async (_label, status) => {
      const { account, sendTransaction } = await executingAccount({ proposal: { status } })

      await expect(account.executeTx(3)).rejects.toThrow(/rather than approved/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws while the time lock has not elapsed', async () => {
      const { account, sendTransaction } = await executingAccount({
        timeLock: 3600,
        proposal: { status: 3, timestamp: 1000n },
        now: 2800n
      })

      await expect(account.executeTx(3)).rejects.toThrow(/time lock for another 1800 seconds/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('executes once the time lock has elapsed', async () => {
      const { account } = await executingAccount({
        timeLock: 3600,
        proposal: { status: 3, timestamp: 1000n },
        now: 4600n
      })

      await expect(account.executeTx(3)).resolves.toEqual({ hash: 'c0ffee', fee: 5000n })
    })

    it('throws when the proposal does not exist', async () => {
      const { account } = await executingAccount({ proposal: null })

      await expect(account.executeTx(3)).rejects.toThrow(/no proposal at index 3/)
    })

    it('throws when the multisig does not exist', async () => {
      const { account } = await executingAccount({ deployed: false })

      await expect(account.executeTx(3)).rejects.toThrow(/does not exist/)
    })

    it('refuses a message needing ephemeral signers', async () => {
      const { account, sendTransaction } = await executingAccount({
        transaction: vaultTransactionAccountValue({ ephemeralSignerCount: 2 })
      })

      await expect(account.executeTx(3)).rejects.toThrow(/ephemeral signers/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('refuses a batch', async () => {
      const data = new Uint8Array(100)
      data.set(BATCH_DISCRIMINATOR, 0)

      const { account, sendTransaction } = await executingAccount({ transaction: accountValue(data) })

      await expect(account.executeTx(3)).rejects.toThrow(/batch/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('refuses an unrecognized transaction account', async () => {
      const { account, sendTransaction } = await executingAccount({
        transaction: accountValue(new Uint8Array(100))
      })

      await expect(account.executeTx(3)).rejects.toThrow(/unrecognized kind/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws on an invalid proposal id before any RPC call', async () => {
      const { account, getMultipleAccounts } = await executingAccount()

      await expect(account.executeTx(-1)).rejects.toThrow(/Invalid proposal id/)
      expect(getMultipleAccounts).not.toHaveBeenCalled()
    })

    describe('config proposals', () => {
      it('sends configTransactionExecute with the multisig writable', async () => {
        const { account, sendTransaction } = await executingAccount({
          transaction: configTransactionAccountValue(['ChangeThreshold'])
        })

        await account.executeTx(3)

        const [{ instructions }] = sendTransaction.mock.calls[0]

        expect(Array.from(instructions[0].data))
          .toEqual([114, 146, 244, 189, 252, 140, 36, 40])
        // multisig writable, member readonly signer, proposal writable, transaction
        // readonly, rent payer writable signer, system program readonly.
        expect(instructions[0].accounts.map((a) => a.role)).toEqual([1, 2, 1, 0, 3, 0])
      })

      it('pays rent from the executing member', async () => {
        const { account, sendTransaction } = await executingAccount({
          transaction: configTransactionAccountValue(['AddMember'])
        })

        await account.executeTx(3)

        const [{ instructions }] = sendTransaction.mock.calls[0]
        const { accounts } = instructions[0]

        expect(accounts[4].address).toBe(TEST_SIGNER)
        expect(accounts[5].address).toBe(SYSTEM_PROGRAM)
      })

      it('refuses a stale config proposal even when approved', async () => {
        const { account, sendTransaction } = await executingAccount({
          transaction: configTransactionAccountValue(['AddMember']),
          staleTransactionIndex: 5n
        })

        await expect(account.executeTx(3)).rejects.toThrow(/invalidated/)
        expect(sendTransaction).not.toHaveBeenCalled()
      })

      it.each([
        ['AddSpendingLimit'],
        ['RemoveSpendingLimit']
      ])('refuses a %s action', async (kind) => {
        const { account, sendTransaction } = await executingAccount({
          transaction: configTransactionAccountValue(['AddMember', kind])
        })

        await expect(account.executeTx(3)).rejects.toThrow(new RegExp(kind))
        expect(sendTransaction).not.toHaveBeenCalled()
      })

      it('walks past every action body to find a later one', async () => {
        const { account, sendTransaction } = await executingAccount({
          transaction: configTransactionAccountValue([
            'AddMember', 'RemoveMember', 'ChangeThreshold', 'SetTimeLock',
            'SetRentCollector', 'SetRentCollectorSome', 'RemoveSpendingLimit'
          ])
        })

        // The spending-limit action is last, so reaching it proves every prior body was
        // sized correctly.
        await expect(account.executeTx(3)).rejects.toThrow(/RemoveSpendingLimit/)
        expect(sendTransaction).not.toHaveBeenCalled()
      })

      it('throws on an unknown action tag rather than skipping it', async () => {
        const data = new Uint8Array(100)
        data.set(CONFIG_TRANSACTION_DISCRIMINATOR, 0)
        new DataView(data.buffer).setUint32(81, 1, true)
        data[85] = 99

        const { account } = await executingAccount({ transaction: accountValue(data) })

        await expect(account.executeTx(3)).rejects.toThrow(/Unknown Squads config action 99/)
      })
    })
  })

  describe('transfer', () => {
    const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    const OPTIONS = { token: MINT, recipient: OTHER_MEMBER, amount: 1000n }
    const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

    /**
     * Builds a transferring account with a stubbed RPC and send.
     *
     * @param {Object} [options] - The scenario.
     * @param {string} [options.mintOwner] - The program owning the mint.
     * @param {boolean} [options.recipientHasAta=true] - Whether the recipient holds the token.
     * @param {Object} [options.config] - Extra configuration.
     * @returns {Promise<{ account: Object, sendTransaction: Function }>}
     */
    async function transferringAccount ({
      mintOwner = TOKEN_PROGRAM,
      recipientHasAta = true,
      config = {}
    } = {}) {
      const wallet = new WalletManagerMultisigSolanaSquads(TEST_SEED_PHRASE, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA,
        ...config
      })
      const account = await wallet.getAccount(0)

      const tokenAccount = {
        owner: mintOwner,
        data: ['', 'base64'],
        executable: false,
        lamports: 2039280n,
        space: 165n
      }

      account._rpc = {
        getAccountInfo: serveAccount(
          multisigAccountValue([{ address: TEST_SIGNER }], { threshold: 1 })
        ),
        getMultipleAccounts: jest.fn(() => ({
          send: async () => ({
            value: [tokenAccount, recipientHasAta ? tokenAccount : null]
          })
        })),
        getMinimumBalanceForRentExemption: jest.fn(() => ({ send: async () => 2039280n }))
      }

      const sendTransaction = jest.fn(async () => ({ hash: 'feedface', fee: 5000n }))
      account._signerAccount.sendTransaction = sendTransaction

      return { account, sendTransaction }
    }

    it('proposes a token transfer', async () => {
      const { account } = await transferringAccount()

      expect(await account.transfer(OPTIONS)).toEqual({
        proposalId: '1',
        hash: 'feedface',
        fee: 5000n,
        confirmations: 0,
        threshold: 1,
        executed: false
      })
    })

    it('includes an ATA creation only when the recipient lacks one', async () => {
      const { account: withAta, sendTransaction: a } = await transferringAccount()
      const { account: without, sendTransaction: b } = await transferringAccount({
        recipientHasAta: false
      })

      await withAta.transfer(OPTIONS)
      await without.transfer(OPTIONS)

      // The inner message is the third field of vaultTransactionCreate's data, after the
      // discriminator, vault index and ephemeral signer count.
      const messageLength = (mock) => {
        const data = mock.mock.calls[0][0].instructions[0].data
        return new DataView(data.buffer).getUint32(10, true)
      }

      expect(messageLength(a)).toBe(150)
      expect(messageLength(b)).toBe(289)
    })

    it('refuses a Token-2022 mint rather than building an unusable transfer', async () => {
      const { account, sendTransaction } = await transferringAccount({
        mintOwner: TOKEN_2022_PROGRAM
      })

      await expect(account.transfer(OPTIONS)).rejects.toThrow(NotSupportedError)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws when the mint does not exist', async () => {
      const { account } = await transferringAccount()
      account._rpc.getMultipleAccounts = () => ({
        send: async () => ({ value: [null, null] })
      })

      await expect(account.transfer(OPTIONS)).rejects.toThrow(/mint .* does not exist/)
    })

    it('refuses when the quote exceeds transferMaxFee', async () => {
      const { account, sendTransaction } = await transferringAccount({
        config: { transferMaxFee: 1000n }
      })

      await expect(account.transfer(OPTIONS)).rejects.toThrow(/maximum fee/)
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('throws on a malformed mint before any RPC call', async () => {
      const { account, sendTransaction } = await transferringAccount()

      await expect(account.transfer({ ...OPTIONS, token: 'nope' })).rejects.toThrow()
      expect(sendTransaction).not.toHaveBeenCalled()
    })

    it('rejects autoExecute as unimplemented', async () => {
      const { account, sendTransaction } = await transferringAccount()

      await expect(account.transfer(OPTIONS, { autoExecute: true })).rejects.toThrow()
      expect(sendTransaction).not.toHaveBeenCalled()
    })
  })
})
