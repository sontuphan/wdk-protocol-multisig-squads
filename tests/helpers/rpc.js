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

// Fakes the cluster at the only boundary that is genuinely external: the HTTP transport
// `@solana/rpc` calls. The rpc client itself stays real, so the JSON-RPC envelope, the
// base64 account payloads and the bigint upcasting are the ones the chain produces rather
// than a hand-written approximation of them.

import { jest } from '@jest/globals'

/**
 * Installs a `fetch` stub answering Solana JSON-RPC requests from `handlers`, keyed by RPC
 * method. An unhandled method throws rather than returning a wrong-shaped response, so an
 * unexpected call fails the test that made it. Restore it with `jest.restoreAllMocks()`.
 *
 * @param {Object} handlers - For each RPC method name, a function from the request's `params` to the `result` of the response.
 * @returns {Object} The `fetch` mock; its calls carry the provider URL and the request body.
 * @throws {Error} On a request for a method `handlers` does not name.
 */
export function stubSolanaRpc (handlers) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const { id, method, params } = JSON.parse(init.body)
    const handler = handlers[method]

    if (!handler) {
      throw new Error(`Unexpected Solana RPC call: ${method} at ${url}`)
    }

    return Response.json({ jsonrpc: '2.0', id, result: handler(params) })
  })
}

/**
 * Wraps a `getMultipleAccounts` result the way the RPC does, with the context the real
 * response carries.
 *
 * @param {(Object|null)[]} value - The accounts, in the order they were requested.
 * @returns {Object} The `result` field of a `getMultipleAccounts` response.
 */
export function multipleAccounts (value) {
  return { context: { apiVersion: '2.1.0', slot: 1 }, value }
}

/**
 * Builds the account a Solana RPC serves for an address lookup table: 56 bytes of metadata,
 * then the addresses.
 *
 * @param {string} owner - The program owning the account.
 * @param {Uint8Array[]} addresses - The 32-byte addresses the table holds.
 * @returns {Object} The account, as `getMultipleAccounts` reports it.
 */
export function lookupTableAccount (owner, addresses) {
  const LOOKUP_TABLE_META_SIZE = 32 + 24
  const ADDRESS_SIZE = 32

  const data = new Uint8Array(LOOKUP_TABLE_META_SIZE + addresses.length * ADDRESS_SIZE)

  addresses.forEach((bytes, i) => data.set(bytes, LOOKUP_TABLE_META_SIZE + i * ADDRESS_SIZE))

  return {
    owner,
    data: [Buffer.from(data).toString('base64'), 'base64'],
    executable: false,
    lamports: 2039280,
    rentEpoch: 0,
    space: data.length
  }
}
