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
import { generateKeyPairSigner } from '@solana/signers'

import { WalletAccountReadOnlySolana } from '@tetherto/wdk-wallet-solana'

import { IMultisigCoordinator } from '@tetherto/wdk-protocol-multisig-squads'

import { LAMPORTS_PER_SOL, confirmTransaction } from './helpers/chain.js'
import { deployMultisig, sorted } from './helpers/multisig.js'
import { TEST_RPC_URL, startSolanaTestValidator } from './helpers/validator.js'

jest.setTimeout(180_000)

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
 * Attaches a signer to the accounts an instruction already names as the member, which is how a
 * signature travels on a message that is not compiled yet: the signer is asked for it when the
 * message is finally compiled.
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
 * The pseudo coordinator layer, and one way to implement it. `submitProposal` is only reached by
 * an approval that is short of the threshold, so that is where this one puts its member's
 * signature on the message: it wraps the configuration it was built with as a signer on the
 * approval that names the member, and keeps the message for whoever votes next. `getProposal`
 * hands it back and `confirmProposal` has nothing left to do. Nothing here reaches the cluster.
 *
 * The signature is produced by `partiallySignTransaction` when the last member compiles, so no key
 * is held here. Every member has its own coordinator, and each is configured with the same
 * `transport`, the map that carries a message between them: the configuration is the member's
 * signer widened by whatever an implementation needs, which is what the base class is generic over,
 * and here it needs a way to reach the other members. The member that broadcasts is not signed for
 * at all: its own account signs it as fee payer, and `@solana/kit` refuses two distinct signers for
 * one address.
 */
class PseudoCoordinator extends IMultisigCoordinator {
  async submitProposal (proposalId, proposal) {
    const address = await this._config.getAddress()
    const signer = {
      address,
      signTransactions: (transactions) => Promise.all(transactions.map(async (transaction) => {
        const { signatures } = await this._config.partiallySignTransaction(transaction)

        return { [address]: signatures[address] }
      }))
    }

    this._config.transport.set(proposalId, {
      ...proposal,
      instructions: withMemberSigner(proposal.instructions, signer)
    })

    // A real one resolves when whoever completes the threshold broadcasts. This one answers at
    // once with a signature the cluster has never seen, so the test can read what it circulates.
    return { hash: UNBROADCAST_HASH, fee: SIGNATURE_FEE }
  }

  async getProposal (proposalId) {
    return this._config.transport.get(proposalId) ?? null
  }

  async confirmProposal (proposal) {
    return proposal
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
    let accounts
    let signers
    let vaultPda
    let recipient
    let proposal

    beforeAll(async () => {
      const deployed = await deployMultisig({
        members: 2,
        threshold: 2,
        fundVault: LAMPORTS_PER_SOL
      })

      accounts = deployed.accounts
      signers = deployed.signers
      vaultPda = deployed.vaultPda
      recipient = (await generateKeyPairSigner()).address
      proposal = await accounts[0].propose({ to: recipient, value: TRANSFER_AMOUNT })

      await confirmTransaction(rpc, proposal.transaction.hash)
    })

    it('drives the whole lifecycle with the member signing every transaction', async () => {
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
    let accounts
    let signers
    let proposal
    let transport
    const coordinators = []

    beforeAll(async () => {
      // One coordinator per member, each signing as the member whose configuration built it, and
      // each configured with the transport they reach each other over.
      transport = new Map()

      const deployed = await deployMultisig({
        members: 3,
        threshold: 2,
        config: {
          coordinator: (config) => {
            const coordinator = new PseudoCoordinator({ ...config, transport })
            coordinators.push(coordinator)
            return coordinator
          }
        }
      })

      accounts = deployed.accounts
      signers = deployed.signers

      // The first member proposes a memo for the vault to run. Its own transaction: a coordinator
      // never sees one.
      proposal = await accounts[0].propose({ instructions: [MEMO_INSTRUCTION] })

      await confirmTransaction(rpc, proposal.transaction.hash)
    })

    afterAll(() => {
      // The accounts hold the member keys they derived, and the transport whatever was still in
      // circulation: nothing here should outlive the describe.
      accounts.forEach((account) => account.dispose())
      coordinators.length = 0
      transport.clear()
    })

    it('circulates the first approval and lets the second append and broadcast', async () => {
      expect(proposal.confirmations).toBe(0)
      expect(await coordinators[1].getProposal(proposal.proposalId)).toBeNull()

      // The first member votes. One of the two approvals it needs is short of the threshold, so
      // the message is signed and kept rather than broadcast.
      const first = await accounts[0].approveProposal(proposal.proposalId)
      // Read through the second member's coordinator: what the first one circulated reaches the
      // others over the transport.
      const held = await coordinators[1].getProposal(proposal.proposalId)

      expect(first.transaction.hash).toBe(UNBROADCAST_HASH)
      expect(first.confirmations).toBe(1)
      expect(held.instructions).toHaveLength(1)
      expect(held.instructions[0].accounts[1].signer.address).toBe(signers[0])
      expect((await accounts[0].getProposal(proposal.proposalId)).approved).toEqual([])

      // The second member appends its approval to that message, which meets the threshold, so its
      // account broadcasts the pair and then executes.
      const second = await accounts[1].approveProposal(proposal.proposalId)

      await confirmTransaction(rpc, second.transaction.hash)

      expect(second.transaction.hash).not.toBe(UNBROADCAST_HASH)
      expect(second.confirmations).toBe(2)
      // Two approvals in one transaction, with two signatures: the first member's, which
      // travelled on the message, and the second member's as fee payer.
      expect(second.transaction.fee).toBe(2n * SIGNATURE_FEE)
      expect(await coordinators[1].getProposal(proposal.proposalId)).toBe(held)

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
})
