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

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

import { NotImplementedError } from '@tetherto/wdk-wallet'

import {
  IMultisigCoordinator,
  LocalSignerCoordinator
} from '@tetherto/wdk-protocol-multisig-squads'

// The signer account is the coordinator's only dependency, and it reaches the cluster.
const sendTransactionMock = jest.fn()

const signerAccount = { sendTransaction: sendTransactionMock }

const TEST_SIGNER = '3uXqWpwgqKVdiHAwF6Vmu4G4vdQzpR66xjPkz1G7zMKE'

const TRANSACTION = { to: TEST_SIGNER, value: 1000000n }

const DUMMY_HASH = 'deadbeef'
const DUMMY_FEE = 5000n

describe('LocalSignerCoordinator', () => {
  let coordinator

  beforeEach(() => {
    sendTransactionMock.mockReset()

    coordinator = new LocalSignerCoordinator(signerAccount)
  })

  describe('sendTransaction', () => {
    it('hands the transaction to the signer account and returns what it reports', async () => {
      sendTransactionMock.mockResolvedValue({ hash: DUMMY_HASH, fee: DUMMY_FEE })

      const result = await coordinator.sendTransaction(TRANSACTION)

      expect(sendTransactionMock).toHaveBeenCalledWith(TRANSACTION)
      expect(result).toEqual({ hash: DUMMY_HASH, fee: DUMMY_FEE })
    })

    it('refuses to send once disposed', async () => {
      coordinator.dispose()

      // Nothing reaches the signer account: the coordinator no longer holds it.
      await expect(coordinator.sendTransaction(TRANSACTION)).rejects.toThrow(
        'The coordinator has been disposed.'
      )
      expect(sendTransactionMock).not.toHaveBeenCalled()
    })
  })

  describe('dispose', () => {
    it('leaves the signer account it was given able to send', async () => {
      sendTransactionMock.mockResolvedValue({ hash: DUMMY_HASH, fee: DUMMY_FEE })

      coordinator.dispose()

      // The account belongs to whoever built the coordinator, which erases its key itself.
      expect(await signerAccount.sendTransaction(TRANSACTION)).toEqual({
        hash: DUMMY_HASH,
        fee: DUMMY_FEE
      })
      expect(sendTransactionMock).toHaveBeenCalledWith(TRANSACTION)
    })

    it('stays disposed when disposed again', async () => {
      coordinator.dispose()
      coordinator.dispose()

      // Unlike the signer account it wraps, a second disposal is not an error.
      await expect(coordinator.sendTransaction(TRANSACTION)).rejects.toThrow(
        'The coordinator has been disposed.'
      )
    })
  })
})

describe('IMultisigCoordinator', () => {
  let coordinator

  beforeEach(() => {
    coordinator = new IMultisigCoordinator()
  })

  describe('sendTransaction', () => {
    it('is left to the implementation', async () => {
      await expect(coordinator.sendTransaction(TRANSACTION)).rejects.toThrow(
        new NotImplementedError('sendTransaction(tx)')
      )
    })
  })

  describe('dispose', () => {
    it('is left to the implementation', () => {
      expect(() => coordinator.dispose()).toThrow(new NotImplementedError('dispose()'))
    })
  })
})
