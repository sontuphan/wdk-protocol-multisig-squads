/**
 * The Squads member permissions, as the bits of a member's mask.
 *
 * @type {{ initiate: 1, vote: 2, execute: 4 }}
 */
export const PERMISSION: {
    initiate: 1;
    vote: 2;
    execute: 4;
};
/**
 * Solana Squads multisig wallet account implementation.
 *
 * @implements {IWalletAccountMultisig}
 * @implements {IMultisigOwnerManagement}
 */
export default class WalletAccountMultisigSolanaSquads extends WalletAccountReadOnlyMultisigSolanaSquads implements IWalletAccountMultisig, IMultisigOwnerManagement {
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
     * The derivation path's index of this account.
     *
     * @type {number}
     */
    get index(): number;
    /**
     * The derivation path of this account (see [SLIP-0010](https://slips.readthedocs.io/en/latest/slip-0010/)).
     *
     * @type {string}
     */
    get path(): string;
    /**
     * The key pair of the signer account.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * Returns the address of the Squads multisig account, resolving it from `createKeySecret` when
     * the config names no multisig itself.
     *
     * @returns {Promise<string>} The multisig address.
     * @throws {Error} If the multisig address cannot be resolved.
     */
    getAddress(): Promise<string>;
    /**
     * Returns the address of the member this account votes and proposes as.
     *
     * @returns {Promise<string>} The signer's address.
     */
    getSignerAddress(): Promise<string>;
    /**
     * Signs a message with the signer account.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The signature.
     */
    sign(message: string): Promise<string>;
    /**
     * Signs a transaction with the signer account. Not supported by Squads.
     *
     * @param {SolanaTransaction} tx - The transaction to sign.
     * @returns {Promise<SolanaTransaction>} The signed transaction.
     * @throws {NotSupportedError} Always, since a multisig cannot sign a transaction itself.
     */
    signTransaction(tx: SolanaTransaction): Promise<SolanaTransaction>;
    /**
     * Sends a transaction from the multisig. Not supported by Squads.
     *
     * @param {SolanaTransaction} tx - The transaction to send.
     * @returns {Promise<TransactionResult>} The transaction's result.
     * @throws {NotSupportedError} Always, since a multisig does not submit transactions itself.
     */
    sendTransaction(tx: SolanaTransaction): Promise<TransactionResult>;
    /**
     * Proposes a message to be signed by the multisig members. Not supported by Squads.
     *
     * @param {string} message - The message to propose.
     * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The message proposal.
     * @throws {NotSupportedError} Always, since Squads has no message-signing primitive.
     */
    proposeMessage(message: string): Promise<MultisigMessageProposal & MultisigSignature>;
    /**
     * Approves a pending message proposal. Not supported by Squads.
     *
     * @param {string} messageId - The hash of the proposed message.
     * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The updated message proposal.
     * @throws {NotSupportedError} Always, since Squads has no message-signing primitive.
     */
    approveMessageProposal(messageId: string): Promise<MultisigMessageProposal & MultisigSignature>;
    /**
     * Validates that the signer is a member of the multisig.
     *
     * @returns {Promise<void>} Resolves if the signer is a member, otherwise throws.
     * @throws {Error} If the signer is not a member of the multisig.
     */
    validateSignerIsOwner(): Promise<void>;
    /**
     * Creates the multisig account on-chain, deriving its address from the configured
     * `createKeySecret`.
     *
     * @param {string[]} [owners] - The member addresses. Defaults to this account's signer.
     * @param {number} [threshold] - The approvals a proposal needs (default: 1).
     * @returns {Promise<Pick<TransactionResult, 'hash'>>} The creation transaction's signature.
     * @throws {Error} If `createKeySecret` is missing, the arguments are invalid, the multisig already exists, or the quote exceeds `createMaxFee`.
     */
    deploy(owners?: string[], threshold?: number): Promise<Pick<TransactionResult, "hash">>;
    /**
     * Proposes a transaction to the multisig, open for voting. `tx` is either `{ to, value }` for a
     * SOL transfer or a message carrying `instructions`, which the vault executes as they stand.
     *
     * @param {SolanaTransaction} tx - The transaction to propose.
     * @param {MultisigTransactionOptions} [transactionOptions] - The multisig transaction's options. `autoExecute` executes the proposal in the same transaction only when it can: threshold 1, no time lock, and a signer holding both vote and execute. Where it cannot, it goes inert and the result's `status` stays `'pending'` rather than throwing.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {ValueError} If `tx` is neither `{ to, value }` nor a message the vault can execute.
     * @throws {Error} If the multisig does not exist, the signer cannot propose, or the RPC request fails.
     */
    propose(tx: SolanaTransaction, transactionOptions?: MultisigTransactionOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes an SPL token transfer to the multisig.
     *
     * @param {TransferOptions} transferOptions - The transfer options.
     * @param {MultisigTransactionOptions} [transactionOptions] - The multisig transaction's options. `autoExecute` executes the proposal in the same transaction only when it can: threshold 1, no time lock, and a signer holding both vote and execute. Where it cannot, it goes inert and the result's `status` stays `'pending'` rather than throwing.
     * @returns {Promise<SolanaMultisigProposalResult>} The transfer proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {Error} If the transfer options are invalid, the signer cannot propose, or the quote exceeds `transferMaxFee`.
     * @throws {NotSupportedError} If the mint belongs to the Token-2022 program. @todo Support Token-2022 (Token Extensions Program).
     */
    transfer(transferOptions: TransferOptions, transactionOptions?: MultisigTransactionOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Approves a pending transaction proposal.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @param {string} [memo] - An optional note recorded on chain with the vote. It costs rent, and an empty string is stored as a present-but-empty memo rather than none.
     * @returns {Promise<SolanaMultisigProposalResult>} The approval result.
     * @throws {NoSuchElementError} If no proposal exists at that id.
     * @throws {Error} If the proposal is not open to this signer's approval, or the RPC request fails.
     */
    approveProposal(proposalId: number | bigint | string, memo?: string): Promise<SolanaMultisigProposalResult>;
    /**
     * Rejects a pending transaction proposal.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @param {string} [memo] - An optional note recorded on chain with the vote. It costs rent, and an empty string is stored as a present-but-empty memo rather than none.
     * @returns {Promise<SolanaMultisigProposalResult>} The rejection result.
     * @throws {NoSuchElementError} If no proposal exists at that id.
     * @throws {Error} If the proposal is not open to this signer's rejection, or the RPC request fails.
     */
    rejectProposal(proposalId: number | bigint | string, memo?: string): Promise<SolanaMultisigProposalResult>;
    /**
     * Submits an approved proposal for on-chain execution.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<TransactionResult>} The execution transaction's result.
     * @throws {NoSuchElementError} If no proposal exists at that id.
     * @throws {ValueError} If the proposal has not reached the approval threshold, or its transaction account has been closed.
     * @throws {Error} If the proposal cannot be executed by this signer yet, or the RPC request fails.
     * @throws {NotImplementedError} If the proposal backs a batch.
     */
    executeProposal(proposalId: number | bigint | string): Promise<TransactionResult>;
    /**
     * Proposes adding a new member to the multisig.
     *
     * @param {string} ownerAddress - The address of the member to add.
     * @param {SolanaMultisigAddOwnerOptions} [options] - The operation options. `mask` is the member's Squads permissions (default: all three).
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {Error} If the addition or the resulting configuration is invalid, the signer cannot propose, or the RPC request fails.
     */
    addOwner(ownerAddress: string, options?: SolanaMultisigAddOwnerOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes removing a member from the multisig.
     *
     * @param {string} ownerAddress - The address of the member to remove.
     * @param {Partial<MultisigOptions>} [options] - The operation options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {Error} If the removal or the resulting configuration is invalid, the signer cannot propose, or the RPC request fails.
     */
    removeOwner(ownerAddress: string, options?: Partial<MultisigOptions>): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes swapping one member for another, the new member inheriting the old one's
     * permissions.
     *
     * @param {string} oldOwnerAddress - The address of the member to replace.
     * @param {string} newOwnerAddress - The address of the new member.
     * @param {Partial<MultisigOptions>} [options] - The operation options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {Error} If the swap or the resulting configuration is invalid, the signer cannot propose, or the RPC request fails.
     */
    swapOwner(oldOwnerAddress: string, newOwnerAddress: string, options?: Partial<MultisigOptions>): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes changing the approval threshold of the multisig.
     *
     * @param {number} newThreshold - The new threshold.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {Error} If the threshold is invalid or already in force, the signer cannot propose, or the RPC request fails.
     */
    changeThreshold(newThreshold: number): Promise<SolanaMultisigProposalResult>;
    /**
     * Returns a read-only copy of the account. The multisig address is resolved first, since the
     * copy carries no `createKeySecret` to resolve it from.
     *
     * @returns {Promise<WalletAccountReadOnlyMultisigSolanaSquads>} The read-only account.
     * @throws {Error} If the multisig address cannot be resolved.
     */
    toReadOnlyAccount(): Promise<WalletAccountReadOnlyMultisigSolanaSquads>;
    /**
     * Disposes the wallet account, erasing the private key from the memory.
     *
     * @returns {void} Nothing; the account cannot sign once disposed.
     */
    dispose(): void;
    /** @private */
    private _getCreateKeySigner;
    /** @private */
    private _proposeVaultTransaction;
    /** @private */
    private _proposeConfigTransaction;
    /** @private */
    private _requireDeployed;
    /** @private */
    private _proposeTransaction;
    /** @private */
    private _buildAutoExecuteInstructions;
    /** @private */
    /** @private */
    /** @private */
    /** @private */
    private _requirePermission;
    /** @private */
    private _requireVotableProposal;
    /** @private */
    private _buildProposalVoteInstruction;
    /** @private */
    private _buildConfigExecuteInstruction;
    /** @private */
    /** @private */
    private _buildVaultExecuteInstruction;
    /** @private */
    private _resolveExecutionAccounts;
    /** @private */
    private _getLookupTableAddresses;
    /** @private */
    private _requireAutonomous;
    /** @private */
    private _validateThreshold;
    /** @private */
    private _requireCanPropose;
    /** @private */
    private _requireViableMembers;
}
export type IWalletAccountMultisig = import("@tetherto/wdk-wallet/multisig").IWalletAccountMultisig;
export type IMultisigOwnerManagement = import("@tetherto/wdk-wallet/multisig").IMultisigOwnerManagement;
export type MultisigAutoExecuteResult = import("@tetherto/wdk-wallet/multisig").MultisigAutoExecuteResult;
export type MultisigProposal = import("@tetherto/wdk-wallet/multisig").MultisigProposal;
/**
 * `MultisigProposal` widened with the signature and fee of the transaction that carried the
 * call, plus `transaction` from `MultisigAutoExecuteResult`, which is set only when that same
 * call also executed the proposal.
 */
export type SolanaMultisigProposalResult = MultisigProposal & MultisigAutoExecuteResult & {
    hash: string;
    fee: bigint;
};
export type MultisigTransactionOptions = import("@tetherto/wdk-wallet/multisig").MultisigTransactionOptions;
export type MultisigOptions = import("@tetherto/wdk-wallet/multisig").MultisigOptions;
/**
 * `MultisigOptions` widened with the Squads permission mask to grant the member being added: a
 * bitwise OR of `PERMISSION.initiate`, `PERMISSION.vote` and `PERMISSION.execute`. Both fields
 * are optional; the threshold and the mask each keep their default when omitted.
 */
export type SolanaMultisigAddOwnerOptions = Partial<MultisigOptions> & {
    mask?: number;
};
export type MultisigMessageProposal = import("@tetherto/wdk-wallet/multisig").MultisigMessageProposal;
export type MultisigSignature = import("@tetherto/wdk-wallet/multisig").MultisigSignature;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type SolanaTransaction = import("@tetherto/wdk-wallet-solana").SolanaTransaction;
export type SolanaMultisigSquadsConfig = import("./wallet-account-read-only-multisig-solana-squads.js").SolanaMultisigSquadsConfig;
import WalletAccountReadOnlyMultisigSolanaSquads from './wallet-account-read-only-multisig-solana-squads.js';
import { WalletAccountSolana } from '@tetherto/wdk-wallet-solana';
