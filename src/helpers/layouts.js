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

// Every byte this package writes or reads, described once. Squads is an Anchor program, so its
// instructions and accounts are Borsh behind an eight-byte discriminator, which is the dialect
// `@solana/codecs` already speaks: a `Vec` is an array behind a `u32` length, an `Option` a
// nullable behind a `u8` tag, and an enum a discriminated union behind another. Instructions are
// only ever written and accounts only ever read, so each gets an encoder or a decoder rather
// than a codec. Field names follow this package's own typedefs where the two disagree.

import { getAddressCodec, getAddressDecoder, getAddressEncoder } from '@solana/addresses'

import {
  addDecoderSizePrefix,
  addEncoderSizePrefix,
  createDecoder,
  getArrayCodec,
  getArrayDecoder,
  getArrayEncoder,
  getBooleanEncoder,
  getBytesDecoder,
  getBytesEncoder,
  getConstantDecoder,
  getConstantEncoder,
  getDiscriminatedUnionEncoder,
  getHiddenPrefixDecoder,
  getHiddenPrefixEncoder,
  getI64Decoder,
  getNullableCodec,
  getNullableDecoder,
  getNullableEncoder,
  getStructCodec,
  getStructDecoder,
  getStructEncoder,
  getTupleDecoder,
  getU16Codec,
  getU16Decoder,
  getU16Encoder,
  getU32Codec,
  getU32Decoder,
  getU32Encoder,
  getU64Codec,
  getU64Decoder,
  getU64Encoder,
  getU8Codec,
  getU8Decoder,
  getU8Encoder,
  getUnionDecoder,
  getUnitEncoder,
  getUtf8Encoder,
  padLeftDecoder,
  transformDecoder
} from '@solana/codecs'

const INSTRUCTION_DISCRIMINATOR = {
  multisigCreateV2: Uint8Array.from([50, 221, 199, 93, 40, 245, 139, 233]),
  vaultTransactionCreate: Uint8Array.from([48, 250, 78, 168, 208, 226, 218, 211]),
  vaultTransactionExecute: Uint8Array.from([194, 8, 161, 87, 153, 164, 25, 171]),
  configTransactionCreate: Uint8Array.from([155, 236, 87, 228, 137, 75, 81, 39]),
  configTransactionExecute: Uint8Array.from([114, 146, 244, 189, 252, 140, 36, 40]),
  proposalCreate: Uint8Array.from([220, 60, 73, 224, 30, 108, 79, 159]),
  proposalApprove: Uint8Array.from([144, 37, 164, 136, 188, 216, 42, 248]),
  proposalReject: Uint8Array.from([243, 62, 134, 156, 230, 106, 246, 135])
}

/**
 * The discriminators the Squads accounts this package reads lead with.
 *
 * @type {{ multisig: Uint8Array, proposal: Uint8Array, vaultTransaction: Uint8Array, configTransaction: Uint8Array, batch: Uint8Array, programConfig: Uint8Array }}
 */
export const ACCOUNT_DISCRIMINATOR = {
  multisig: Uint8Array.from([224, 116, 121, 186, 68, 161, 79, 236]),
  proposal: Uint8Array.from([26, 94, 189, 187, 116, 136, 53, 33]),
  vaultTransaction: Uint8Array.from([168, 250, 162, 100, 81, 14, 162, 207]),
  configTransaction: Uint8Array.from([94, 8, 4, 35, 113, 139, 139, 112]),
  batch: Uint8Array.from([156, 194, 70, 44, 22, 88, 137, 44]),
  programConfig: Uint8Array.from([196, 210, 90, 231, 144, 149, 140, 63])
}

/**
 * The statuses a Squads proposal can hold, as the tags of its status enum.
 *
 * @type {{ draft: 0, active: 1, rejected: 2, approved: 3, executing: 4, executed: 5, cancelled: 6 }}
 */
export const PROPOSAL_STATUS = {
  draft: 0,
  active: 1,
  rejected: 2,
  approved: 3,
  executing: 4,
  executed: 5,
  cancelled: 6
}

const SYSTEM_TRANSFER_INSTRUCTION = 2

const LOOKUP_TABLE_HEADER_SIZE = 56

const ADDRESS = getAddressCodec()
const ADDRESS_ENCODER = getAddressEncoder()
const ADDRESS_DECODER = getAddressDecoder()

