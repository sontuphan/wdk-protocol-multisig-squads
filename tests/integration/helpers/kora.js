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

import { createServer } from 'node:http'

import { getBase64Encoder } from '@solana/codecs'
import { generateKeyPairSigner } from '@solana/signers'
import {
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction
} from '@solana/transactions'
import { TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from '@solana-program/token'
import { address } from '@solana/addresses'

import { LAMPORTS_PER_SOL, airdrop } from './chain.js'

/** @typedef {import('@solana/rpc').Rpc<import('@solana/rpc').SolanaRpcApi>} SolanaRpc */

const DEFAULT_FEE_IN_TOKEN = 10_000
const PAYMASTER_FUNDING = 100n * LAMPORTS_PER_SOL

/**
 * Starts a Kora-compatible paymaster in process, backed by a freshly generated key pair that
 * the local validator funds. It answers the four JSON-RPC methods
 * `@tetherto/wdk-wallet-solana-gasless` calls: `getBlockhash`, `estimateTransactionFee`,
 * `signTransaction` and `signAndSendTransaction`. The fee it charges is a flat amount of the
 * given token, so the amounts the tests assert on are deterministic.
 *
 * @param {SolanaRpc} rpc
 * @param {{ feeToken: string, feeInToken?: number }} options
 * @returns {Promise<{ url: string, address: string, paymentAccount: string, feeInToken: number, calls: string[], stop: () => Promise<void> }>}
 */
export async function startKoraPaymaster (rpc, options) {
  const { feeToken, feeInToken = DEFAULT_FEE_IN_TOKEN } = options

  const signer = await generateKeyPairSigner()

  await airdrop(rpc, signer.address, PAYMASTER_FUNDING)

  const [paymentAccount] = await findAssociatedTokenPda({
    mint: address(feeToken),
    owner: signer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS
  })

  const calls = []

  const handlers = {
    async getBlockhash () {
      const { value } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()

      return { blockhash: value.blockhash }
    },

    async estimateTransactionFee () {
      return {
        fee_in_token: feeInToken,
        payment_address: signer.address,
        signer_pubkey: signer.address
      }
    },

    async signTransaction ({ transaction }) {
      const signed = await cosign(transaction)

      return { signed_transaction: getBase64EncodedWireTransaction(signed) }
    },

    async signAndSendTransaction ({ transaction }) {
      const signed = await cosign(transaction)

      const signature = await rpc
        .sendTransaction(getBase64EncodedWireTransaction(signed), {
          encoding: 'base64',
          preflightCommitment: 'confirmed'
        })
        .send()

      return { signature }
    }
  }

  /**
   * @param {string} encodedTransaction
   * @returns {Promise<object>}
   */
  async function cosign (encodedTransaction) {
    const transaction = getTransactionDecoder().decode(
      getBase64Encoder().encode(encodedTransaction)
    )

    return await partiallySignTransaction([signer.keyPair], transaction)
  }

  const server = createServer((request, response) => {
    const chunks = []

    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', async () => {
      const { id, method, params } = JSON.parse(Buffer.concat(chunks).toString('utf8'))

      calls.push(method)

      response.setHeader('Content-Type', 'application/json')

      try {
        const handler = handlers[method]

        if (!handler) {
          throw new Error(`Method not found: ${method}`)
        }

        const result = await handler(params ?? {})

        response.end(JSON.stringify({ id, jsonrpc: '2.0', result }))
      } catch (error) {
        // The logs are what makes a failed simulation diagnosable from the wallet side, where
        // all the Kora client surfaces is the RPC error message.
        const logs = error?.context?.__serverMessage ?? error?.context?.logs

        response.end(
          JSON.stringify({
            id,
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: logs ? `${error.message}: ${JSON.stringify(logs)}` : error.message
            }
          })
        )
      }
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  const { port } = server.address()

  return {
    url: `http://127.0.0.1:${port}`,
    address: signer.address,
    paymentAccount,
    feeInToken,
    calls,
    stop: () => new Promise((resolve) => server.close(resolve))
  }
}
