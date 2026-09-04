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

// ============================================
// Re-export types from @tetherto/wdk-wallet
// ============================================
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigInfo} MultisigInfo */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigProposal} MultisigProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigInteractionResult} MultisigInteractionResult */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigTransactionOptions} MultisigTransactionOptions */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigOptions} MultisigOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */

// ============================================
// Re-export types from @tetherto/wdk-wallet-solana
// ============================================
/** @typedef {import('@tetherto/wdk-wallet-solana').SimpleSolanaTransaction} SimpleSolanaTransaction */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransactionReceipt} SolanaTransactionReceipt */

// ============================================
// Re-export types from this package
// ============================================
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsSigningConfig} SolanaMultisigSquadsSigningConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsConfig} SolanaMultisigSquadsConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsReadOnlyConfig} SolanaMultisigSquadsReadOnlyConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigInfo} SolanaMultisigInfo */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigProposal} SolanaMultisigProposal */
/** @typedef {import('./src/wallet-account-multisig-solana-squads.js').SolanaMultisigProposalResult} SolanaMultisigProposalResult */
/** @typedef {import('./src/wallet-account-multisig-solana-squads.js').SolanaMultisigTransactionOptions} SolanaMultisigTransactionOptions */
/** @typedef {import('./src/wallet-account-multisig-solana-squads.js').SolanaMultisigAddOwnerOptions} SolanaMultisigAddOwnerOptions */
/** @typedef {import('./src/coordinators/index.js').MultisigCoordinatorFactory} MultisigCoordinatorFactory */

/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsMember} SquadsMember */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsMultisigAccount} SquadsMultisigAccount */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsProposalAccount} SquadsProposalAccount */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsAddressTableLookup} SquadsAddressTableLookup */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsTransactionMessage} SquadsTransactionMessage */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsTransactionKind} SquadsTransactionKind */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsConfigActionKind} SquadsConfigActionKind */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsConfigAction} SquadsConfigAction */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsTransactionAccount} SquadsTransactionAccount */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsProgramConfig} SquadsProgramConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SquadsProposalContext} SquadsProposalContext */

// ============================================
// Export classes and constants
// ============================================

export { default } from './src/wallet-manager-multisig-solana-squads.js'

export { default as WalletAccountReadOnlyMultisigSolanaSquads, SQUADS_PROGRAM_ADDRESS, TRANSACTION_KIND } from './src/wallet-account-read-only-multisig-solana-squads.js'

export { default as WalletAccountMultisigSolanaSquads, PERMISSION } from './src/wallet-account-multisig-solana-squads.js'

export { IMultisigCoordinator, LocalSignerCoordinator } from './src/coordinators/index.js'

// ============================================
// Re-export the errors this package throws
// ============================================

export { AccountNotOwnerError, ThresholdNotMetError } from '@tetherto/wdk-wallet/multisig'

export { AssertionError, InvalidTokenError, MaximumFeeExceededError, NoSuchElementError, NotImplementedError, ProviderError, ProviderErrorReason, ProviderRequiredError, UnsupportedOperationError, ValueError, WdkError } from '@tetherto/wdk-wallet'
