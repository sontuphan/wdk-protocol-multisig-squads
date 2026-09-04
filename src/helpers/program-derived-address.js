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

// A synchronous program-derived address, which `@solana/addresses` cannot offer: it hashes with
// `crypto.subtle.digest`, and WebCrypto's digest is async by design. Every address this package
// derives is a PDA, so that one `await` spreads through the read paths for no reason. The rule
// being implemented is the runtime's `Pubkey::create_program_address`, exactly as
// `@solana/web3.js` implements it synchronously: hash the seeds, the program and the marker, and
// take the result only if it lies off the ed25519 curve. `sha256` comes from `@noble/hashes`,
// and the curve test from `@solana/addresses`, which is already sync.

import { AssertionError, ValueError } from '@tetherto/wdk-wallet'

import { address, getAddressDecoder, getAddressEncoder, isOffCurveAddress } from '@solana/addresses'

import { sha256 } from '@noble/hashes/sha2.js'

/** @typedef {import('@solana/addresses').Address} Address */
/** @typedef {import('@solana/addresses').ProgramDerivedAddress} ProgramDerivedAddress */

const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress')

const MAX = { seeds: 16, seedLength: 32, bump: 255 }

/**
 * Derives a program address from seeds and a bump, the runtime's `create_program_address`. There
 * must be at most 16 seeds, each of at most 32 bytes, both of which a `ValueError` reports.
 *
 * @param {Object} input - The derivation input.
 * @param {string} input.programAddress - The program to derive for.
 * @param {(string | Uint8Array)[]} input.seeds - The seeds, strings taken as UTF-8.
 * @returns {Address} The derived address.
 * @throws {ValueError} The address the seeds hash to must lie off the ed25519 curve.
 */
export function createProgramDerivedAddressSync ({ programAddress, seeds }) {
  const derived = deriveAddress(programAddress, seeds)

  if (!isOffCurveAddress(derived)) {
    throw new ValueError(`The seeds derive ${derived}, which lies on the ed25519 curve.`)
  }

  return derived
}

/**
 * Derives the canonical program-derived address for the given seeds, the highest bump whose
 * address lies off the ed25519 curve. The synchronous counterpart of
 * `getProgramDerivedAddress` from `@solana/addresses`, returning the same pair. The appended
 * bump counts toward the limit of 16 seeds, so at most 15 may be given.
 *
 * @param {Object} input - The derivation input.
 * @param {string} input.programAddress - The program to derive for.
 * @param {(string | Uint8Array)[]} input.seeds - The seeds, strings taken as UTF-8.
 * @returns {ProgramDerivedAddress} The address and the bump it was found at.
 * @throws {AssertionError} Some bump must yield an address off the ed25519 curve.
 */
export function getProgramDerivedAddressSync ({ programAddress, seeds }) {
  for (let bump = MAX.bump; bump > 0; bump--) {
    const derived = deriveAddress(programAddress, [...seeds, Uint8Array.of(bump)])

    if (isOffCurveAddress(derived)) {
      return [derived, bump]
    }
  }

  throw new AssertionError('No bump seed yields an address off the ed25519 curve.')
}

function deriveAddress (programAddress, seeds) {
  if (seeds.length > MAX.seeds) {
    throw new ValueError(`Expected at most ${MAX.seeds} seeds, got ${seeds.length}.`)
  }

  const encoder = new TextEncoder()
  const parts = seeds.map((seed, index) => {
    const bytes = typeof seed === 'string' ? encoder.encode(seed) : seed

    if (bytes.length > MAX.seedLength) {
      throw new ValueError(
        `The seed at index ${index} is ${bytes.length} bytes, above the maximum of ${MAX.seedLength}.`
      )
    }

    return bytes
  })

  parts.push(getAddressEncoder().encode(address(programAddress)), PDA_MARKER)

  return getAddressDecoder().decode(sha256(concat(parts)))
}

function concat (parts) {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))

  let offset = 0

  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }

  return bytes
}