const MEMO = getNullableEncoder(addEncoderSizePrefix(getUtf8Encoder(), getU32Encoder()))

const MEMBER = getStructCodec([
  ['address', ADDRESS],
  ['mask', getU8Codec()]
])

const anchorInstruction = (discriminator, args) =>
  getHiddenPrefixEncoder(args, [getConstantEncoder(discriminator)])

const anchorAccount = (discriminator, fields) =>
  getHiddenPrefixDecoder(getStructDecoder(fields), [getConstantDecoder(discriminator)])

// `SmallVec`, Squads' own vector type: one length byte where Borsh writes four. The instruction
// argument below is the only place the program takes it; the account it stores holds plain
// `Vec`s, so the two message layouts are not interchangeable.
const smallArrayEncoder = (item) => getArrayEncoder(item, { size: getU8Encoder() })

// Both sides of the enum are built from one variant list, in tag order, so the three kinds this
// package writes and the seven it reads cannot drift apart.
const CONFIG_ACTION_VARIANTS = [
  ['AddMember', getStructCodec([['newMember', MEMBER]])],
  ['RemoveMember', getStructCodec([['oldMember', ADDRESS]])],
  ['ChangeThreshold', getStructCodec([['newThreshold', getU16Codec()]])],
  ['SetTimeLock', getStructCodec([['newTimeLock', getU32Codec()]])],
  ['AddSpendingLimit', getStructCodec([
    ['createKey', ADDRESS],
    ['vaultIndex', getU8Codec()],
    ['mint', ADDRESS],
    ['amount', getU64Codec()],
    ['period', getU8Codec()],
    ['members', getArrayCodec(ADDRESS)],
    ['destinations', getArrayCodec(ADDRESS)]
  ])],
  ['RemoveSpendingLimit', getStructCodec([['spendingLimit', ADDRESS]])],
  ['SetRentCollector', getStructCodec([['newRentCollector', getNullableCodec(ADDRESS)]])]
]

/**
 * The configuration actions this package proposes, as the values `CONFIG_ACTION_ENCODER` takes.
 *
 * @type {{ addMember: (address: string, mask: number) => Object, removeMember: (address: string) => Object, changeThreshold: (threshold: number) => Object }}
 */
export const CONFIG_ACTION = {
  addMember: (address, mask) => ({ __kind: 'AddMember', newMember: { address, mask } }),
  removeMember: (address) => ({ __kind: 'RemoveMember', oldMember: address }),
  changeThreshold: (threshold) => ({ __kind: 'ChangeThreshold', newThreshold: threshold })
}

/** @type {import('@solana/codecs').Encoder<Object>} */
export const CONFIG_ACTION_ENCODER = getDiscriminatedUnionEncoder(CONFIG_ACTION_VARIANTS)

/** @type {import('@solana/codecs').Decoder<Object>} */
export const CONFIG_ACTION_DECODER = getUnionDecoder(
  CONFIG_ACTION_VARIANTS.map(([kind, variant]) => transformDecoder(
    getTupleDecoder([getU8Decoder(), variant]),
    ([, value]) => ({ __kind: kind, ...value })
  )),
  (bytes, offset) => {
    const tag = bytes[offset]

    if (tag >= CONFIG_ACTION_VARIANTS.length) {
      throw new Error(
        `Unknown Squads config action ${tag}. This package cannot read config transactions created by a newer program version.`
      )
    }

    return tag
  }
)

// Every status but `Executing` carries the timestamp it was set at, so the tag alone decides how
// far the votes that follow it sit. An unknown tag is read as a timestamped one rather than
// rejected: the account may come from a newer program, and its votes still count.
const PROPOSAL_STATUS_DECODER = createDecoder({
  read: (bytes, offset) => {
    const status = bytes[offset]

    if (status === PROPOSAL_STATUS.executing) {
      return [{ status, timestamp: null }, offset + 1]
    }

    const [timestamp, next] = getI64Decoder().read(bytes, offset + 1)

    return [{ status, timestamp }, next]
  }
})

/**
 * The message a `vaultTransactionCreate` carries, in the `SmallVec` form the instruction takes.
 *
 * @type {import('@solana/codecs').Encoder<Object>}
 */
