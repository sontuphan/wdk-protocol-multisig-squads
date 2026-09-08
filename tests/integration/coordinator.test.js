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

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'

import { createSolanaRpc } from '@solana/rpc'
import { createKeyPairSignerFromPrivateKeyBytes, generateKeyPairSigner } from '@solana/signers'

import WalletManagerSolana, { WalletAccountReadOnlySolana } from '@tetherto/wdk-wallet-solana'

import { IMultisigCoordinator } from '@tetherto/wdk-protocol-multisig-squads'

import { LAMPORTS_PER_SOL, confirmTransaction } from './helpers/chain.js'
import { deployMultisig, sorted } from './helpers/multisig.js'
import { TEST_RPC_URL, startSolanaTestValidator } from './helpers/validator.js'

jest.setTimeout(180_000)

const SEED_PHRASE =
  'test walk nut penalty hip pave soap entry language right filter choice'

// The network fee a single-signature transaction pays on the validator.
const SIGNATURE_FEE = 5000n

// The rent a SOL-transfer proposal locks up on this validator for a two-member multisig: its
// transaction and proposal accounts.
const PROPOSAL_RENT = 5143440n

const TRANSFER_AMOUNT = LAMPORTS_PER_SOL / 10n

// The note the proposal has the vault write, and the instruction that writes it: the memo program
// takes the text as its data and needs no accounts, so a proposal carrying it costs the vault
// nothing but the execution's fee.
const MEMO_TEXT = 'two of three, collected off chain'
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const MEMO_INSTRUCTION = {
  programAddress: MEMO_PROGRAM,
  accounts: [],
  data: new TextEncoder().encode(MEMO_TEXT)
}

// A signature the cluster has never seen, which a coordinator that only circulates answers with.
const UNBROADCAST_HASH =
  '4YkT2NCT7cabPMuBNe9GiBmYWSqSChfgQpwZ5sDoDLYkP1yPmzHVfvKD6JgFPBhTruWJFVWvKZ1s6PyzD8MW1XSm'

/**
 * Reads the memo a landed transaction wrote, from the log the memo program prints.
 *
 * @param {object} rpc - The Solana RPC client.
 * @param {string} hash - The transaction's signature.
 * @returns {Promise<string | null>} The memo, or null when the transaction logged none.
 */
