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
/** @typedef {import('@tetherto/wdk-wallet').MultisigProposal} MultisigProposal */
/** @typedef {import('@tetherto/wdk-wallet').MultisigResult} MultisigResult */
/** @typedef {import('@tetherto/wdk-wallet').MultisigTransactionResult} MultisigTransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').MultisigExecuteResult} MultisigExecuteResult */
/** @typedef {import('@tetherto/wdk-wallet').MultisigSendOptions} MultisigSendOptions */
/** @typedef {import('@tetherto/wdk-wallet').MultisigOptions} MultisigOptions */
/** @typedef {import('@tetherto/wdk-wallet').MultisigInfo} MultisigInfo */
/** @typedef {import('@tetherto/wdk-wallet').MessageInfo} MessageInfo */
/** @typedef {import('@tetherto/wdk-wallet').MessageProposal} MessageProposal */

// ============================================
// Re-export types from @tetherto/wdk-wallet-solana
// ============================================
/** @typedef {import('@tetherto/wdk-wallet-solana').SimpleSolanaTransaction} SimpleSolanaTransaction */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransactionReceipt} SolanaTransactionReceipt */

// ============================================
// Re-export types from this package
// ============================================
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsCommonConfig} SolanaMultisigSquadsCommonConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsSigningConfig} SolanaMultisigSquadsSigningConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsConfig} SolanaMultisigSquadsConfig */
/** @typedef {import('./src/wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsReadOnlyConfig} SolanaMultisigSquadsReadOnlyConfig */

// ============================================
// Export classes and constants
// ============================================

export { default } from './src/wallet-manager-multisig-solana-squads.js'

export { default as WalletAccountReadOnlyMultisigSolanaSquads, DEFAULT_COMMITMENT, SQUADS_PROGRAM_ADDRESS } from './src/wallet-account-read-only-multisig-solana-squads.js'

export { default as WalletAccountMultisigSolanaSquads } from './src/wallet-account-multisig-solana-squads.js'

export { NotSupportedError } from './src/errors.js'
