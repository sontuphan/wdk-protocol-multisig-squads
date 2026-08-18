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

import {
  ISquadsTransactionTransport,
  LocalSignerTransport
} from '@tetherto/wdk-protocol-multisig-squads'

import { LAMPORTS_PER_SOL, airdrop, confirmTransaction } from './helpers/chain.js'
import { createWallet, deployMultisig, sorted } from './helpers/multisig.js'
import { TEST_RPC_URL, startSolanaTestValidator } from './helpers/validator.js'

jest.setTimeout(180_000)

const SEED_PHRASE =
  'test walk nut penalty hip pave soap entry language right filter choice'

// The signer key the seed phrase derives at 0'/0', and the network fee a single-signature
// transaction pays on the validator.
const SIGNER_0 = '3uXqWpwgqKVdiHAwF6Vmu4G4vdQzpR66xjPkz1G7zMKE'
const SIGNATURE_FEE = 5000n

// What a sponsored transaction pays: two signatures, the member's vote and the sponsor's.
const SPONSORED_FEE = 2n * SIGNATURE_FEE

// The rent a deploy and a SOL-transfer proposal lock up on this validator, both for a two-member
// multisig: the multisig account, and a proposal's transaction and proposal accounts. The proposal
// figure is the one the module suite measures for the default transport.
const MULTISIG_RENT = 2268960n
const PROPOSAL_RENT = 5143440n

const TRANSFER_AMOUNT = LAMPORTS_PER_SOL / 10n

// A signature the cluster has never seen, returned by the transport that refuses to broadcast.
const UNBROADCAST_HASH =
  '4YkT2NCT7cabPMuBNe9GiBmYWSqSChfgQpwZ5sDoDLYkP1yPmzHVfvKD6JgFPBhTruWJFVWvKZ1s6PyzD8MW1XSm'

/**
 * @param {string[]} addresses
 * @returns {Promise<bigint[]>} The balance of each address.
 */
