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

import { getBase58Decoder, getBase58Encoder, getBase64Decoder, getBase64Encoder } from '@solana/codecs'

import { NotImplementedError } from '@tetherto/wdk-wallet'

import {
  WalletAccountReadOnlyMultisigSolanaSquads,
  SQUADS_PROGRAM_ADDRESS,
  NotSupportedError
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
 * Serializes a `Multisig` account's data.
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
  timeLock = 0,
  staleTransactionIndex = 0n,
  discriminator = MULTISIG_DISCRIMINATOR,
  slack = 0
}) {
  const size = 95 + (rentCollector ? 32 : 0) + 1 + 4 + members.length * 33 + slack
  const data = new Uint8Array(size)
  const view = new DataView(data.buffer)

  data.set(discriminator, 0)
  view.setUint16(72, threshold, true)
  view.setUint32(74, timeLock, true)
  view.setBigUint64(78, transactionIndex, true)
  view.setBigUint64(86, staleTransactionIndex, true)

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

// Vault PDAs for TEST_MULTISIG_PDA, derived independently of the code under test
// and cross-checked against `getVaultPda` from @sqds/multisig.
const TEST_VAULT_0 = '6soQChwEoXXbAo17wNPdfLFaxzrAjiAxPif9nbJkDXCm'
const TEST_VAULT_3 = '9tyW4GZWSMPZj8KSsVKsVjJvnVaE4mJjsg77TznzQfcs'

/**
 * Builds a read-only account whose RPC returns a fixed `getBalance` result.
 *
 * @param {bigint} lamports - The balance to report.
 * @param {Object} [config] - Extra config for the account.
 * @returns {{ account: WalletAccountReadOnlyMultisigSolanaSquads, getBalance: Function }}
 */
function mockBalanceAccount (lamports, config = { multisigPda: TEST_MULTISIG_PDA }) {
  const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
    provider: TEST_RPC_URL,
    commitment: 'confirmed',
    ...config
  })

  const getBalance = jest.fn(() => ({ send: async () => ({ value: lamports }) }))

  account._rpc = { getBalance }

  return { account, getBalance }
}

// Real mint addresses, and the legacy-SPL associated token accounts they derive to
// under TEST_VAULT_0 / TEST_VAULT_3. Derived with `findAssociatedTokenPda`.
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDC_ATA_VAULT_0 = 'HjTmApEb1hKe9snNpoqkv8HrXaEDSvhEJbsDVtBwZTsA'
const USDC_ATA_VAULT_3 = 'AAd5adJNrMXHupG13WMvDzenYdVua77LEAbnJ89yRBwS'
// A real Token-2022 mint. See the @todo on getTokenBalance.
const TOKEN_2022_MINT = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1'

/**
 * Builds a read-only account whose RPC returns a fixed token account.
 *
 * @param {string|null} amount - The token amount as the RPC reports it, or null for
 *   a non-existent account.
 * @param {Object} [config] - Extra config for the account.
 * @returns {{ account: WalletAccountReadOnlyMultisigSolanaSquads, getAccountInfo: Function }}
 */
function mockTokenAccount (amount, config = { multisigPda: TEST_MULTISIG_PDA }) {
  const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
    provider: TEST_RPC_URL,
    commitment: 'confirmed',
    ...config
  })

  const value = amount === null
    ? null
    : {
        owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        data: { parsed: { info: { tokenAmount: { amount, decimals: 6 } } }, program: 'spl-token' },
        executable: false,
        lamports: 2039280n,
        space: 165n
      }

  const getAccountInfo = jest.fn(() => ({ send: async () => ({ value }) }))

  account._rpc = { getAccountInfo }

  return { account, getAccountInfo }
}

// Proposal PDAs for TEST_MULTISIG_PDA at transaction indices 1..3, cross-checked
// against `getProposalPda` from @sqds/multisig.
const PROPOSAL_PDA_1 = 'AhijzMHF6KLNfJpPvAwVZFDhY55MqPR3DGv1EMGVuKzF'
const PROPOSAL_PDA_2 = '5cA2xHRERqHDFnrsP6M6Mfx9rZ725o1qcQVjtFSq45mZ'
const PROPOSAL_DISCRIMINATOR = [26, 94, 189, 187, 116, 136, 53, 33]

const PROPOSAL_STATUS = {
  Draft: 0,
  Active: 1,
  Rejected: 2,
  Approved: 3,
  Executing: 4,
  Executed: 5,
  Cancelled: 6
}

/**
 * Serializes a `Proposal` account's data.
 *
 * @param {Object} options - The account contents.
 * @param {number} [options.status=1] - The status discriminant.
 * @param {string[]} [options.approved=[]] - Members that approved.
 * @param {string[]} [options.rejected=[]] - Members that rejected.
 * @param {string[]} [options.cancelled=[]] - Members that cancelled.
 * @param {number[]} [options.discriminator] - An override for the discriminator.
 * @param {number} [options.slack=0] - Trailing unused bytes, as Squads pre-allocates.
 * @returns {string} The account data, base64-encoded.
 */
function encodeProposalAccount ({
  status = PROPOSAL_STATUS.Active,
  statusTimestamp = 0n,
  approved = [],
  rejected = [],
  cancelled = [],
  discriminator = PROPOSAL_DISCRIMINATOR,
  slack = 0
}) {
  // The status is a data enum: every variant carries an i64 timestamp except
  // Executing, which carries nothing and so shifts everything after it by 8.
  const statusSize = status === PROPOSAL_STATUS.Executing ? 1 : 9
  const vecs = [approved, rejected, cancelled]
  const size =
    48 + statusSize + 1 +
    vecs.reduce((total, v) => total + 4 + v.length * 32, 0) +
    slack

  const data = new Uint8Array(size)
  const view = new DataView(data.buffer)

  data.set(discriminator, 0)
  data[48] = status

  if (status !== PROPOSAL_STATUS.Executing) {
    view.setBigInt64(49, statusTimestamp, true)
  }

  let offset = 48 + statusSize
  data[offset] = 255 // bump
  offset += 1

  for (const members of vecs) {
    view.setUint32(offset, members.length, true)
    offset += 4
    for (const member of members) {
      data.set(getBase58Encoder().encode(member), offset)
      offset += 32
    }
  }

  return getBase64Decoder().decode(data)
}

/**
 * Builds an RPC `value` for a `Proposal` account owned by the Squads program.
 *
 * @param {Object} options - Passed through to {@link encodeProposalAccount}.
 * @returns {Object} The `value` field of a `getMultipleAccounts` entry.
 */
function proposalAccountValue (options) {
  return {
    owner: SQUADS_PROGRAM_ADDRESS,
    data: [encodeProposalAccount(options), 'base64'],
    executable: false,
    lamports: 2039280n,
    space: 454n
  }
}

