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

import { address } from '@solana/addresses'
import { pipe } from '@solana/functional'
import {
  generateKeyPairSigner,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners
} from '@solana/signers'
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  setTransactionMessageLifetimeUsingBlockhash
} from '@solana/transaction-messages'
import { getBase64EncodedWireTransaction } from '@solana/transactions'
import { getCreateAccountInstruction } from '@solana-program/system'
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMintInstruction,
  getMintSize,
  getMintToInstruction
} from '@solana-program/token'

/** @typedef {import('@solana/rpc').Rpc<import('@solana/rpc').SolanaRpcApi>} SolanaRpc */

export const LAMPORTS_PER_SOL = 1_000_000_000n

const CONFIRM_ATTEMPTS = 150
const CONFIRM_INTERVAL_MS = 200
const AIRDROP_MAX_LAMPORTS = 10n * LAMPORTS_PER_SOL
const TEST_TOKEN_DECIMALS = 6

/**
 * @param {SolanaRpc} rpc
 * @param {string} signature
 * @returns {Promise<void>}
 */
export async function confirmTransaction (rpc, signature) {
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
    const { value: [status] } = await rpc.getSignatureStatuses([signature]).send()

    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
    }

    if (['confirmed', 'finalized'].includes(status?.confirmationStatus)) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, CONFIRM_INTERVAL_MS))
  }

  throw new Error(`Transaction was not confirmed after several attempts: ${signature}`)
}

/**
 * @param {SolanaRpc} rpc
 * @param {string} recipient
 * @param {bigint | number} lamports
 * @returns {Promise<bigint>} The recipient's balance afterwards.
 */
export async function airdrop (rpc, recipient, lamports) {
  let remaining = BigInt(lamports)

  while (remaining > 0n) {
    const chunk = remaining > AIRDROP_MAX_LAMPORTS ? AIRDROP_MAX_LAMPORTS : remaining
    const signature = await rpc.requestAirdrop(address(recipient), chunk).send()

    await confirmTransaction(rpc, signature)

    remaining -= chunk
  }

  const { value } = await rpc.getBalance(address(recipient), { commitment: 'confirmed' }).send()

  return value
}

/**
 * @param {SolanaRpc} rpc
 * @param {import('@solana/signers').TransactionSigner} payer
 * @param {object[]} instructions
 * @returns {Promise<string>} The confirmed signature.
 */
async function sendInstructions (rpc, payer, instructions) {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m)
  )

  const signed = await signTransactionMessageWithSigners(message)
  const signature = await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: 'base64',
      preflightCommitment: 'confirmed'
    })
    .send()

  await confirmTransaction(rpc, signature)

  return signature
}

/**
 * @param {SolanaRpc} rpc
 * @returns {Promise<{ mint: string, mintAuthority: import('@solana/signers').KeyPairSigner }>}
 */
export async function deployTestToken (rpc) {
  const mintAuthority = await generateKeyPairSigner()

  await airdrop(rpc, mintAuthority.address, LAMPORTS_PER_SOL)

  const mintSigner = await generateKeyPairSigner()
  const space = BigInt(getMintSize())
  const lamports = await rpc.getMinimumBalanceForRentExemption(space).send()

  await sendInstructions(rpc, mintAuthority, [
    getCreateAccountInstruction({
      payer: mintAuthority,
      newAccount: mintSigner,
      lamports,
      space,
      programAddress: TOKEN_PROGRAM_ADDRESS
    }),
    getInitializeMintInstruction({
      mint: mintSigner.address,
      decimals: TEST_TOKEN_DECIMALS,
      mintAuthority: mintAuthority.address,
      freezeAuthority: mintAuthority.address
    })
  ])

  return { mint: mintSigner.address, mintAuthority }
}

/**
 * @param {SolanaRpc} rpc
 * @param {{ mint: string, mintAuthority: object }} testToken
 * @param {string} to
 * @param {bigint | number} value
 * @returns {Promise<void>}
 */
export async function sendTestTokensTo (rpc, testToken, to, value) {
  const { mint, mintAuthority } = testToken
  const owner = address(to)

  const [ata] = await findAssociatedTokenPda({
    mint: address(mint),
    owner,
    tokenProgram: TOKEN_PROGRAM_ADDRESS
  })

  await sendInstructions(rpc, mintAuthority, [
    getCreateAssociatedTokenIdempotentInstruction({
      payer: mintAuthority,
      ata,
      mint: address(mint),
      owner
    }),
    getMintToInstruction({
      mint: address(mint),
      token: ata,
      mintAuthority,
      amount: BigInt(value)
    })
  ])
}
