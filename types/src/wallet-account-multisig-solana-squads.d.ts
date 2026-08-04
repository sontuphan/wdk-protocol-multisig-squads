/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountMultisig} IWalletAccountMultisig */
/** @typedef {import('@tetherto/wdk-wallet').MultisigResult} MultisigResult */
/** @typedef {import('@tetherto/wdk-wallet').MultisigTransactionResult} MultisigTransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').MultisigExecuteResult} MultisigExecuteResult */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigTransactionOptions} MultisigTransactionOptions */
/** @typedef {import('@tetherto/wdk-wallet').MultisigOptions} MultisigOptions */
/** @typedef {import('@tetherto/wdk-wallet').MessageProposal} MessageProposal */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */
/** @typedef {import('./wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsConfig} SolanaMultisigSquadsConfig */
/**
 * Solana Squads multisig wallet account with signing capabilities.
 * Provides full transaction and message signing operations.
 *
 * @implements {IWalletAccountMultisig}
 */
export default class WalletAccountMultisigSolanaSquads extends WalletAccountReadOnlyMultisigSolanaSquads implements IWalletAccountMultisig {
    /**
     * Creates a new Solana Squads multisig wallet account.
     *
     * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
     * @param {string} path - The SLIP-0010 derivation path (e.g. "0'/0'").
     * @param {SolanaMultisigSquadsConfig} config - The configuration object.
     */
    constructor(seed: string | Uint8Array, path: string, config: SolanaMultisigSquadsConfig);
    /**
     * The underlying Solana signer account.
     *
     * @protected
     * @type {WalletAccountSolana}
     */
    protected _signerAccount: WalletAccountSolana;
    /**
     * Signs a message with the signer account.
     *
     * @param {string | Uint8Array} message - The message to sign.
     * @returns {Promise<string>} The signature.
     */
    sign(message: string | Uint8Array): Promise<string>;
    /**
     * Proposes a message to be signed by the multisig members.
     *
     * **Not supported, and not pending work.** Squads has no message-signing primitive,
     * and a multisig cannot produce a signature: its accounts are program-derived
     * addresses with no private key. Members can approve a message on-chain by wrapping
     * it in a vault transaction, but that yields proof of approval rather than a
     * signature — and the resulting proposal is addressed by transaction index, not by
     * message hash, so {@link approveMessage} could not find it again.
     *
     * Use {@link sign} to sign a message with this account's own signer key, which proves
     * one member's consent rather than the multisig's.
     *
     * @param {string | Uint8Array} message - The message to propose.
     * @returns {Promise<MessageProposal>} The message proposal.
     * @throws {NotSupportedError} Always, for the reasons above.
     */
    proposeMessage(message: string | Uint8Array): Promise<MessageProposal>;
    /**
     * Approves a pending message proposal.
     *
     * **Not supported, and not pending work.** See {@link proposeMessage}: Squads has no
     * message-signing primitive, and a message hash cannot be resolved to a Squads
     * account, which are keyed by sequential transaction index.
     *
     * @param {string} messageHash - The hash of the proposed message.
     * @returns {Promise<MessageProposal>} The updated message proposal.
     * @throws {NotSupportedError} Always, for the reasons above.
     */
    approveMessage(messageHash: string): Promise<MessageProposal>;
    /**
     * Validates that the signer is a member of the multisig.
     *
     * Checks membership only — not the permission a given operation requires.
     *
     * @returns {Promise<void>}
     * @throws {Error} If there is no signer, the multisig does not exist, or the signer is
     *   not one of its members.
     */
    validateSignerIsOwner(): Promise<void>;
    /**
     * Deploys (creates) the multisig account on-chain.
     *
     * Requires `createKeySecret` in the configuration: the multisig's address derives from
     * that key, so **retain it** — losing it makes the address, and any funds in its vault,
     * unrecoverable.
     *
     * Owners default to this account's signer alone with a threshold of 1, creating a
     * single-member multisig that {@link addOwner} can grow. Every owner is created with
     * full permissions.
     *
     * @param {string[]} [owners] - The member addresses. Defaults to this account's signer.
     * @param {number} [threshold=1] - The approvals a proposal needs.
     * @returns {Promise<{ hash: string }>} The creation transaction's signature.
     * @throws {Error} If `createKeySecret` is missing, the owners or threshold are invalid,
     *   the multisig already exists, or the quoted fee exceeds `createMaxFee`.
     */
    deploy(owners?: string[], threshold?: number): Promise<{
        hash: string;
    }>;
    /**
     * Proposes a transaction to the multisig.
     *
     * The proposal is created open for voting, with no approvals of its own — creating a
     * proposal is not a vote, so `confirmations` is 0 even for the proposer.
     *
     * The proposal takes the multisig's next transaction index. If another member proposes
     * first, that index is taken and this call fails; the error is surfaced rather than
     * retried, because retrying would sign and send a second transaction.
     *
     * @param {SolanaTransaction} tx - The transaction to propose.
     * @param {MultisigTransactionOptions} [options] - The send options.
     * @returns {Promise<MultisigTransactionResult>} The proposal result.
     * @throws {Error} If the multisig does not exist, the signer cannot propose, or the RPC
     *   request fails.
     * @todo Support `autoExecute`, and transaction messages beyond a native transfer.
     */
    sendTransaction(tx: SolanaTransaction, options?: MultisigTransactionOptions): Promise<MultisigTransactionResult>;
    /**
     * Proposes an SPL token transfer to the multisig.
     *
     * Native SOL transfers go through {@link sendTransaction} instead. Token-2022 mints are
     * refused rather than transferred to an address this package cannot derive.
     *
     * Creating the recipient's token account, when it has none, is paid for by the vault at
     * execution rather than by the proposer — so a vault holding enough tokens but too little
     * SOL will propose and collect approvals, then fail to execute.
     *
     * @param {TransferOptions} transferOptions - The transfer options.
     * @param {MultisigTransactionOptions} [options] - The send options.
     * @returns {Promise<MultisigTransactionResult>} The transfer proposal result.
     * @throws {Error} If the mint or recipient is malformed, the mint does not exist, the
     *   signer cannot propose, or the quote exceeds `transferMaxFee`.
     * @throws {NotSupportedError} If the mint belongs to the Token-2022 program.
     * @todo Support Token-2022 (Token Extensions Program).
     * @todo Support `autoExecute`.
     */
    transfer(transferOptions: TransferOptions, options?: MultisigTransactionOptions): Promise<MultisigTransactionResult>;
    /**
     * Approves a pending transaction proposal.
     *
     * A previous rejection does not block an approval: Squads withdraws the rejection, so a
     * member can change their vote. Approving twice is refused.
     *
     * The returned `confirmations` reaching the threshold means the proposal has just become
     * approved, not that it ran — execution is a separate step, so `executed` is always
     * `false`.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @param {string} [memo] - An optional note recorded on chain with the vote. It costs
     *   rent, and an empty string is stored as a present-but-empty memo rather than none.
     * @returns {Promise<MultisigTransactionResult>} The approval result.
     * @throws {Error} If the id is invalid, the multisig or proposal does not exist, the
     *   signer cannot vote, the proposal is not open for voting, the signer has already
     *   approved it, or the RPC request fails.
     */
    approveTx(proposalId: number | bigint | string, memo?: string): Promise<MultisigTransactionResult>;
    /**
     * Rejects a pending transaction proposal.
     *
     * @param {number | bigint} proposalId - The proposal (transaction index) id.
     * @returns {Promise<MultisigTransactionResult>} The rejection result.
     */
    rejectTx(proposalId: number | bigint): Promise<MultisigTransactionResult>;
    /**
     * Executes an approved transaction proposal.
     *
     * @param {number | bigint} proposalId - The proposal (transaction index) id.
     * @returns {Promise<MultisigExecuteResult>} The execution result.
     */
    executeTx(proposalId: number | bigint): Promise<MultisigExecuteResult>;
    /**
     * Proposes adding a new member to the multisig.
     *
     * @param {string} ownerAddress - The address of the member to add.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<MultisigTransactionResult>} The operation result.
     */
    addOwner(ownerAddress: string, options?: MultisigOptions): Promise<MultisigTransactionResult>;
    /**
     * Proposes removing a member from the multisig.
     *
     * @param {string} ownerAddress - The address of the member to remove.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<MultisigTransactionResult>} The operation result.
     */
    removeOwner(ownerAddress: string, options?: MultisigOptions): Promise<MultisigTransactionResult>;
    /**
     * Proposes swapping one member for another.
     *
     * @param {string} oldOwnerAddress - The address of the member to replace.
     * @param {string} newOwnerAddress - The address of the new member.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<MultisigTransactionResult>} The operation result.
     */
    swapOwner(oldOwnerAddress: string, newOwnerAddress: string, options?: MultisigOptions): Promise<MultisigTransactionResult>;
    /**
     * Proposes changing the approval threshold of the multisig.
     *
     * @param {number} newThreshold - The new threshold.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<MultisigTransactionResult>} The operation result.
     */
    changeThreshold(newThreshold: number, options?: MultisigOptions): Promise<MultisigTransactionResult>;
    /**
     * Proposes replacing the full member set and threshold in a single operation.
     *
     * @param {string[]} newOwners - The new member addresses.
     * @param {number} newThreshold - The new threshold.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<MultisigTransactionResult>} The operation result.
     */
    updateOwners(newOwners: string[], newThreshold: number, options?: MultisigOptions): Promise<MultisigTransactionResult>;
    /**
     * Returns a read-only view of this account.
     *
     * @returns {WalletAccountReadOnlyMultisigSolanaSquads} The read-only account.
     */
    toReadOnlyAccount(): WalletAccountReadOnlyMultisigSolanaSquads;
    /**
     * Clears the signer's private key material from memory.
     *
     * @returns {void}
     */
    dispose(): void;
    /** @private */
    private _getCreateKeySigner;
    /** @private */
    private _validateOwners;
    /**
     * Proposes a vault transaction carrying the given message, opening it for voting.
     *
     * @private
     */
    private _proposeVaultTransaction;
    /** @private */
    private _encodeTransactionMessage;
    /**
     * Compiles instructions into the message Squads takes as an instruction argument.
     *
     * Note this is not the message the program then stores: the argument uses one-byte
     * length prefixes where the stored account uses four-byte ones.
     *
     * @private
     */
    private _compileTransactionMessage;
    /** @private */
    private _requirePermission;
    /**
     * Builds a `proposalApprove` or `proposalReject` instruction.
     *
     * Kept separate from the methods that send it so a future `autoExecute` can pack a vote
     * and an execution into one transaction.
     *
     * @private
     */
    private _buildProposalVoteInstruction;
    /** @private */
    private _encodeProposalVoteData;
    /** @private */
    private _encodeVaultTransactionCreateData;
    /** @private */
    private _encodeProposalCreateData;
    /** @private */
    private _encodeMultisigCreateV2Data;
}
export type IWalletAccountMultisig = any;
export type MultisigResult = import("@tetherto/wdk-wallet").MultisigResult;
export type MultisigTransactionResult = import("@tetherto/wdk-wallet").MultisigTransactionResult;
export type MultisigExecuteResult = import("@tetherto/wdk-wallet").MultisigExecuteResult;
export type MultisigTransactionOptions = import("@tetherto/wdk-wallet/multisig").MultisigTransactionOptions;
export type MultisigOptions = import("@tetherto/wdk-wallet").MultisigOptions;
export type MessageProposal = import("@tetherto/wdk-wallet").MessageProposal;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type SolanaTransaction = import("@tetherto/wdk-wallet-solana").SolanaTransaction;
export type SolanaMultisigSquadsConfig = import("./wallet-account-read-only-multisig-solana-squads.js").SolanaMultisigSquadsConfig;
import WalletAccountReadOnlyMultisigSolanaSquads from './wallet-account-read-only-multisig-solana-squads.js';
import { WalletAccountSolana } from '@tetherto/wdk-wallet-solana';
