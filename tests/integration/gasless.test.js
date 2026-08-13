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

import { randomBytes } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'

import { address } from '@solana/addresses'
import { createSolanaRpc } from '@solana/rpc'
import { generateKeyPairSigner } from '@solana/signers'
import { TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from '@solana-program/token'

import {
  LAMPORTS_PER_SOL,
  airdrop,
  confirmTransaction,
  deployTestToken,
  sendTestTokensTo
} from './helpers/chain.js'
import {
  GASLESS_PACKAGE_PATH,
  createGaslessMultisig,
  isGaslessPackageAvailable
} from './helpers/gasless.js'
import { startKoraPaymaster } from './helpers/kora.js'
import { startSolanaTestValidator } from './helpers/validator.js'

jest.setTimeout(240_000)

const RPC_PORT = 8999
const FAUCET_PORT = 9999
const TEST_RPC_URL = `http://127.0.0.1:${RPC_PORT}`

const SEED_PHRASE =
  'test walk nut penalty hip pave soap entry language right filter choice'

const CREATE_KEY_SIZE = 32
const FEE_IN_TOKEN = 10_000
const MEMBER_TOKENS = 10_000_000n
// The rent the multisig account itself locks up, measured against the validator.
const MULTISIG_RENT = 2_039_280n

// The lamport network fee `quoteDeploy` folds into its quote, which the paymaster now pays.
const NETWORK_FEE_QUOTED = 10_000n
const VAULT_FUNDING = 2n * LAMPORTS_PER_SOL
const VAULT_TRANSFER = LAMPORTS_PER_SOL / 2n

const rpc = createSolanaRpc(TEST_RPC_URL)

/**
 * @param {string} owner
 * @param {string} mint
 * @returns {Promise<bigint>}
 */
async function tokenBalance (owner, mint) {
  const [ata] = await findAssociatedTokenPda({
    mint: address(mint),
    owner: address(owner),
    tokenProgram: TOKEN_PROGRAM_ADDRESS
  })

  const { value } = await rpc.getTokenAccountBalance(ata, { commitment: 'confirmed' }).send()

  return BigInt(value.amount)
}

/**
 * @param {string} target
 * @returns {Promise<bigint>}
 */
async function solBalance (target) {
  const { value } = await rpc.getBalance(address(target), { commitment: 'confirmed' }).send()

  return value
}

describe('@tetherto/wdk-protocol-multisig-squads + @tetherto/wdk-wallet-solana-gasless', () => {
  let stopValidator
  let paymaster
  let testToken
  let accounts
  let signers
  let vaultPda
  let proposalRecipient

  beforeAll(async () => {
    if (!await isGaslessPackageAvailable()) {
      throw new Error(
        `The gasless package was not found at ${GASLESS_PACKAGE_PATH}. Set ` +
        'WDK_WALLET_SOLANA_GASLESS_PATH to its index.js.'
      )
    }

    stopValidator = await startSolanaTestValidator(rpc, {
      rpcPort: RPC_PORT,
      faucetPort: FAUCET_PORT
    })

    testToken = await deployTestToken(rpc)
    paymaster = await startKoraPaymaster(rpc, {
      feeToken: testToken.mint,
      feeInToken: FEE_IN_TOKEN
    })

    // The paymaster is paid into its associated token account, which has to exist first.
    await sendTestTokensTo(rpc, testToken, paymaster.address, 0n)

    const { Manager } = await createGaslessMultisig()

    const manager = new Manager(SEED_PHRASE, {
      provider: TEST_RPC_URL,
      commitment: 'confirmed',
      createKeySecret: new Uint8Array(randomBytes(CREATE_KEY_SIZE)),
      paymasterUrl: paymaster.url,
      paymasterAddress: paymaster.address,
      paymasterToken: { address: testToken.mint }
    })

    accounts = [await manager.getAccount(0), await manager.getAccount(1)]
    signers = await Promise.all(accounts.map((account) => account.getSignerAddress()))

    // Member 0 holds SOL and pays every rent the Squads program charges. Member 1 holds none:
    // it is the account that shows what the paymaster can and cannot cover.
    await airdrop(rpc, signers[0], LAMPORTS_PER_SOL)

    for (const signer of signers) {
      await sendTestTokensTo(rpc, testToken, signer, MEMBER_TOKENS)
    }
  })

  afterAll(async () => {
    if (paymaster) {
      await paymaster.stop()
      paymaster = undefined
    }

    if (stopValidator) {
      await stopValidator()
      stopValidator = undefined
    }
  })

  describe('wiring', () => {
    it('keeps the multisig address the plain signer would have derived', async () => {
      const { Account } = await createGaslessMultisig()

      const gasless = new Account(SEED_PHRASE, "0'/0'", {
        provider: TEST_RPC_URL,
        commitment: 'confirmed',
        paymasterUrl: paymaster.url,
        paymasterAddress: paymaster.address,
        paymasterToken: { address: testToken.mint }
      })

      expect(await gasless.getSignerAddress()).toBe(signers[0])
      expect(await gasless._signerAccount.getAddress()).toBe(signers[0])
    })
  })

  describe('deploy', () => {
    it('creates the multisig with the paymaster as fee payer', async () => {
      const before = {
        memberSol: await solBalance(signers[0]),
        memberTokens: await tokenBalance(signers[0], testToken.mint),
        paymasterSol: await solBalance(paymaster.address),
        paymasterTokens: await tokenBalance(paymaster.address, testToken.mint)
      }

      const quote = await accounts[0].quoteDeploy(2)
      const { hash } = await accounts[0].deploy(signers, 2)

      await confirmTransaction(rpc, hash)

      const after = {
        memberSol: await solBalance(signers[0]),
        memberTokens: await tokenBalance(signers[0], testToken.mint),
        paymasterSol: await solBalance(paymaster.address),
        paymasterTokens: await tokenBalance(paymaster.address, testToken.mint)
      }

      vaultPda = await accounts[0].getVaultAddress(0)

      expect(await accounts[0].isDeployed()).toBe(true)
      expect(await accounts[0].getThreshold()).toBe(2)

      // The paymaster signed and paid the network fee.
      expect(after.paymasterSol).toBeLessThan(before.paymasterSol)

      // The member paid the paymaster in tokens, not in SOL.
      expect(before.memberTokens - after.memberTokens).toBe(BigInt(FEE_IN_TOKEN))
      expect(after.paymasterTokens - before.paymasterTokens).toBe(BigInt(FEE_IN_TOKEN))

      // But the member still paid the rent and the Squads creation fee out of its own SOL,
      // because the Squads program debits the creator account, not the fee payer.
      const memberSolSpent = before.memberSol - after.memberSol

      expect(memberSolSpent).toBeGreaterThan(0n)

      // `quoteDeploy` is a lamport quote: rent plus creation fee plus the network fee it
      // assumes the member pays. Only that last part moved to the paymaster, and the token
      // amount the member was actually charged appears nowhere in the quote.
      expect(quote.fee - memberSolSpent).toBe(NETWORK_FEE_QUOTED)
    })
  })

  describe('propose', () => {
    it('proposes a vault transfer, paid in tokens plus the member\'s rent', async () => {
      await airdrop(rpc, vaultPda, VAULT_FUNDING)

      const recipient = await generateKeyPairSigner()

      const before = {
        memberSol: await solBalance(signers[0]),
        memberTokens: await tokenBalance(signers[0], testToken.mint)
      }

      const proposal = await accounts[0].propose({
        to: recipient.address,
        value: VAULT_TRANSFER
      })

      await confirmTransaction(rpc, proposal.hash)

      const after = {
        memberSol: await solBalance(signers[0]),
        memberTokens: await tokenBalance(signers[0], testToken.mint)
      }

      expect(proposal.proposalId).toBe('1')
      expect(proposal.status).toBe('pending')

      expect(before.memberTokens - after.memberTokens).toBe(BigInt(FEE_IN_TOKEN))
      expect(before.memberSol - after.memberSol).toBeGreaterThan(0n)

      // `fee` adds the token fee the gasless signer reports to the lamport rent the multisig
      // package computes, so the number carries two currencies at once.
      expect(proposal.fee).toBeGreaterThan(BigInt(FEE_IN_TOKEN))

      proposalRecipient = recipient.address
    })
  })

  describe('approve and execute without any SOL', () => {
    it('approves from a member holding zero lamports', async () => {
      expect(await solBalance(signers[1])).toBe(0n)

      const before = await tokenBalance(signers[1], testToken.mint)

      const approval = await accounts[1].approveProposal(1)

      await confirmTransaction(rpc, approval.hash)

      const after = await tokenBalance(signers[1], testToken.mint)

      expect(before - after).toBe(BigInt(FEE_IN_TOKEN))
      expect(await solBalance(signers[1])).toBe(0n)
      expect(approval.confirmations).toBe(1)
    })

    it('approves from the second member and executes the proposal, still without SOL', async () => {
      const approval = await accounts[0].approveProposal(1)

      await confirmTransaction(rpc, approval.hash)

      expect(await accounts[1].isReadyToExecute(1)).toBe(true)

      const before = await tokenBalance(signers[1], testToken.mint)

      const { hash } = await accounts[1].executeProposal(1)

      await confirmTransaction(rpc, hash)

      const after = await tokenBalance(signers[1], testToken.mint)

      expect(await solBalance(proposalRecipient)).toBe(VAULT_TRANSFER)
      expect(before - after).toBe(BigInt(FEE_IN_TOKEN))
      expect(await solBalance(signers[1])).toBe(0n)
    })
  })

  describe('what the paymaster cannot cover', () => {
    it('cannot propose from a member holding zero lamports', async () => {
      expect(await solBalance(signers[1])).toBe(0n)

      await expect(accounts[1].propose({ to: signers[0], value: 1n })).rejects.toThrow()
    })

    it('quotes deploy and propose in lamports even though the charge is in tokens', async () => {
      const { Account } = await createGaslessMultisig()

      const fresh = new Account(SEED_PHRASE, "2'/0'", {
        provider: TEST_RPC_URL,
        commitment: 'confirmed',
        createKeySecret: new Uint8Array(randomBytes(CREATE_KEY_SIZE)),
        paymasterUrl: paymaster.url,
        paymasterAddress: paymaster.address,
        paymasterToken: { address: testToken.mint }
      })

      const { fee } = await fresh.quoteDeploy(1)

      // A lamport-denominated rent quote, unrelated to the token amount actually charged.
      expect(fee).toBeGreaterThan(BigInt(FEE_IN_TOKEN) * 100n)
    })
  })

  describe('with `rentPayer` set to the paymaster', () => {
    it('runs the whole lifecycle from members holding no lamports at all', async () => {
      const { Manager } = await createGaslessMultisig()

      const manager = new Manager(SEED_PHRASE, {
        provider: TEST_RPC_URL,
        commitment: 'confirmed',
        createKeySecret: new Uint8Array(randomBytes(CREATE_KEY_SIZE)),
        rentPayer: paymaster.address,
        paymasterUrl: paymaster.url,
        paymasterAddress: paymaster.address,
        paymasterToken: { address: testToken.mint }
      })

      // Two members that never held SOL, funded with the fee token only.
      const sponsored = [await manager.getAccount(3), await manager.getAccount(4)]
      const members = await Promise.all(sponsored.map((account) => account.getSignerAddress()))

      for (const member of members) {
        await sendTestTokensTo(rpc, testToken, member, MEMBER_TOKENS)
        expect(await solBalance(member)).toBe(0n)
      }

      const paymasterSolBefore = await solBalance(paymaster.address)

      const deployed = await sponsored[0].deploy(members, 2)

      await confirmTransaction(rpc, deployed.hash)

      expect(await sponsored[0].isDeployed()).toBe(true)
      expect(await sponsored[0].getThreshold()).toBe(2)

      const vault = await sponsored[0].getVaultAddress(0)

      await airdrop(rpc, vault, VAULT_FUNDING)

      const recipient = await generateKeyPairSigner()
      const proposal = await sponsored[0].propose({
        to: recipient.address,
        value: VAULT_TRANSFER
      })

      await confirmTransaction(rpc, proposal.hash)

      for (const account of sponsored) {
        const approval = await account.approveProposal(proposal.proposalId)

        await confirmTransaction(rpc, approval.hash)
      }

      const executed = await sponsored[1].executeProposal(proposal.proposalId)

      await confirmTransaction(rpc, executed.hash)

      expect(await solBalance(recipient.address)).toBe(VAULT_TRANSFER)

      // Not one lamport left either member: the paymaster carried the rent as well as the fee.
      for (const member of members) {
        expect(await solBalance(member)).toBe(0n)
      }

      expect(paymasterSolBefore - await solBalance(paymaster.address)).toBeGreaterThan(
        MULTISIG_RENT
      )
    })
  })

  describe('paymaster traffic', () => {
    it('routed every write through the Kora endpoint', () => {
      expect(paymaster.calls).toContain('estimateTransactionFee')
      expect(paymaster.calls).toContain('signAndSendTransaction')
    })
  })
})