/**
 * Builds a read-only account whose RPC serves a multisig and a set of proposals.
 *
 * @param {Array<Object|null>} proposals - The `getMultipleAccounts` entries to return,
 *   in order across all chunks.
 * @param {Object} [multisig] - The multisig account, or null to report it missing.
 * @returns {{ account: WalletAccountReadOnlyMultisigSolanaSquads, getMultipleAccounts: Function, getAccountInfo: Function }}
 */
function mockProposals (proposals, multisig = multisigAccountValue({
  members: [{ address: MEMBER_A }, { address: MEMBER_B }],
  threshold: 2
})) {
  const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
    provider: TEST_RPC_URL,
    commitment: 'confirmed',
    multisigPda: TEST_MULTISIG_PDA
  })

  const getAccountInfo = jest.fn(() => ({ send: async () => ({ value: multisig }) }))
  const remaining = [...proposals]
  const getMultipleAccounts = jest.fn((addresses) => ({
    send: async () => ({ value: remaining.splice(0, addresses.length) })
  }))

  account._rpc = { getAccountInfo, getMultipleAccounts }

  return { account, getMultipleAccounts, getAccountInfo }
}

const VAULT_TRANSACTION_DISCRIMINATOR = [168, 250, 162, 100, 81, 14, 162, 207]
const CONFIG_TRANSACTION_DISCRIMINATOR = [94, 8, 4, 35, 113, 139, 139, 112]
const BATCH_DISCRIMINATOR = [156, 194, 70, 44, 22, 88, 137, 44]
const CLOCK_SYSVAR_ADDRESS = 'SysvarC1ock11111111111111111111111111111111'

/**
 * Builds an RPC `value` for a transaction account, of which only the discriminator
 * is read.
 *
 * @param {number[]} discriminator - The account discriminator.
 * @returns {Object} The `value` field of a `getMultipleAccounts` entry.
 */
function transactionAccountValue (discriminator) {
  const data = new Uint8Array(8)

  data.set(discriminator, 0)

  return {
    owner: SQUADS_PROGRAM_ADDRESS,
    data: [getBase64Decoder().decode(data), 'base64'],
    executable: false,
    lamports: 2039280n,
    space: 8n
  }
}

/**
 * Builds an RPC `value` for the Clock sysvar.
 *
 * @param {bigint} unixTimestamp - The cluster time to report.
 * @returns {Object} The `value` field of a `getMultipleAccounts` entry.
 */
function clockAccountValue (unixTimestamp) {
  const data = new Uint8Array(40)

  new DataView(data.buffer).setBigInt64(32, unixTimestamp, true)

  return {
    owner: 'Sysvar1111111111111111111111111111111111111',
    data: [getBase64Decoder().decode(data), 'base64'],
    executable: false,
    lamports: 1169280n,
    space: 40n
  }
}

/**
 * Builds a read-only account whose RPC serves the four accounts
 * `isReadyToExecute` reads.
 *
 * @param {Object} options - The scenario.
 * @param {number} [options.status=3] - The proposal status discriminant.
 * @param {bigint} [options.approvedAt=1000n] - The proposal's status timestamp.
 * @param {bigint} [options.now=1000n] - The cluster time.
 * @param {number} [options.timeLock=0] - The multisig's time lock, in seconds.
 * @param {bigint} [options.staleTransactionIndex=0n] - The multisig's stale index.
 * @param {number[]} [options.transactionType] - The transaction account discriminator.
 * @param {boolean} [options.proposalExists=true] - Whether the proposal account exists.
 * @param {boolean} [options.transactionExists=true] - Whether the transaction exists.
 * @returns {{ account: WalletAccountReadOnlyMultisigSolanaSquads, getMultipleAccounts: Function }}
 */
function mockExecutable ({
  status = PROPOSAL_STATUS.Approved,
  approvedAt = 1000n,
  now = 1000n,
  timeLock = 0,
  staleTransactionIndex = 0n,
  transactionType = VAULT_TRANSACTION_DISCRIMINATOR,
  proposalExists = true,
  transactionExists = true
} = {}) {
  const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
    provider: TEST_RPC_URL,
    commitment: 'confirmed',
    multisigPda: TEST_MULTISIG_PDA
  })

  const value = [
    multisigAccountValue({
      members: [{ address: MEMBER_A }, { address: MEMBER_B }],
      threshold: 2,
      timeLock,
      staleTransactionIndex
    }),
    proposalExists
      ? proposalAccountValue({ status, statusTimestamp: approvedAt, approved: [MEMBER_A, MEMBER_B] })
      : null,
    transactionExists ? transactionAccountValue(transactionType) : null,
    clockAccountValue(now)
  ]

  const getMultipleAccounts = jest.fn(() => ({ send: async () => ({ value }) }))

  account._rpc = { getMultipleAccounts }

  return { account, getMultipleAccounts }
}

/**
 * Builds a read-only account whose RPC serves a program config and a rent quote.
 *
 * @param {Object} [options] - The scenario.
 * @param {bigint} [options.creationFee=0n] - The protocol's multisig creation fee.
 * @param {bigint} [options.rent=2039280n] - The rent-exempt minimum to report.
 * @param {number[]} [options.discriminator] - An override for the account discriminator.
 * @param {boolean} [options.exists=true] - Whether the program config account exists.
 * @returns {{ account: WalletAccountReadOnlyMultisigSolanaSquads, getAccountInfo: Function, getMinimumBalanceForRentExemption: Function }}
 */
