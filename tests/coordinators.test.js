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

import { describe, it, expect, beforeEach } from '@jest/globals'

import { NotImplementedError } from '@tetherto/wdk-wallet'

import { IMultisigCoordinator } from '@tetherto/wdk-protocol-multisig-squads'

const TEST_SIGNER = '3uXqWpwgqKVdiHAwF6Vmu4G4vdQzpR66xjPkz1G7zMKE'

const TRANSACTION = { to: TEST_SIGNER, value: 1000000n }

describe('IMultisigCoordinator', () => {
  let coordinator

  beforeEach(() => {
    coordinator = new IMultisigCoordinator()
  })

  describe.each([
    ['submitProposal', 'submitProposal(proposalId, proposal)', '3'],
    ['getProposal', 'getProposal(proposalId)', '3'],
    ['confirmProposal', 'confirmProposal(proposal)', TRANSACTION]
  ])('%s', (method, signature, argument) => {
    it('is left to the implementation', async () => {
      await expect(coordinator[method](argument)).rejects.toThrow(
        new NotImplementedError(signature)
      )
    })
  })
})