function balances (addresses) {
  return Promise.all(addresses.map((target) => solanaAccount(target).getBalance()))
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
 * a transport that compiles the message itself gets the member's vote signed.
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
 * A transport that has a sponsor pay for and broadcast what the account built: the member signs
 * its own vote and the sponsor signs as fee payer, so a member holding no SOL can still vote. It
 * is the `rentPayer` co-signer the configuration documents, which needs a transport to sign.
 */
class SponsoredTransport extends ISquadsTransactionTransport {
  constructor (signerAccount, sponsor, rpc) {
    super()

    this._signerAccount = signerAccount
    this._sponsor = sponsor
    this._rpc = rpc

    this.sent = []
    this.disposeCount = 0
  }

  async sendTransaction (tx) {
    this.sent.push(tx)

    const memberSigner = await createKeyPairSignerFromPrivateKeyBytes(
      this._signerAccount.keyPair.privateKey
    )
    const { value: blockhash } = await this._rpc
      .getLatestBlockhash({ commitment: 'confirmed' })
      .send()

    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(this._sponsor, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(
        withMemberSigner(tx.instructions, memberSigner), m
      )
    )

    const encodedMessage = pipe(
      message,
      compileTransactionMessage,
      getCompiledTransactionMessageEncoder().encode,
      getBase64Decoder().decode
    )
    const { value: fee } = await this._rpc
      .getFeeForMessage(encodedMessage, { commitment: 'confirmed' })
      .send()

    const signed = await signTransactionMessageWithSigners(message)
    const hash = await this._rpc
      .sendTransaction(getBase64EncodedWireTransaction(signed), {
        encoding: 'base64',
        preflightCommitment: 'confirmed'
      })
      .send()

    await confirmTransaction(this._rpc, hash)

    return { hash, fee: BigInt(fee) }
  }

  dispose () {
    this.disposeCount++
    this._signerAccount = undefined
  }
}

/**
 * A transport that keeps what it was handed instead of putting it on the cluster, which is what a
 * transport collecting signatures elsewhere does before it has enough of them.
 */
class UnbroadcastTransport extends ISquadsTransactionTransport {
  constructor () {
    super()

    this.sent = []
  }

  async sendTransaction (tx) {
    this.sent.push(tx)

    return { hash: UNBROADCAST_HASH, fee: SIGNATURE_FEE }
  }

  dispose () {
    this.sent = []
  }
}

describe('transports', () => {
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

  describe('LocalSignerTransport', () => {
    /** @returns {Promise<object>} A funded Solana signer account, the member's own. */
    async function fundedSignerAccount () {
      const wallet = new WalletManagerSolana(SEED_PHRASE, {
        provider: TEST_RPC_URL,
        commitment: 'confirmed'
      })
      const signerAccount = await wallet.getAccount(0)

      await airdrop(rpc, await signerAccount.getAddress(), LAMPORTS_PER_SOL)

      return signerAccount
    }

    it('signs with the member key it was given and broadcasts at once', async () => {
      const signerAccount = await fundedSignerAccount()
      const transport = new LocalSignerTransport(signerAccount)
      const { address: recipient } = await generateKeyPairSigner()
      const before = await solanaAccount(SIGNER_0).getBalance()

      const { hash, fee } = await transport.sendTransaction({
        to: recipient,
        value: TRANSFER_AMOUNT
      })

      await confirmTransaction(rpc, hash)

      expect(fee).toBe(SIGNATURE_FEE)
      expect(await solanaAccount(recipient).getBalance()).toBe(TRANSFER_AMOUNT)
      expect(await solanaAccount(SIGNER_0).getBalance()).toBe(
        before - TRANSFER_AMOUNT - SIGNATURE_FEE
      )
    })

    it('refuses to send once disposed', async () => {
      const signerAccount = await fundedSignerAccount()
      const transport = new LocalSignerTransport(signerAccount)
      const recipient = (await generateKeyPairSigner()).address

      transport.dispose()

      await expect(
        transport.sendTransaction({ to: recipient, value: TRANSFER_AMOUNT })
      ).rejects.toThrow('The transport has been disposed.')
    })

    it('leaves the signer account it was given able to sign', async () => {
      const signerAccount = await fundedSignerAccount()
      const transport = new LocalSignerTransport(signerAccount)
      const recipient = (await generateKeyPairSigner()).address

      transport.dispose()

      // The signer account belongs to the caller, so the transport must not have erased its key.
      const { hash } = await signerAccount.sendTransaction({
        to: recipient,
        value: TRANSFER_AMOUNT
      })

      await confirmTransaction(rpc, hash)

      expect(await solanaAccount(recipient).getBalance()).toBe(TRANSFER_AMOUNT)
    })

    it('drives the whole lifecycle when the configuration names it', async () => {
      const { accounts, signers, vaultPda } = await deployMultisig({
        members: 2,
        threshold: 2,
        fundVault: LAMPORTS_PER_SOL,
        config: { transport: (signerAccount) => new LocalSignerTransport(signerAccount) }
      })
      const recipient = (await generateKeyPairSigner()).address

      const proposal = await accounts[0].propose({ to: recipient, value: TRANSFER_AMOUNT })

      await confirmTransaction(rpc, proposal.hash)

      const first = await accounts[0].approveProposal(proposal.proposalId)

      await confirmTransaction(rpc, first.hash)

      const second = await accounts[1].approveProposal(proposal.proposalId)

      await confirmTransaction(rpc, second.hash)

      const execution = await accounts[1].executeProposal(proposal.proposalId)

      await confirmTransaction(rpc, execution.hash)

      // The same figures the default transport produces: naming it explicitly changes nothing.
      expect(proposal).toEqual({
        proposalId: '1',
        confirmations: 0,
        threshold: 2,
        status: 'pending',
        hash: proposal.hash,
        fee: SIGNATURE_FEE + PROPOSAL_RENT
      })
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

  describe('a sponsored transport', () => {
    /**
     * The configuration that puts every transaction on the sponsor's tab: it pays the fee as the
     * transport's fee payer and the rent as the configured `rentPayer`.
     *
     * @param {object} sponsor - The sponsor's signer.
     * @param {object[]} transports - Collects the transports the manager builds.
     * @returns {object} The signing configuration.
     */
    function sponsoredConfig (sponsor, transports) {
      return {
        rentPayer: sponsor.address,
        transport: (signerAccount) => {
          const transport = new SponsoredTransport(signerAccount, sponsor, rpc)

          transports.push(transport)

          return transport
        }
      }
    }

    /** @returns {Promise<object>} A sponsor signer holding a SOL. */
    async function fundedSponsor () {
      const sponsor = await generateKeyPairSigner()

      await airdrop(rpc, sponsor.address, LAMPORTS_PER_SOL)

      return sponsor
    }

    /**
     * Builds a sponsored wallet whose multisig is not deployed yet.
     *
     * @param {{ members?: number }} [options]
     * @returns {Promise<object>} The wallet, its sponsor, and the transports built for it.
     */
    async function sponsoredWallet ({ members = 2 } = {}) {
      const sponsor = await fundedSponsor()
      const transports = []
      const wallet = await createWallet({
        members,
        config: sponsoredConfig(sponsor, transports)
      })

      return { ...wallet, sponsor, transports }
    }

    /**
     * Deploys a sponsored multisig, funding the members with nothing.
     *
     * @param {{ members?: number, threshold?: number, fundVault?: bigint }} [options]
     * @returns {Promise<object>} The multisig, its sponsor, and the transports built for it.
     */
    async function sponsoredMultisig ({ members = 2, threshold = members, fundVault = 0n } = {}) {
      const sponsor = await fundedSponsor()
      const transports = []
      const multisig = await deployMultisig({
        members,
        threshold,
        fundVault,
        fundSigners: 0n,
        config: sponsoredConfig(sponsor, transports)
      })

      return { ...multisig, sponsor, transports }
    }

    it('deploys a multisig without charging the members a lamport', async () => {
      const { accounts, signers, sponsor } = await sponsoredWallet({ members: 2 })
      const quote = await accounts[0].quoteDeploy(2)
      const membersBefore = await balances(signers)
      const [sponsorBefore] = await balances([sponsor.address])

      const { hash } = await accounts[0].deploy(signers, 2)

      await confirmTransaction(rpc, hash)

      const [sponsorAfter] = await balances([sponsor.address])

      expect(await accounts[0].isDeployed()).toBe(true)
      expect(sorted(await accounts[0].getOwners())).toEqual(sorted(signers))
      // Exactly what the quote says the creator pays: the sponsored transaction carries the same
      // two signatures the quote assumes, the fee payer's and the create key's, and the sponsor
      // is the one debited for both the fee and the multisig's rent.
      expect(sponsorBefore - sponsorAfter).toBe(quote.fee)
      expect(quote.fee).toBe(SPONSORED_FEE + MULTISIG_RENT)
      expect(await balances(signers)).toEqual(membersBefore)
    })

    it('proposes, approves and executes a transfer out of the vault', async () => {
      const { accounts, signers, vaultPda } = await sponsoredMultisig({
        members: 2,
        threshold: 2,
        fundVault: LAMPORTS_PER_SOL
      })
      const recipient = (await generateKeyPairSigner()).address

      const proposal = await accounts[0].propose({ to: recipient, value: TRANSFER_AMOUNT })
      const first = await accounts[0].approveProposal(proposal.proposalId)
      const second = await accounts[1].approveProposal(proposal.proposalId)
      const execution = await accounts[1].executeProposal(proposal.proposalId)

      expect(proposal.fee).toBe(SPONSORED_FEE + PROPOSAL_RENT)
      expect(first.confirmations).toBe(1)
      expect(second.confirmations).toBe(2)

      const executed = await accounts[0].getProposal(proposal.proposalId)

      expect(executed.statusName).toBe('Executed')
      // The votes are the members' own: a transport pays and broadcasts, it is not an identity.
      expect(sorted(executed.approved)).toEqual(sorted(signers))
      expect(await solanaAccount(recipient).getBalance()).toBe(TRANSFER_AMOUNT)
      expect(await solanaAccount(vaultPda).getBalance()).toBe(
        LAMPORTS_PER_SOL - TRANSFER_AMOUNT
      )
      expect(execution.fee).toBe(SPONSORED_FEE)
    })

    it('charges the sponsor the fee and the rent the proposal reports', async () => {
      const { accounts, signers, sponsor } = await sponsoredMultisig({
        members: 2,
        threshold: 2,
        fundVault: LAMPORTS_PER_SOL
      })
      const recipient = (await generateKeyPairSigner()).address
      const membersBefore = await balances(signers)
      const [before] = await balances([sponsor.address])

      const proposal = await accounts[0].propose({ to: recipient, value: TRANSFER_AMOUNT })

      const [after] = await balances([sponsor.address])

      // `fee` is the network fee plus the rent, and the sponsor paid both halves of it.
      expect(before - after).toBe(proposal.fee)
      expect(proposal.fee).toBe(SPONSORED_FEE + PROPOSAL_RENT)
      expect(await balances(signers)).toEqual(membersBefore)
    })

    it('is disposed with the account, whose derived key the account erases itself', async () => {
      const { accounts, transports } = await sponsoredMultisig({ members: 1, threshold: 1 })

      accounts[0].dispose()

      expect(transports[0].disposeCount).toBe(1)
      await expect(accounts[0].sign('hello')).rejects.toThrow(
        'The wallet account has been disposed.'
      )
    })
  })

  describe('a transport that does not broadcast', () => {
    it('hands the account nothing on the cluster and no proposal to read', async () => {
      const transports = []
      const { accounts } = await deployMultisig({ members: 2, threshold: 2 })
      const { accounts: [pending] } = await createWallet({
        members: 1,
        config: {
          multisigPdaOrCreateKey: await accounts[0].getAddress(),
          createKeySecret: undefined,
          transport: () => {
            const transport = new UnbroadcastTransport()

            transports.push(transport)

            return transport
          }
        }
      })
      const recipient = (await generateKeyPairSigner()).address

      const proposal = await pending.propose({ to: recipient, value: TRANSFER_AMOUNT })

      // The account reports what the transport told it, and nothing reached the cluster: the
      // account builds instructions, the transport alone decides when they land.
      expect(proposal.hash).toBe(UNBROADCAST_HASH)
      expect(await pending.getProposal(proposal.proposalId)).toBeNull()
      expect(await pending.getNonce()).toBe(0n)

      // Unsigned, with no fee payer and no lifetime: everything past this is the transport's.
      expect(transports[0].sent).toHaveLength(1)
      expect(Object.keys(transports[0].sent[0])).toEqual(['instructions'])
      expect(transports[0].sent[0].instructions).toHaveLength(2)
    })
  })
})