function mockDeployQuote ({
  creationFee = 0n,
  rent = 2039280n,
  discriminator = PROGRAM_CONFIG_DISCRIMINATOR,
  exists = true
} = {}) {
  const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
    provider: TEST_RPC_URL,
    commitment: 'confirmed',
    multisigPda: TEST_MULTISIG_PDA
  })

  // ProgramConfig: discriminator(8) authority(32) multisigCreationFee(u64) treasury(32) reserved(64)
  const data = new Uint8Array(144)

  data.set(discriminator, 0)
  new DataView(data.buffer).setBigUint64(40, creationFee, true)

  const value = exists
    ? {
        owner: SQUADS_PROGRAM_ADDRESS,
        data: [getBase64Decoder().decode(data), 'base64'],
        executable: false,
        lamports: 1893120n,
        space: 144n
      }
    : null

  const getAccountInfo = jest.fn(() => ({ send: async () => ({ value }) }))
  const getMinimumBalanceForRentExemption = jest.fn(() => ({ send: async () => rent }))

  account._rpc = { getAccountInfo, getMinimumBalanceForRentExemption }

  return { account, getAccountInfo, getMinimumBalanceForRentExemption }
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
    it('returns address, owners, masks, threshold and isCreated from one read', async () => {
      const { account, getAccountInfo } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A }, { address: MEMBER_B }],
        threshold: 2
      }))

      expect(await account.getMultisigInfo()).toEqual({
        address: TEST_MULTISIG_PDA,
        owners: [MEMBER_A, MEMBER_B],
        masks: [7, 7],
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
        masks: [7, 7],
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

      const { owners, masks, threshold } = await account.getMultisigInfo()

      expect(owners).toEqual([MEMBER_A, MEMBER_B])
      // 2 owners but only 1 voter, so this is a 1-of-1 despite owners.length === 2.
      expect(threshold).toBe(1)
      // The masks are the only way a caller can tell: mask 6 votes, mask 5 does not.
      expect(masks).toEqual([6, 5])
      expect(masks.filter((mask) => mask & 2)).toHaveLength(1)
    })

    it('keeps masks positionally aligned with owners', async () => {
      const { account } = mockAccount(multisigAccountValue({
        members: [{ address: MEMBER_A, mask: 3 }, { address: MEMBER_B, mask: 7 }],
        threshold: 1
      }))

      const { owners, masks } = await account.getMultisigInfo()

      expect(masks).toHaveLength(owners.length)
      expect(masks[owners.indexOf(MEMBER_A)]).toBe(3)
      expect(masks[owners.indexOf(MEMBER_B)]).toBe(7)
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
        masks: [],
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

  describe('getProposals', () => {
    it('returns a proposal with its confirmations and the multisig threshold', async () => {
      const { account } = mockProposals([
        proposalAccountValue({ approved: [MEMBER_A, MEMBER_B] })
      ])

      expect(await account.getProposals([1])).toMatchObject([
        { proposalId: '1', confirmations: 2, threshold: 2 }
      ])
    })

    it('reports the Squads status name', async () => {
      for (const [name, status] of Object.entries(PROPOSAL_STATUS)) {
        const { account } = mockProposals([proposalAccountValue({ status, approved: [MEMBER_A] })])
        const [proposal] = await account.getProposals([1])

        expect(proposal.status).toBe(name)
      }
    })

    it('lists who voted, each way', async () => {
      const { account } = mockProposals([
        proposalAccountValue({ approved: [MEMBER_A], rejected: [MEMBER_B] })
      ])
      const [proposal] = await account.getProposals([1])

      expect(proposal.approved).toEqual([MEMBER_A])
      expect(proposal.rejected).toEqual([MEMBER_B])
      expect(proposal.cancelled).toEqual([])
      // confirmations counts approvals only, not votes cast.
      expect(proposal.confirmations).toBe(1)
    })

    it('derives the proposal address from the transaction index', async () => {
      const { account, getMultipleAccounts } = mockProposals([
        proposalAccountValue({}),
        proposalAccountValue({})
      ])

      await account.getProposals([1, 2])

      expect(getMultipleAccounts).toHaveBeenCalledWith(
        [PROPOSAL_PDA_1, PROPOSAL_PDA_2],
        expect.anything()
      )
    })

    it('returns null for an id with no proposal, keeping positions aligned', async () => {
      const { account } = mockProposals([
        proposalAccountValue({ approved: [MEMBER_A] }),
        null,
        proposalAccountValue({ approved: [MEMBER_A, MEMBER_B] })
      ])

      const proposals = await account.getProposals([1, 2, 3])

      expect(proposals).toMatchObject([
        { proposalId: '1', confirmations: 1, threshold: 2 },
        null,
        { proposalId: '3', confirmations: 2, threshold: 2 }
      ])
    })

    it('counts approvals correctly for an Executing proposal', async () => {
      // Executing is the only status carrying no timestamp, so everything after it
      // shifts 8 bytes. It is transient on chain, so only a synthetic test hits it.
      const { account } = mockProposals([
        proposalAccountValue({
          status: PROPOSAL_STATUS.Executing,
          approved: [MEMBER_A, MEMBER_B]
        })
      ])

      expect(await account.getProposals([1])).toMatchObject([
        { proposalId: '1', confirmations: 2, threshold: 2, status: 'Executing' }
      ])
    })

    it('counts approvals correctly for every other status', async () => {
      for (const [name, status] of Object.entries(PROPOSAL_STATUS)) {
        if (status === PROPOSAL_STATUS.Executing) continue

        const { account } = mockProposals([
          proposalAccountValue({ status, approved: [MEMBER_A] })
        ])

        expect(await account.getProposals([1])).toMatchObject([
          { proposalId: '1', confirmations: 1, threshold: 2, status: name }
        ])
        expect(name).toBeTruthy()
      }
    })

    it('reports zero confirmations for a rejected-only proposal', async () => {
      // Indistinguishable from an untouched proposal through MultisigProposal.
      const { account } = mockProposals([
        proposalAccountValue({ approved: [], rejected: [MEMBER_A] })
      ])

      expect(await account.getProposals([1])).toMatchObject([
        { proposalId: '1', confirmations: 0, threshold: 2 }
      ])
    })

    it('ignores pre-allocated slack after the vectors', async () => {
      const { account } = mockProposals([
        proposalAccountValue({ approved: [MEMBER_A], slack: 320 })
      ])

      expect(await account.getProposals([1])).toMatchObject([
        { proposalId: '1', confirmations: 1, threshold: 2 }
      ])
    })

    it('accepts ids as number, bigint and string', async () => {
      const { account } = mockProposals([
        proposalAccountValue({}),
        proposalAccountValue({}),
        proposalAccountValue({})
      ])

      const proposals = await account.getProposals([1, 2n, '3'])

      expect(proposals.map((p) => p.proposalId)).toEqual(['1', '2', '3'])
    })

    it('returns null rather than decoding another Squads account type', async () => {
      const { account } = mockProposals([
        proposalAccountValue({ discriminator: MULTISIG_DISCRIMINATOR })
      ])

      expect(await account.getProposals([1])).toEqual([null])
    })

    it('returns null when the account is owned by another program', async () => {
      const { account } = mockProposals([
        { ...proposalAccountValue({}), owner: SYSTEM_PROGRAM_ADDRESS }
      ])

      expect(await account.getProposals([1])).toEqual([null])
    })

    it('chunks requests at 100 addresses', async () => {
      const proposals = Array.from({ length: 150 }, () => proposalAccountValue({ approved: [MEMBER_A] }))
      const { account, getMultipleAccounts } = mockProposals(proposals)

      const result = await account.getProposals(Array.from({ length: 150 }, (_, i) => i + 1))

      expect(result).toHaveLength(150)
      expect(getMultipleAccounts).toHaveBeenCalledTimes(2)
      expect(getMultipleAccounts.mock.calls[0][0]).toHaveLength(100)
      expect(getMultipleAccounts.mock.calls[1][0]).toHaveLength(50)
    })

    it('reads many proposals without one request per id', async () => {
      const proposals = Array.from({ length: 40 }, () => proposalAccountValue({}))
      const { account, getMultipleAccounts, getAccountInfo } = mockProposals(proposals)

      await account.getProposals(Array.from({ length: 40 }, (_, i) => i + 1))

      expect(getMultipleAccounts).toHaveBeenCalledTimes(1)
      expect(getAccountInfo).toHaveBeenCalledTimes(1)
    })

    it('returns an empty array without any RPC call', async () => {
      const { account, getMultipleAccounts, getAccountInfo } = mockProposals([])

      expect(await account.getProposals([])).toEqual([])
      expect(getMultipleAccounts).not.toHaveBeenCalled()
      expect(getAccountInfo).not.toHaveBeenCalled()
    })

    it('throws naming the offending id', async () => {
      const { account } = mockProposals([proposalAccountValue({})])

      for (const bad of [-1, 1.5, 'abc']) {
        await expect(account.getProposals([bad])).rejects.toThrow(
          new RegExp(`Invalid proposal id ${bad === 'abc' ? 'abc' : bad}`.replace('.', '\\.'))
        )
      }
    })

    it('throws when the multisig does not exist', async () => {
      const { account } = mockProposals([], null)

      await expect(account.getProposals([1])).rejects.toThrow(/does not exist/)
    })

    it('propagates RPC failures', async () => {
      const { account } = mockProposals([proposalAccountValue({})])
      account._rpc.getMultipleAccounts = () => ({
        send: async () => { throw new Error('503 Service Unavailable') }
      })

      await expect(account.getProposals([1])).rejects.toThrow('503 Service Unavailable')
    })
  })

  describe('isReadyToExecute', () => {
    it('returns true for an approved proposal with no time lock', async () => {
      const { account } = mockExecutable()

      expect(await account.isReadyToExecute(1)).toBe(true)
    })

    it('returns false for every status other than approved', async () => {
      for (const [name, status] of Object.entries(PROPOSAL_STATUS)) {
        if (status === PROPOSAL_STATUS.Approved) continue

        const { account } = mockExecutable({ status })

        expect(await account.isReadyToExecute(1)).toBe(false)
        expect(name).toBeTruthy()
      }
    })

    it('returns false while the time lock has not elapsed', async () => {
      const { account } = mockExecutable({ approvedAt: 1000n, now: 1059n, timeLock: 60 })

      expect(await account.isReadyToExecute(1)).toBe(false)
    })

    it('returns true the moment the time lock elapses', async () => {
      // The program compares with >=, so the boundary second counts as released.
      const { account } = mockExecutable({ approvedAt: 1000n, now: 1060n, timeLock: 60 })

      expect(await account.isReadyToExecute(1)).toBe(true)
    })

    it('returns true for a stale approved vault transaction', async () => {
      // vault_transaction_execute performs no staleness check: a vault proposal
      // approved before going stale stays executable.
      const { account } = mockExecutable({
        transactionType: VAULT_TRANSACTION_DISCRIMINATOR,
        staleTransactionIndex: 100n
      })

      expect(await account.isReadyToExecute(1)).toBe(true)
    })

    it('returns false for a stale approved config transaction', async () => {
      // config_transaction_execute does check staleness.
      const { account } = mockExecutable({
        transactionType: CONFIG_TRANSACTION_DISCRIMINATOR,
        staleTransactionIndex: 100n
      })

      expect(await account.isReadyToExecute(1)).toBe(false)
    })

    it('returns true for a config transaction that is not stale', async () => {
      const { account } = mockExecutable({
        transactionType: CONFIG_TRANSACTION_DISCRIMINATOR,
        staleTransactionIndex: 0n
      })

      expect(await account.isReadyToExecute(1)).toBe(true)
    })

    it('returns true for a stale approved batch', async () => {
      // batch_execute_transaction performs no staleness check either.
      const { account } = mockExecutable({
        transactionType: BATCH_DISCRIMINATOR,
        staleTransactionIndex: 100n
      })

      expect(await account.isReadyToExecute(1)).toBe(true)
    })

    it('treats an index equal to the stale index as stale for config transactions', async () => {
      // The program requires transaction_index > stale_transaction_index.
      const { account } = mockExecutable({
        transactionType: CONFIG_TRANSACTION_DISCRIMINATOR,
        staleTransactionIndex: 5n
      })

      expect(await account.isReadyToExecute(5)).toBe(false)
      expect(await account.isReadyToExecute(6)).toBe(true)
    })

    it('returns false when the proposal does not exist', async () => {
      const { account } = mockExecutable({ proposalExists: false })

      expect(await account.isReadyToExecute(1)).toBe(false)
    })

    it('returns false when the transaction account does not exist', async () => {
      const { account } = mockExecutable({ transactionExists: false })

      expect(await account.isReadyToExecute(1)).toBe(false)
    })

    it('returns false rather than decoding another account type as a proposal', async () => {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      account._rpc = {
        getMultipleAccounts: () => ({
          send: async () => ({
            value: [
              multisigAccountValue({ members: [{ address: MEMBER_A }] }),
              proposalAccountValue({
                status: PROPOSAL_STATUS.Approved,
                discriminator: MULTISIG_DISCRIMINATOR
              }),
              transactionAccountValue(VAULT_TRANSACTION_DISCRIMINATOR),
              clockAccountValue(1000n)
            ]
          })
        })
      }

      expect(await account.isReadyToExecute(1)).toBe(false)
    })

    it('reads the multisig, proposal, transaction and clock in one request', async () => {
      const { account, getMultipleAccounts } = mockExecutable()

      await account.isReadyToExecute(1)

      expect(getMultipleAccounts).toHaveBeenCalledTimes(1)

      const [addresses] = getMultipleAccounts.mock.calls[0]

      expect(addresses).toHaveLength(4)
      expect(addresses[0]).toBe(TEST_MULTISIG_PDA)
      expect(addresses[1]).toBe(PROPOSAL_PDA_1)
      expect(addresses[3]).toBe(CLOCK_SYSVAR_ADDRESS)
      // The transaction account is a different PDA from the proposal.
      expect(addresses[2]).not.toBe(PROPOSAL_PDA_1)
    })

    it('accepts ids as number, bigint and string', async () => {
      const { account } = mockExecutable()

      expect(await account.isReadyToExecute(1)).toBe(true)
      expect(await account.isReadyToExecute(1n)).toBe(true)
      expect(await account.isReadyToExecute('1')).toBe(true)
    })

    it('throws on an invalid id', async () => {
      const { account, getMultipleAccounts } = mockExecutable()

      await expect(account.isReadyToExecute(-1)).rejects.toThrow(/Invalid proposal id/)
      expect(getMultipleAccounts).not.toHaveBeenCalled()
    })

    it('propagates RPC failures', async () => {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      account._rpc = {
        getMultipleAccounts: () => ({
          send: async () => { throw new Error('503 Service Unavailable') }
        })
      }

      await expect(account.isReadyToExecute(1)).rejects.toThrow('503 Service Unavailable')
    })
  })

  describe('getTransactionReceipt', () => {
    // A well-formed 64-byte signature, and a 32-byte address that must be rejected.
    const SIGNATURE = getBase58Decoder().decode(new Uint8Array(64).fill(7))
    const RECEIPT = {
      blockTime: 1785346451n,
      slot: 435990582n,
      version: 0n,
      transactionIndex: 12n,
      meta: { err: null, fee: 6890n },
      transaction: { signatures: [SIGNATURE] }
    }

    /**
     * Builds an account whose RPC returns a fixed `getTransaction` result.
     *
     * @param {Object|null} value - The receipt to return.
     * @param {Object} [config] - Extra config for the account.
     * @returns {{ account: WalletAccountReadOnlyMultisigSolanaSquads, getTransaction: Function }}
     */
    function mockReceipt (value, config = {}) {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA,
        ...config
      })

      const getTransaction = jest.fn(() => ({ send: async () => value }))

      account._rpc = { getTransaction }

      return { account, getTransaction }
    }

    it('returns the receipt unchanged', async () => {
      const { account } = mockReceipt(RECEIPT)

      expect(await account.getTransactionReceipt(SIGNATURE)).toBe(RECEIPT)
    })

    it('returns null when the transaction is not found', async () => {
      const { account } = mockReceipt(null)

      expect(await account.getTransactionReceipt(SIGNATURE)).toBeNull()
    })

    it('returns the receipt of a failed transaction rather than throwing', async () => {
      // A failed transaction is still in a block and still has a receipt; callers
      // must check meta.err themselves.
      const failed = { ...RECEIPT, meta: { err: { InstructionError: [0, 'Custom'] }, fee: 5000n } }
      const { account } = mockReceipt(failed)

      const receipt = await account.getTransactionReceipt(SIGNATURE)

      expect(receipt).toBe(failed)
      expect(receipt.meta.err).not.toBeNull()
    })

    it('requests support for versioned transactions', async () => {
      // Squads executes v0 transactions; without this the RPC refuses them outright,
      // so the method would fail on exactly the transactions it exists to report on.
      const { account, getTransaction } = mockReceipt(RECEIPT)

      await account.getTransactionReceipt(SIGNATURE)

      expect(getTransaction).toHaveBeenCalledWith(
        SIGNATURE,
        expect.objectContaining({ maxSupportedTransactionVersion: 0 })
      )
    })

    it('raises a processed commitment to confirmed', async () => {
      // getTransaction rejects anything below confirmed.
      const { account, getTransaction } = mockReceipt(RECEIPT, { commitment: 'processed' })

      await account.getTransactionReceipt(SIGNATURE)

      expect(getTransaction).toHaveBeenCalledWith(
        SIGNATURE,
        expect.objectContaining({ commitment: 'confirmed' })
      )
    })

    it('does not lower a finalized commitment', async () => {
      const { account, getTransaction } = mockReceipt(RECEIPT, { commitment: 'finalized' })

      await account.getTransactionReceipt(SIGNATURE)

      expect(getTransaction).toHaveBeenCalledWith(
        SIGNATURE,
        expect.objectContaining({ commitment: 'finalized' })
      )
    })

    it('throws on a malformed signature without hitting the RPC', async () => {
      const { account, getTransaction } = mockReceipt(RECEIPT)

      await expect(account.getTransactionReceipt('nope')).rejects.toThrow(/Invalid transaction signature/)
      expect(getTransaction).not.toHaveBeenCalled()
    })

    it('throws on an empty signature', async () => {
      const { account } = mockReceipt(RECEIPT)

      await expect(account.getTransactionReceipt('')).rejects.toThrow(/Invalid transaction signature/)
    })

    it('rejects a 32-byte address passed as a signature', async () => {
      // Valid base58, wrong length — the mistake a caller is most likely to make.
      const { account, getTransaction } = mockReceipt(RECEIPT)

      await expect(account.getTransactionReceipt(TEST_MULTISIG_PDA)).rejects.toThrow(/Invalid transaction signature/)
      expect(getTransaction).not.toHaveBeenCalled()
    })

    it('propagates RPC failures', async () => {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      account._rpc = {
        getTransaction: () => ({ send: async () => { throw new Error('503 Service Unavailable') } })
      }

      await expect(account.getTransactionReceipt(SIGNATURE)).rejects.toThrow('503 Service Unavailable')
    })
  })

  describe('getTokenBalance', () => {
    it('returns the token amount as a bigint', async () => {
      const { account } = mockTokenAccount('51448811')

      const balance = await account.getTokenBalance(USDC_MINT)

      expect(balance).toBe(51448811n)
      expect(typeof balance).toBe('bigint')
    })

    it('reads the vault\'s associated token account', async () => {
      const { account, getAccountInfo } = mockTokenAccount('0')

      await account.getTokenBalance(USDC_MINT)

      expect(getAccountInfo).toHaveBeenCalledWith(
        USDC_ATA_VAULT_0,
        expect.objectContaining({ encoding: 'jsonParsed' })
      )
    })

    it('returns 0n when no associated token account exists', async () => {
      const { account } = mockTokenAccount(null)

      expect(await account.getTokenBalance(USDC_MINT)).toBe(0n)
    })

    it('returns 0n for an existing account holding nothing', async () => {
      const { account } = mockTokenAccount('0')

      expect(await account.getTokenBalance(USDC_MINT)).toBe(0n)
    })

    it('preserves amounts beyond Number.MAX_SAFE_INTEGER', async () => {
      // The RPC reports the amount as a decimal string precisely so it can exceed
      // what a JS number holds.
      const { account } = mockTokenAccount('18446744073709551615')

      expect(await account.getTokenBalance(USDC_MINT)).toBe(18446744073709551615n)
    })

    it('reads the token account of a vault selected by index', async () => {
      const { account, getAccountInfo } = mockTokenAccount('7')

      expect(await account.getTokenBalance(USDC_MINT, 3)).toBe(7n)
      expect(getAccountInfo).toHaveBeenCalledWith(USDC_ATA_VAULT_3, expect.anything())
    })

    it('queries a different account per mint, and never the vault itself', async () => {
      const { account, getAccountInfo } = mockTokenAccount('0')

      await account.getTokenBalance(USDC_MINT)
      await account.getTokenBalance(TOKEN_2022_MINT)

      const [[first], [second]] = getAccountInfo.mock.calls

      expect(first).not.toBe(second)
      // Tokens live in a token account owned by the vault, not in the vault.
      expect([first, second]).not.toContain(TEST_VAULT_0)
      expect([first, second]).not.toContain(TEST_MULTISIG_PDA)
    })

    it('throws on a malformed mint without hitting the RPC', async () => {
      const { account, getAccountInfo } = mockTokenAccount('0')

      await expect(account.getTokenBalance('not-a-mint')).rejects.toThrow()
      expect(getAccountInfo).not.toHaveBeenCalled()
    })

    it('rejects an out-of-range vault index before hitting the RPC', async () => {
      const { account, getAccountInfo } = mockTokenAccount('0')

      await expect(account.getTokenBalance(USDC_MINT, 256)).rejects.toThrow(/Invalid vault index/)
      expect(getAccountInfo).not.toHaveBeenCalled()
    })

    it('reports the mint problem first when both arguments are invalid', async () => {
      // The mint is validated up front, so a caller fixing errors one at a time is
      // told about the argument they passed first rather than the second.
      const { account } = mockTokenAccount('0')

      await expect(account.getTokenBalance('not-a-mint', 256))
        .rejects.toThrow(/base58/)
    })

    it('propagates RPC failures', async () => {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      account._rpc = {
        getAccountInfo: () => ({ send: async () => { throw new Error('503 Service Unavailable') } })
      }

      await expect(account.getTokenBalance(USDC_MINT)).rejects.toThrow('503 Service Unavailable')
    })

    it('resolves a Token-2022 mint to a legacy address — known limitation', async () => {
      // Documents the @todo rather than asserting desired behaviour: the derivation
      // uses the SPL Token program, so a Token-2022 mint yields an address that does
      // not hold the real balance. Delete this test when Token-2022 is supported.
      const { account, getAccountInfo } = mockTokenAccount(null)

      expect(await account.getTokenBalance(TOKEN_2022_MINT)).toBe(0n)

      const [queried] = getAccountInfo.mock.calls[0]
      expect(queried).toBe('mKKRTmYrT4YywefDUvszdEqz7nm1oddDd6QRXn1snfz')
    })
  })

  describe('getVaultAddress', () => {
    it('derives vault 0 by default', async () => {
      const { account } = mockBalanceAccount(0n)

      expect(await account.getVaultAddress()).toBe(TEST_VAULT_0)
    })

    it('is not the multisig address', async () => {
      // The multisig account holds only its rent; funds live in the vault.
      const { account } = mockBalanceAccount(0n)

      expect(await account.getVaultAddress()).not.toBe(TEST_MULTISIG_PDA)
    })

    it('derives a vault by index', async () => {
      const { account } = mockBalanceAccount(0n)

      expect(await account.getVaultAddress(3)).toBe(TEST_VAULT_3)
      expect(await account.getVaultAddress(3)).not.toBe(TEST_VAULT_0)
    })

    it('accepts an address and returns it as given', async () => {
      const { account } = mockBalanceAccount(0n)

      expect(await account.getVaultAddress(TEST_VAULT_3)).toBe(TEST_VAULT_3)
    })

    it('accepts the full u8 index range', async () => {
      const { account } = mockBalanceAccount(0n)

      await expect(account.getVaultAddress(255)).resolves.toEqual(expect.any(String))
    })

    it('rejects an index above the u8 range', async () => {
      const { account } = mockBalanceAccount(0n)

      await expect(account.getVaultAddress(256)).rejects.toThrow(/Invalid vault index/)
    })

    it('rejects a negative or fractional index', async () => {
      const { account } = mockBalanceAccount(0n)

      await expect(account.getVaultAddress(-1)).rejects.toThrow(/Invalid vault index/)
      await expect(account.getVaultAddress(1.5)).rejects.toThrow(/Invalid vault index/)
    })

    it('rejects a malformed address', async () => {
      const { account } = mockBalanceAccount(0n)

      await expect(account.getVaultAddress('not-an-address')).rejects.toThrow()
    })
  })

  describe('getBalance', () => {
    it('reads the vault address, not the multisig address', async () => {
      // The only assertion here that catches reading the wrong account: every
      // other test in this block passes with the multisig address substituted.
      const { account, getBalance } = mockBalanceAccount(51000001n)

      await account.getBalance()

      expect(getBalance).toHaveBeenCalledWith(TEST_VAULT_0, { commitment: 'confirmed' })
      expect(getBalance).not.toHaveBeenCalledWith(TEST_MULTISIG_PDA, expect.anything())
    })

    it('returns the balance as a bigint', async () => {
      const { account } = mockBalanceAccount(51000001n)

      const balance = await account.getBalance()

      expect(balance).toBe(51000001n)
      expect(typeof balance).toBe('bigint')
    })

    it('returns 0n for an unfunded vault that has no account', async () => {
      // Most vaults do not exist on chain; the RPC reports 0 rather than erroring,
      // and that is the correct balance rather than a placeholder.
      const { account } = mockBalanceAccount(0n)

      expect(await account.getBalance()).toBe(0n)
    })

    it('preserves values beyond Number.MAX_SAFE_INTEGER', async () => {
      const { account } = mockBalanceAccount(18446744073709551615n)

      expect(await account.getBalance()).toBe(18446744073709551615n)
    })

    it('reads a vault selected by index', async () => {
      const { account, getBalance } = mockBalanceAccount(7n)

      expect(await account.getBalance(3)).toBe(7n)
      expect(getBalance).toHaveBeenCalledWith(TEST_VAULT_3, { commitment: 'confirmed' })
    })

    it('reads a vault selected by address', async () => {
      const { account, getBalance } = mockBalanceAccount(7n)

      await account.getBalance(TEST_VAULT_3)

      expect(getBalance).toHaveBeenCalledWith(TEST_VAULT_3, { commitment: 'confirmed' })
    })

    it('rejects an out-of-range index before hitting the RPC', async () => {
      const { account, getBalance } = mockBalanceAccount(0n)

      await expect(account.getBalance(256)).rejects.toThrow(/Invalid vault index/)
      expect(getBalance).not.toHaveBeenCalled()
    })

    it('propagates RPC failures', async () => {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      account._rpc = {
        getBalance: () => ({ send: async () => { throw new Error('503 Service Unavailable') } })
      }

      await expect(account.getBalance()).rejects.toThrow('503 Service Unavailable')
    })
  })

  describe('quoteDeploy', () => {
    it('sums rent, creation fee and the two-signature base fee', async () => {
      const { account } = mockDeployQuote({ rent: 2039280n, creationFee: 0n })

      // 2039280 rent + 0 fee + 2 x 5000 signatures
      expect(await account.quoteDeploy()).toEqual({ fee: 2049280n })
    })

    it('includes a non-zero creation fee', async () => {
      // The mainnet fee is currently 0, so this is the only case that catches an
      // implementation ignoring the program config.
      const { account } = mockDeployQuote({ rent: 2039280n, creationFee: 100000000n })

      expect(await account.quoteDeploy()).toEqual({ fee: 102049280n })
    })

    it('requests rent for the size the member count implies', async () => {
      const { account, getMinimumBalanceForRentExemption } = mockDeployQuote()

      await account.quoteDeploy(3)

      // 132 base + 3 x 33 per member
      expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(231n)
    })

    it('quotes a single member by default', async () => {
      const { account, getMinimumBalanceForRentExemption } = mockDeployQuote()

      await account.quoteDeploy()

      expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(165n)
    })

    it('reads the creation fee from the program config account', async () => {
      const { account, getAccountInfo } = mockDeployQuote()

      await account.quoteDeploy()

      // Derived PDA for ["multisig", "program_config"], not a hardcoded fee.
      expect(getAccountInfo).toHaveBeenCalledWith(
        'BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr',
        expect.anything()
      )
    })

    it('returns a bigint', async () => {
      const { account } = mockDeployQuote()

      expect(typeof (await account.quoteDeploy()).fee).toBe('bigint')
    })

    it('throws when the program config does not exist', async () => {
      const { account } = mockDeployQuote({ exists: false })

      await expect(account.quoteDeploy()).rejects.toThrow(/program config/)
    })

    it('throws rather than reading a fee from another account type', async () => {
      const { account } = mockDeployQuote({ discriminator: MULTISIG_DISCRIMINATOR })

      await expect(account.quoteDeploy()).rejects.toThrow(/program config/)
    })

    it('rejects an out-of-range member count before hitting the RPC', async () => {
      const { account, getAccountInfo } = mockDeployQuote()

      for (const bad of [0, -1, 1.5, 65536]) {
        await expect(account.quoteDeploy(bad)).rejects.toThrow(/Invalid member count/)
      }

      expect(getAccountInfo).not.toHaveBeenCalled()
    })

    it('accepts the full member range', async () => {
      const { account } = mockDeployQuote()

      await expect(account.quoteDeploy(65535)).resolves.toEqual(expect.any(Object))
    })

    it('propagates RPC failures', async () => {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      account._rpc = {
        getAccountInfo: () => ({ send: async () => { throw new Error('503 Service Unavailable') } }),
        getMinimumBalanceForRentExemption: () => ({ send: async () => 0n })
      }

      await expect(account.quoteDeploy()).rejects.toThrow('503 Service Unavailable')
    })
  })

  describe('quoteSendTransaction', () => {
    const TX = { to: MEMBER_C, value: 1000000n }

    /**
     * Builds an account serving a multisig and real rent-exempt minimums.
     *
     * @param {number} memberCount - How many members the multisig holds.
     * @returns {{ account: WalletAccountReadOnlyMultisigSolanaSquads, getMinimumBalanceForRentExemption: Function }}
     */
    function mockQuote (memberCount) {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        commitment: 'confirmed',
        multisigPda: TEST_MULTISIG_PDA
      })

      const members = [MEMBER_A, MEMBER_B, MEMBER_C]
        .slice(0, memberCount)
        .map((address) => ({ address }))

      const getAccountInfo = jest.fn(() => ({
        send: async () => ({ value: multisigAccountValue({ members, threshold: 1 }) })
      }))
      // The real rent formula: (128 + size) * 6960 lamports.
      const getMinimumBalanceForRentExemption = jest.fn((size) => ({
        send: async () => (128n + size) * 6960n
      }))

      account._rpc = { getAccountInfo, getMinimumBalanceForRentExemption }

      return { account, getMinimumBalanceForRentExemption }
    }

    it('sums transaction rent, proposal rent and one signature', async () => {
      const { account } = mockQuote(2)

      // 221 B tx rent + 262 B proposal rent + 5000
      expect(await account.quoteSendTransaction(TX)).toEqual({ fee: 5148440n })
    })

    it('scales with the member count', async () => {
      const { account: two } = mockQuote(2)
      const { account: three } = mockQuote(3)

      const a = (await two.quoteSendTransaction(TX)).fee
      const b = (await three.quoteSendTransaction(TX)).fee

      expect(b).toBeGreaterThan(a)
      // One more member adds 96 bytes of proposal rent.
      expect(b - a).toBe(96n * 6960n)
    })

    it('sizes the transaction account from the message, not a constant', async () => {
      const { account, getMinimumBalanceForRentExemption } = mockQuote(2)

      await account.quoteSendTransaction(TX)

      // 83 base + 4 ephemeral prefix + 134 message
      expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(221n)
    })

    it('sizes the proposal account as 70 + 96 per member', async () => {
      const { account, getMinimumBalanceForRentExemption } = mockQuote(3)

      await account.quoteSendTransaction(TX)

      expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(358n)
    })

    it('charges one signature, not two', async () => {
      // Creating the transaction and its proposal share a single transaction, unlike
      // multisigCreateV2 which needs the createKey to sign as well.
      const { account } = mockQuote(2)

      const { fee } = await account.quoteSendTransaction(TX)
      const rent = (128n + 221n) * 6960n + (128n + 262n) * 6960n

      expect(fee - rent).toBe(5000n)
    })

    it('throws on a malformed recipient', async () => {
      const { account } = mockQuote(2)

      await expect(account.quoteSendTransaction({ to: 'nope', value: 1n })).rejects.toThrow()
    })

    it('throws when the multisig does not exist', async () => {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      account._rpc = {
        getAccountInfo: () => ({ send: async () => ({ value: null }) }),
        getMinimumBalanceForRentExemption: () => ({ send: async () => 0n })
      }

      await expect(account.quoteSendTransaction(TX)).rejects.toThrow(/does not exist/)
    })

    it('quotes the multisig named in a config override', async () => {
      const { account } = mockQuote(2)
      const shared = account._rpc

      const { fee } = await account.quoteSendTransaction(TX, { multisigPda: TEST_DERIVED_PDA })

      // The override reuses this account's RPC, so the mock still serves it.
      expect(shared.getAccountInfo).toHaveBeenCalled()
      expect(typeof fee).toBe('bigint')
    })

    it('propagates RPC failures', async () => {
      const { account } = mockQuote(2)
      account._rpc.getMinimumBalanceForRentExemption = () => ({
        send: async () => { throw new Error('503 Service Unavailable') }
      })

      await expect(account.quoteSendTransaction(TX)).rejects.toThrow('503 Service Unavailable')
    })
  })

  describe('quoteTransfer', () => {
    const OPTIONS = { token: USDC_MINT, recipient: MEMBER_C, amount: 1000000n }

    /**
     * Builds an account serving a multisig, an ATA lookup and real rent minimums.
     *
     * @param {Object} [options] - The scenario.
     * @param {number} [options.memberCount=2] - How many members the multisig holds.
     * @param {boolean} [options.recipientAtaExists=true] - Whether the recipient holds the token.
     * @returns {{ account: WalletAccountReadOnlyMultisigSolanaSquads, getAccountInfo: Function, getMinimumBalanceForRentExemption: Function }}
     */
    function mockTransferQuote ({ memberCount = 2, recipientAtaExists = true } = {}) {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        commitment: 'confirmed',
        multisigPda: TEST_MULTISIG_PDA
      })

      const members = [MEMBER_A, MEMBER_B, MEMBER_C]
        .slice(0, memberCount)
        .map((address) => ({ address }))

      const getAccountInfo = jest.fn((queried) => ({
        send: async () => {
          if (queried === TEST_MULTISIG_PDA) {
            return { value: multisigAccountValue({ members, threshold: 1 }) }
          }

          // Anything else is the recipient's associated token account. Only its
          // existence matters here, not its contents.
          return {
            value: recipientAtaExists
              ? { owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', data: ['', 'base64'], space: 165n, lamports: 2039280n, executable: false }
              : null
          }
        }
      }))
      const getMinimumBalanceForRentExemption = jest.fn((size) => ({
        send: async () => (128n + size) * 6960n
      }))

      account._rpc = { getAccountInfo, getMinimumBalanceForRentExemption }

      return { account, getAccountInfo, getMinimumBalanceForRentExemption }
    }

    it('quotes a transfer to a recipient that already holds the token', async () => {
      const { account } = mockTransferQuote({ memberCount: 2 })

      // 251 B tx rent + 262 B proposal rent + 5000
      expect(await account.quoteTransfer(OPTIONS)).toEqual({ fee: 5357240n })
    })

    it('quotes more when the recipient token account must be created', async () => {
      const { account } = mockTransferQuote({ memberCount: 2, recipientAtaExists: false })

      // 395 B tx rent instead of 251 B
      expect(await account.quoteTransfer(OPTIONS)).toEqual({ fee: 6359480n })
    })

    it('sizes the transaction account from the branch it observed', async () => {
      const { account: withAta, getMinimumBalanceForRentExemption: a } = mockTransferQuote()
      const { account: without, getMinimumBalanceForRentExemption: b } = mockTransferQuote({
        recipientAtaExists: false
      })

      await withAta.quoteTransfer(OPTIONS)
      await without.quoteTransfer(OPTIONS)

      // 83 + 4 + 164, versus 83 + 4 + 308
      expect(a).toHaveBeenCalledWith(251n)
      expect(b).toHaveBeenCalledWith(395n)
    })

    it('scales with the member count', async () => {
      const { account: two } = mockTransferQuote({ memberCount: 2 })
      const { account: three } = mockTransferQuote({ memberCount: 3 })

      const diff = (await three.quoteTransfer(OPTIONS)).fee - (await two.quoteTransfer(OPTIONS)).fee

      expect(diff).toBe(96n * 6960n)
    })

    it('queries the recipient token account, not the recipient address', async () => {
      const { account, getAccountInfo } = mockTransferQuote()

      await account.quoteTransfer(OPTIONS)

      const queried = getAccountInfo.mock.calls.map(([addr]) => addr)

      expect(queried).toContain(TEST_MULTISIG_PDA)
      expect(queried).not.toContain(MEMBER_C)
      expect(queried).toHaveLength(2)
    })

    it('charges one signature, not two', async () => {
      const { account } = mockTransferQuote({ memberCount: 2 })

      const { fee } = await account.quoteTransfer(OPTIONS)
      const rent = (128n + 251n) * 6960n + (128n + 262n) * 6960n

      expect(fee - rent).toBe(5000n)
    })

    it('throws on a malformed mint or recipient before any RPC call', async () => {
      const { account, getAccountInfo } = mockTransferQuote()

      await expect(account.quoteTransfer({ ...OPTIONS, token: 'nope' })).rejects.toThrow()
      await expect(account.quoteTransfer({ ...OPTIONS, recipient: 'nope' })).rejects.toThrow()
      expect(getAccountInfo).not.toHaveBeenCalled()
    })

    it('throws when the multisig does not exist', async () => {
      const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
        provider: TEST_RPC_URL,
        multisigPda: TEST_MULTISIG_PDA
      })
      account._rpc = {
        getAccountInfo: () => ({ send: async () => ({ value: null }) }),
        getMinimumBalanceForRentExemption: () => ({ send: async () => 0n })
      }

      await expect(account.quoteTransfer(OPTIONS)).rejects.toThrow(/does not exist/)
    })

    it('propagates RPC failures', async () => {
      const { account } = mockTransferQuote()
      account._rpc.getMinimumBalanceForRentExemption = () => ({
        send: async () => { throw new Error('503 Service Unavailable') }
      })

      await expect(account.quoteTransfer(OPTIONS)).rejects.toThrow('503 Service Unavailable')
    })
  })

  describe('unsupported message operations', () => {
    const account = new WalletAccountReadOnlyMultisigSolanaSquads(null, {
      provider: TEST_RPC_URL,
      multisigPda: TEST_MULTISIG_PDA
    })

    it('throws NotSupportedError from getMessages', async () => {
      await expect(account.getMessages(['abc'])).rejects.toThrow(NotSupportedError)
    })

    it('throws NotSupportedError from verify', async () => {
      await expect(account.verify('hello', 'sig')).rejects.toThrow(NotSupportedError)
    })

    it('distinguishes not-supported from not-implemented', async () => {
      // quoteDeploy is pending work; getMessages never will be. A caller doing
      // capability detection has to be able to tell them apart.
      account._rpc = {
        getAccountInfo: () => ({ send: async () => ({ value: null }) }),
        getMinimumBalanceForRentExemption: () => ({ send: async () => 2039280n })
      }

      await expect(account.getMessages(['abc'])).rejects.toThrow(NotSupportedError)
      await expect(account.quoteDeploy()).rejects.not.toThrow(NotSupportedError)
    })

    it('is not a NotImplementedError', async () => {
      // Deliberate: a consumer catching NotImplementedError to mean "unfinished" must
      // not also swallow "this protocol cannot do it".
      const error = await account.getMessages(['abc']).catch((e) => e)

      expect(error).toBeInstanceOf(NotSupportedError)
      expect(error).not.toBeInstanceOf(NotImplementedError)
    })

    it('carries the method name and a reason', async () => {
      const error = await account.getMessages(['abc']).catch((e) => e)

      expect(error.name).toBe('NotSupportedError')
      expect(error.methodName).toBe('getMessages(messageHashes)')
      expect(error.reason).toMatch(/no message-signing primitive/)
      expect(error.message).toContain('is not supported:')
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