export const TRANSACTION_MESSAGE = getStructEncoder([
  ['numSigners', getU8Encoder()],
  ['numWritableSigners', getU8Encoder()],
  ['numWritableNonSigners', getU8Encoder()],
  ['accountKeys', smallArrayEncoder(ADDRESS_ENCODER)],
  ['instructions', smallArrayEncoder(getStructEncoder([
    ['programIdIndex', getU8Encoder()],
    ['accountIndexes', smallArrayEncoder(getU8Encoder())],
    ['data', addEncoderSizePrefix(getBytesEncoder(), getU16Encoder())]
  ]))],
  ['addressTableLookups', smallArrayEncoder(getStructEncoder([
    ['accountKey', ADDRESS_ENCODER],
    ['writableIndexes', smallArrayEncoder(getU8Encoder())],
    ['readonlyIndexes', smallArrayEncoder(getU8Encoder())]
  ]))]
])

// The same message as the program stores it, once the instruction's `SmallVec`s have been
// widened to `Vec`s.
const STORED_TRANSACTION_MESSAGE_DECODER = getStructDecoder([
  ['numSigners', getU8Decoder()],
  ['numWritableSigners', getU8Decoder()],
  ['numWritableNonSigners', getU8Decoder()],
  ['accountKeys', getArrayDecoder(ADDRESS_DECODER)],
  ['instructions', getArrayDecoder(getStructDecoder([
    ['programIdIndex', getU8Decoder()],
    ['accountIndexes', getArrayDecoder(getU8Decoder())],
    ['data', addDecoderSizePrefix(getBytesDecoder(), getU32Decoder())]
  ]))],
  ['addressTableLookups', getArrayDecoder(getStructDecoder([
    ['accountKey', ADDRESS_DECODER],
    ['writableIndexes', getArrayDecoder(getU8Decoder())],
    ['readonlyIndexes', getArrayDecoder(getU8Decoder())]
  ]))]
])

const MULTISIG_HEADER_FIELDS = [
  ['createKey', ADDRESS_DECODER],
  ['configAuthority', ADDRESS_DECODER],
  ['threshold', getU16Decoder()],
  ['timeLock', getU32Decoder()],
  ['transactionIndex', getU64Decoder()]
]

/**
 * The data of the System program transfer a native `propose` wraps.
 *
 * @type {import('@solana/codecs').Encoder<{ lamports: bigint }>}
 */
export const SYSTEM_TRANSFER = getHiddenPrefixEncoder(
  getStructEncoder([['lamports', getU64Encoder()]]),
  [getConstantEncoder(getU32Encoder().encode(SYSTEM_TRANSFER_INSTRUCTION))]
)

/**
 * The data of each Squads instruction this package submits, keyed by instruction.
 *
 * @type {{ [K in 'multisigCreateV2' | 'vaultTransactionCreate' | 'vaultTransactionExecute' | 'configTransactionCreate' | 'configTransactionExecute' | 'proposalCreate' | 'proposalApprove' | 'proposalReject']: import('@solana/codecs').Encoder<any> }}
 */
export const INSTRUCTION = {
  multisigCreateV2: anchorInstruction(
    INSTRUCTION_DISCRIMINATOR.multisigCreateV2,
    getStructEncoder([
      ['configAuthority', getNullableEncoder(ADDRESS_ENCODER)],
      ['threshold', getU16Encoder()],
      ['members', getArrayEncoder(MEMBER)],
      ['timeLock', getU32Encoder()],
      ['rentCollector', getNullableEncoder(ADDRESS_ENCODER)],
      ['memo', MEMO]
    ])
  ),
  vaultTransactionCreate: anchorInstruction(
    INSTRUCTION_DISCRIMINATOR.vaultTransactionCreate,
    getStructEncoder([
      ['vaultIndex', getU8Encoder()],
      ['ephemeralSigners', getU8Encoder()],
      ['transactionMessage', addEncoderSizePrefix(getBytesEncoder(), getU32Encoder())],
      ['memo', MEMO]
    ])
  ),
  vaultTransactionExecute: anchorInstruction(
    INSTRUCTION_DISCRIMINATOR.vaultTransactionExecute,
    getUnitEncoder()
  ),
  configTransactionCreate: anchorInstruction(
    INSTRUCTION_DISCRIMINATOR.configTransactionCreate,
    getStructEncoder([
      ['actions', getArrayEncoder(CONFIG_ACTION_ENCODER)],
      ['memo', MEMO]
    ])
  ),
  configTransactionExecute: anchorInstruction(
    INSTRUCTION_DISCRIMINATOR.configTransactionExecute,
    getUnitEncoder()
  ),
  proposalCreate: anchorInstruction(
    INSTRUCTION_DISCRIMINATOR.proposalCreate,
    getStructEncoder([
      ['transactionIndex', getU64Encoder()],
      ['draft', getBooleanEncoder()]
    ])
  ),
  proposalApprove: anchorInstruction(
    INSTRUCTION_DISCRIMINATOR.proposalApprove,
    getStructEncoder([['memo', MEMO]])
  ),
  proposalReject: anchorInstruction(
    INSTRUCTION_DISCRIMINATOR.proposalReject,
    getStructEncoder([['memo', MEMO]])
  )
}