async function memoOf (rpc, hash) {
  const { meta } = await rpc
    .getTransaction(hash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    .send()
  const logged = meta.logMessages.find((line) => line.includes('Program log: Memo'))

  return logged ? logged.slice(logged.indexOf('"') + 1, logged.lastIndexOf('"')) : null
}

/**
 * The keypair signers of the first `count` members the seed phrase derives, which stands in for
 * what each member of a real collection would sign with on its own machine.
 *
 * @param {number} count - How many members to derive.
 * @returns {Promise<object[]>} The signers, in derivation order.
 */
async function memberSigners (count) {
  const wallet = new WalletManagerSolana(SEED_PHRASE, {
    provider: TEST_RPC_URL,
    commitment: 'confirmed'
  })
  const signers = []

  for (let index = 0; index < count; index++) {
    const account = await wallet.getAccount(index)

    signers.push(await createKeyPairSignerFromPrivateKeyBytes(account.keyPair.privateKey))
  }

  return signers
}

/**
 * Attaches a signer to the accounts an instruction already names as the member, which is how a
 * signature travels on a message that is not compiled yet.
 *
 * @param {object[]} instructions - The instructions the message carries.
 * @param {object} memberSigner - The member's signer.
 * @returns {object[]} The instructions, with the member's signer embedded.
 */
function withMemberSigner (instructions, memberSigner) {
  const isSignerRole = (role) => role === 2 || role === 3

  return instructions.map((instruction) => ({
    ...instruction,
    accounts: instruction.accounts.map((account) =>
      account.address === memberSigner.address && isSignerRole(account.role)
        ? { ...account, signer: memberSigner }
        : account
    )
  }))
}

/** @param {string} target */
function solanaAccount (target) {
  return new WalletAccountReadOnlySolana(target, {
    provider: TEST_RPC_URL,
    commitment: 'confirmed'
  })
}

/**
 * The pseudo coordinator layer: `confirmProposal` puts this member's signature on the message by
 * embedding its signer in the instruction that names it, `submitProposal` keeps the message for
 * the next member and `getProposal` hands it back. Nothing here reaches the cluster.
 *
 * One instance per member, since the configuration it is built with names one member. What the
 * members share is the collection passed between the instances, which is the service a real
 * coordinator would talk to. The member that broadcasts must leave its own signature to its
 * account, which signs as fee payer, so only the ones that circulate embed a signer.
 */
class PseudoCoordinator extends IMultisigCoordinator {
  constructor (config, { circulating, memberSigner = null }) {
    super(config)

    this._circulating = circulating
    this._memberSigner = memberSigner
  }

  async submitProposal (proposalId, proposal) {
    this._circulating.set(proposalId, proposal)

    // A real one resolves when whoever completes the threshold broadcasts. This one answers at
    // once with a signature the cluster has never seen, so the test can read what it circulates.
    return { hash: UNBROADCAST_HASH, fee: SIGNATURE_FEE }
  }

  async getProposal (proposalId) {
    return this._circulating.get(proposalId) ?? null
  }

  async confirmProposal (proposal) {
    if (!this._memberSigner) {
      return proposal
    }

    return {
      ...proposal,
      instructions: withMemberSigner(proposal.instructions, this._memberSigner)
    }
  }
}

describe('coordinators', () => {
  const rpc = createSolanaRpc(TEST_RPC_URL)

  let stopSolanaTestValidator

  beforeAll(async () => {
    stopSolanaTestValidator = await startSolanaTestValidator(rpc)
  })

  afterAll(async () => {
    if (stopSolanaTestValidator) {
      await stopSolanaTestValidator()
      stopSolanaTestValidator = undefined
    }
  })

  describe('no coordinator', () => {
    it('drives the whole lifecycle with the member signing every transaction', async () => {
      const { accounts, signers, vaultPda } = await deployMultisig({
        members: 2,
        threshold: 2,
        fundVault: LAMPORTS_PER_SOL
      })
      const recipient = (await generateKeyPairSigner()).address

      const proposal = await accounts[0].propose({ to: recipient, value: TRANSFER_AMOUNT })

      await confirmTransaction(rpc, proposal.transaction.hash)

      const first = await accounts[0].approveProposal(proposal.proposalId)

      await confirmTransaction(rpc, first.transaction.hash)

      const second = await accounts[1].approveProposal(proposal.proposalId)

      await confirmTransaction(rpc, second.transaction.hash)

      const execution = await accounts[1].executeProposal(proposal.proposalId)

      await confirmTransaction(rpc, execution.hash)

      // Every one of the four is the member's own transaction, signed once and broadcast at once,
      // which is the N+2 shape a coordinator exists to collapse.
      expect(proposal).toEqual({
        proposalId: '1',
        confirmations: 0,
        threshold: 2,
        status: 'pending',
        transaction: { hash: proposal.transaction.hash, fee: SIGNATURE_FEE + PROPOSAL_RENT }
      })
      expect(first.transaction.fee).toBe(SIGNATURE_FEE)
      expect(second.transaction.fee).toBe(SIGNATURE_FEE)
      expect(execution.fee).toBe(SIGNATURE_FEE)

      const executed = await accounts[0].getProposal(proposal.proposalId)

      expect(executed.statusName).toBe('Executed')
      expect(sorted(executed.approved)).toEqual(sorted(signers))
      expect(await solanaAccount(recipient).getBalance()).toBe(TRANSFER_AMOUNT)
      expect(await solanaAccount(vaultPda).getBalance()).toBe(
        LAMPORTS_PER_SOL - TRANSFER_AMOUNT
      )
    })
  })

  describe('two of three members voting through a coordinator', () => {
    it('circulates the first approval and lets the second append and broadcast', async () => {
      // One coordinator per member over the collection they share. The first member circulates,
      // so its signature travels on the message; the second broadcasts, so its account signs.
      const [firstSigner] = await memberSigners(1)
      const circulating = new Map()
      const coordinators = []
      const { accounts, signers } = await deployMultisig({
        members: 3,
        threshold: 2,
        config: {
          coordinator: (config) => {
            const coordinator = new PseudoCoordinator(config, {
              circulating,
              memberSigner: coordinators.length === 0 ? firstSigner : null
            })

            coordinators.push(coordinator)

            return coordinator
          }
        }
      })

      // 1. The first member proposes a memo for the vault to run. Its own transaction: a
      // coordinator never sees one.
      const proposal = await accounts[0].propose({ instructions: [MEMO_INSTRUCTION] })

      await confirmTransaction(rpc, proposal.transaction.hash)

      expect(proposal.confirmations).toBe(0)
      expect(circulating.size).toBe(0)

      // 2. The first member votes. One of the two approvals it needs is short of the threshold,
      // so the message is signed and kept rather than broadcast.
      const first = await accounts[0].approveProposal(proposal.proposalId)
      const held = circulating.get(proposal.proposalId)

      expect(first.transaction.hash).toBe(UNBROADCAST_HASH)
      expect(first.confirmations).toBe(1)
      expect(held.instructions).toHaveLength(1)
      expect((await accounts[0].getProposal(proposal.proposalId)).approved).toEqual([])

      // 3. The second member appends its approval to that message, which meets the threshold, so
      // its account broadcasts the pair and then executes.
      const second = await accounts[1].approveProposal(proposal.proposalId)

      await confirmTransaction(rpc, second.transaction.hash)

      expect(second.transaction.hash).not.toBe(UNBROADCAST_HASH)
      expect(second.confirmations).toBe(2)
      // Two approvals in one transaction, with two signatures: the first member's, which
      // travelled on the message, and the second member's as fee payer.
      expect(second.transaction.fee).toBe(2n * SIGNATURE_FEE)
      expect(circulating.get(proposal.proposalId)).toBe(held)

      const approved = await accounts[0].getProposal(proposal.proposalId)

      expect(approved.statusName).toBe('Approved')
      expect(sorted(approved.approved)).toEqual(sorted([signers[0], signers[1]]))
      expect(approved.approved).not.toContain(signers[2])

      const execution = await accounts[1].executeProposal(proposal.proposalId)

      await confirmTransaction(rpc, execution.hash)

      expect((await accounts[0].getProposal(proposal.proposalId)).statusName).toBe('Executed')
      expect(await memoOf(rpc, execution.hash)).toBe(MEMO_TEXT)
    })
  })

  describe('either way', () => {
    it('erases the derived key with the account, holding nothing of its own', async () => {
      const { accounts } = await deployMultisig({
        members: 1,
        threshold: 1,
        config: {
          coordinator: (config) => new PseudoCoordinator(config, { circulating: new Map() })
        }
      })

      accounts[0].dispose()

      await expect(accounts[0].sign('hello')).rejects.toThrow(
        'The wallet account has been disposed.'
      )
    })
  })
})
