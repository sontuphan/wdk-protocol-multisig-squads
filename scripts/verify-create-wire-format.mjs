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

// Diffs the multisig-creation instruction data this package builds against
// @sqds/multisig, which defines the on-chain wire format.
//
// This lives outside the test suite because @sqds/multisig pulls in @solana/web3.js,
// whose rpc-websockets dependency cannot be loaded by Jest. Run it after changing the
// encoder, and paste the printed arrays into the golden values in
// tests/wallet-account-multisig-solana-squads.test.js.
//
//   node scripts/verify-create-wire-format.mjs

import { generated } from '@sqds/multisig'
import { PublicKey } from '@solana/web3.js'
import { getBase58Decoder } from '@solana/codecs'

import WalletManagerMultisigSolanaSquads from '../index.js'

const SEED = 'test walk nut penalty hip pave soap entry language right filter choice'
const OWNERS = [
  '3uXqWpwgqKVdiHAwF6Vmu4G4vdQzpR66xjPkz1G7zMKE',
  '2JvLzXomThTBMSj2YQY3wE21kiaSpwGyJ17nm9xiLMsE',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
]

const wallet = new WalletManagerMultisigSolanaSquads(SEED, {
  provider: 'https://api.devnet.solana.com',
  createKeySecret: getBase58Decoder().decode(new Uint8Array(32).fill(9))
})
const account = await wallet.getAccount(0)

let failures = 0

for (const [count, threshold] of [[1, 1], [2, 2], [3, 2]]) {
  const owners = OWNERS.slice(0, count)
  const mine = account._encodeMultisigCreateV2Data(owners, threshold)
  const [reference] = generated.multisigCreateV2Struct.serialize({
    instructionDiscriminator: generated.multisigCreateV2InstructionDiscriminator,
    args: {
      configAuthority: null,
      threshold,
      members: owners.map((owner) => ({ key: new PublicKey(owner), permissions: { mask: 7 } })),
      timeLock: 0,
      rentCollector: null,
      memo: null
    }
  })

  const identical =
    mine.length === reference.length && mine.every((byte, i) => byte === reference[i])

  if (!identical) failures++

  console.log(`${count} owner(s), threshold ${threshold}: ${mine.length} bytes -> ${identical ? 'IDENTICAL' : 'DIFFERS'}`)
  console.log(`  ${count}: [${Array.from(reference).join(', ')}],`)
}

account.dispose()

if (failures) {
  console.error(`\n${failures} case(s) diverged from @sqds/multisig.`)
  process.exit(1)
}

console.log('\nAll cases match @sqds/multisig.')
