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

import { getBase64Decoder } from '@solana/codecs'
import { pipe } from '@solana/functional'
import { createSolanaRpc } from '@solana/rpc'
import {
  createKeyPairSignerFromPrivateKeyBytes,
  generateKeyPairSigner,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners
} from '@solana/signers'
import {
  appendTransactionMessageInstructions,
  compileTransactionMessage,
  createTransactionMessage,
  getCompiledTransactionMessageEncoder,
  setTransactionMessageLifetimeUsingBlockhash
} from '@solana/transaction-messages'
import { getBase64EncodedWireTransaction } from '@solana/transactions'

import WalletManagerSolana, { WalletAccountReadOnlySolana } from '@tetherto/wdk-wallet-solana'

import { IMultisigCoordinator } from '@tetherto/wdk-protocol-multisig-squads'

import { LAMPORTS_PER_SOL, airdrop, confirmTransaction } from './helpers/chain.js'
import { createWallet, deployMultisig, sorted } from './helpers/multisig.js'
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

// A signature the cluster has never seen, which a coordinator that only circulates answers with.
const UNBROADCAST_HASH =
  '4YkT2NCT7cabPMuBNe9GiBmYWSqSChfgQpwZ5sDoDLYkP1yPmzHVfvKD6JgFPBhTruWJFVWvKZ1s6PyzD8MW1XSm'

/**
 * The keypair signers of the first `count` members the seed phrase derives, which stands in for
 * what the members of a real collection would each sign with on their own machine.
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

/** @param {string} target */
function solanaAccount (target) {
  return new WalletAccountReadOnlySolana(target, {
    provider: TEST_RPC_URL,
    commitment: 'confirmed'
  })
}

/**
 * Attaches a signer to the accounts an instruction list already names as the member, which is how
 * a coordinator signs an approval it is handed.
 *
 * @param {object[]} instructions - The instructions the account built.
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

/**
 * A coordinator that signs and circulates, which is all the contract asks of one:
 * `confirmProposal` adds the voting member's signature to the instructions it is given,
 * `submitProposal` keeps the partially signed transaction for the next member, and no method
 * reaches the cluster. One instance stands in for the service the members share, so it is given
 * every member's keypair signer up front; the configuration each account hands it carries no key,
 * which is the point of `CoordinatorSigner`.
 */
class CollectingCoordinator extends IMultisigCoordinator {
  constructor (config, memberSigners) {
    super(config)

    this._memberSigners = memberSigners
    this._held = new Map()

    this.circulated = []
  }

  async submitProposal (proposalId, proposal) {
    this._held.set(proposalId, proposal)
    this.circulated.push([proposalId, proposal])

    // A real one resolves when whoever completes the threshold broadcasts. This one answers at
    // once with a signature the cluster has never seen, so the test can inspect the collection.
    return { hash: UNBROADCAST_HASH, fee: SIGNATURE_FEE }
  }

  async getProposal (proposalId) {
    return this._held.get(proposalId) ?? null
  }

  async confirmProposal (proposal) {
    let instructions = proposal.instructions

    for (const memberSigner of this._memberSigners) {
      instructions = withMemberSigner(instructions, memberSigner)
    }

    return { instructions }
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

  describe('a coordinator that signs and circulates', () => {
    it('collects both votes into one transaction the last member broadcasts', async () => {
      const signers = await memberSigners(2)
      let coordinator = null
      const { accounts, multisigPda } = await deployMultisig({ members: 2, threshold: 2 })
      const { accounts: voters } = await createWallet({
        members: 2,
        config: {
          multisigPdaOrCreateKey: multisigPda,
          createKeySecret: undefined,
          coordinator: (config) => {
            coordinator ??= new CollectingCoordinator(config, signers)

            return coordinator
          }
        }
      })
      const recipient = (await generateKeyPairSigner()).address

      await airdrop(rpc, await accounts[0].getVaultAddress(0), LAMPORTS_PER_SOL)

      const proposal = await voters[0].propose({ to: recipient, value: TRANSFER_AMOUNT })

      await confirmTransaction(rpc, proposal.transaction.hash)

      const first = await voters[0].approveProposal(proposal.proposalId)

      // One of two: signed and circulating, with nothing on the cluster to show for it.
      expect(first.transaction.hash).toBe(UNBROADCAST_HASH)
      expect(coordinator.circulated).toHaveLength(1)
      expect(coordinator.circulated[0][1].instructions).toHaveLength(1)
      expect((await accounts[0].getProposal(proposal.proposalId)).approved).toEqual([])

      // The second vote is where this contract stops working: the account broadcasts what the
      // coordinator signed, and the broadcasting member's key is embedded in its own vote as well
      // as being the fee payer, which `@solana/kit` refuses:
      //
      //   SolanaError: Multiple distinct signers were identified for address ...
      //
      // A member that signs its own vote can only circulate it; the one that broadcasts must leave
      // its signature to the account. So signing belongs on the circulating path, not on `approve`.
      await expect(voters[1].approveProposal(proposal.proposalId)).rejects.toThrow(
        /Multiple distinct signers/
      )
      expect((await accounts[0].getProposal(proposal.proposalId)).approved).toEqual([])
    })

    it('erases the derived key with the account, holding nothing of its own to dispose', async () => {
      const signers = await memberSigners(1)
      const { accounts } = await deployMultisig({
        members: 1,
        threshold: 1,
        config: { coordinator: (config) => new CollectingCoordinator(config, signers) }
      })

      accounts[0].dispose()

      await expect(accounts[0].sign('hello')).rejects.toThrow(
        'The wallet account has been disposed.'
      )
    })
  })
})