/**
 * The accounts this package reads, keyed by account. `multisigHeader` is the fixed-size prefix of
 * a multisig, for the reads that slice one rather than fetching it whole.
 *
 * @type {{ [K in 'multisig' | 'multisigHeader' | 'proposal' | 'vaultTransaction' | 'configTransaction' | 'programConfig' | 'clock' | 'lookupTableAddresses']: import('@solana/codecs').Decoder<any> }}
 */
export const ACCOUNT = {
  multisig: anchorAccount(ACCOUNT_DISCRIMINATOR.multisig, [
    ...MULTISIG_HEADER_FIELDS,
    ['staleTransactionIndex', getU64Decoder()],
    ['rentCollector', getNullableDecoder(ADDRESS_DECODER)],
    ['bump', getU8Decoder()],
    ['members', getArrayDecoder(MEMBER)]
  ]),
  multisigHeader: anchorAccount(ACCOUNT_DISCRIMINATOR.multisig, MULTISIG_HEADER_FIELDS),
  proposal: anchorAccount(ACCOUNT_DISCRIMINATOR.proposal, [
    ['multisig', ADDRESS_DECODER],
    ['transactionIndex', getU64Decoder()],
    ['status', PROPOSAL_STATUS_DECODER],
    ['bump', getU8Decoder()],
    ['approved', getArrayDecoder(ADDRESS_DECODER)],
    ['rejected', getArrayDecoder(ADDRESS_DECODER)],
    ['cancelled', getArrayDecoder(ADDRESS_DECODER)]
  ]),
  vaultTransaction: anchorAccount(ACCOUNT_DISCRIMINATOR.vaultTransaction, [
    ['multisig', ADDRESS_DECODER],
    ['creator', ADDRESS_DECODER],
    ['index', getU64Decoder()],
    ['bump', getU8Decoder()],
    ['vaultIndex', getU8Decoder()],
    ['vaultBump', getU8Decoder()],
    ['ephemeralSignerBumps', getArrayDecoder(getU8Decoder())],
    ['message', STORED_TRANSACTION_MESSAGE_DECODER]
  ]),
  configTransaction: anchorAccount(ACCOUNT_DISCRIMINATOR.configTransaction, [
    ['multisig', ADDRESS_DECODER],
    ['creator', ADDRESS_DECODER],
    ['index', getU64Decoder()],
    ['bump', getU8Decoder()],
    ['actions', getArrayDecoder(CONFIG_ACTION_DECODER)]
  ]),
  programConfig: anchorAccount(ACCOUNT_DISCRIMINATOR.programConfig, [
    ['authority', ADDRESS_DECODER],
    ['creationFee', getU64Decoder()],
    ['treasury', ADDRESS_DECODER]
  ]),
  // The clock sysvar belongs to the runtime, not to Anchor: it carries no discriminator.
  clock: getStructDecoder([
    ['slot', getU64Decoder()],
    ['epochStartTimestamp', getI64Decoder()],
    ['epoch', getU64Decoder()],
    ['leaderScheduleEpoch', getU64Decoder()],
    ['unixTimestamp', getI64Decoder()]
  ]),
  // An address lookup table stores its addresses unprefixed, from the end of its header to the
  // end of the account.
  lookupTableAddresses: padLeftDecoder(
    getArrayDecoder(ADDRESS_DECODER, { size: 'remainder' }),
    LOOKUP_TABLE_HEADER_SIZE
  )
}
