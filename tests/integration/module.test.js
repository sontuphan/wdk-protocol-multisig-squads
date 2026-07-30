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

import { describe, it, expect } from '@jest/globals'

import WalletManagerMultisigSolanaSquads from '@tetherto/wdk-protocol-multisig-squads'

// Integration tests run against a local solana-test-validator.
// Fill these in once the multisig methods are implemented.
describe('WalletManagerMultisigSolanaSquads (integration)', () => {
  it.todo('creates a Squads multisig against a local validator')

  it('exports the manager class', () => {
    expect(typeof WalletManagerMultisigSolanaSquads).toBe('function')
  })
})
