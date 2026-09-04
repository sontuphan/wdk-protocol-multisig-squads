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

// Reads back the transaction a wallet account submitted, so a test can assert the instructions
// that actually left the process rather than what an internal encoder returned.

import { getBase64Encoder } from '@solana/codecs'
import { getCompiledTransactionMessageDecoder } from '@solana/transaction-messages'
import { getTransactionDecoder } from '@solana/transactions'

/**
 * Decodes the instructions of a submitted transaction, resolving every account index to its
 * address and the signer and writable flags the message header implies.
 *
 * @param {string} base64Transaction - The wire transaction, as passed to `sendTransaction`.
 * @returns {Object[]} For each instruction, its `programAddress`, its `accounts` (`address`, `signer`, `writable`) and its `data`.
 */
export function submittedInstructions (base64Transaction) {
  const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(base64Transaction))
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes)

  const { numSignerAccounts, numReadonlySignerAccounts, numReadonlyNonSignerAccounts } = message.header
  const accounts = message.staticAccounts.map((address, index) => ({
    address,
    signer: index < numSignerAccounts,
    writable: index < numSignerAccounts
      ? index < numSignerAccounts - numReadonlySignerAccounts
      : index < message.staticAccounts.length - numReadonlyNonSignerAccounts
  }))

  return message.instructions.map((instruction) => ({
    programAddress: message.staticAccounts[instruction.programAddressIndex],
    accounts: [...(instruction.accountIndices ?? [])].map((index) => accounts[index]),
    data: Buffer.from(instruction.data ?? [])
  }))
}

/**
 * Reduces a decoded instruction to the shape an assembly assertion cares about: which program,
 * which discriminator, and which accounts in which roles.
 *
 * @param {Object} instruction - An instruction from `submittedInstructions`.
 * @returns {Object} The instruction's `programAddress`, 8-byte `discriminator` and `accounts`.
 */
export function instructionShape (instruction) {
  return {
    programAddress: instruction.programAddress,
    discriminator: [...instruction.data.subarray(0, 8)],
    accounts: instruction.accounts
  }
}
