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
     * Returns the address of the Squads multisig account.
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
     * @param {string | Uint8Array} message - The message to sign.
     * @returns {Promise<string>} The signature.
     */
    sign(message: string | Uint8Array): Promise<string>;
    /**
     * Proposes a message to be signed by the multisig members. Not supported by Squads.
     *
     * @param {string | Uint8Array} message - The message to propose.
     * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The message proposal.
     * @throws {NotSupportedError} Always, since Squads has no message-signing primitive.
     */
    proposeMessage(message: string | Uint8Array): Promise<MultisigMessageProposal & MultisigSignature>;
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
     * @throws {Error} If the multisig does not exist, or the signer is not one of its members.
     */
    validateSignerIsOwner(): Promise<void>;
    /**
     * Creates the multisig account on-chain, deriving its address from the configured
     * `createKeySecret`.
     *
     * @param {string[]} [owners] - The member addresses. Defaults to this account's signer.
     * @param {number} [threshold] - The approvals a proposal needs (default: 1).
     * @returns {Promise<{ hash: string }>} The creation transaction's signature.
     * @throws {Error} If `createKeySecret` is missing, the owners or threshold are invalid,
     *   the multisig already exists, or the quoted fee exceeds `createMaxFee`.
     */
    deploy(owners?: string[], threshold?: number): Promise<{
        hash: string;
    }>;
    /**
     * Proposes a transaction to the multisig, open for voting.
     *
     * @param {SolanaTransaction} tx - The transaction to propose.
     * @param {MultisigTransactionOptions} [transactionOptions] - The multisig transaction's options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
     * @throws {Error} If the multisig does not exist, the signer cannot propose, or the RPC
     *   request fails.
     * @todo Support transaction messages beyond a native transfer.
     */
    propose(tx: SolanaTransaction, transactionOptions?: MultisigTransactionOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes an SPL token transfer to the multisig.
     *
     * @param {TransferOptions} transferOptions - The transfer options.
     * @param {MultisigTransactionOptions} [transactionOptions] - The multisig transaction's options.
     * @returns {Promise<SolanaMultisigProposalResult>} The transfer proposal result.
     * @throws {Error} If the mint or recipient is malformed, the mint does not exist, the
     *   signer cannot propose, or the quote exceeds `transferMaxFee`.
     * @throws {NotSupportedError} If the mint belongs to the Token-2022 program.
     * @todo Support Token-2022 (Token Extensions Program).
     */
    transfer(transferOptions: TransferOptions, transactionOptions?: MultisigTransactionOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Approves a pending transaction proposal.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @param {string} [memo] - An optional note recorded on chain with the vote. It costs
     *   rent, and an empty string is stored as a present-but-empty memo rather than none.
     * @returns {Promise<SolanaMultisigProposalResult>} The approval result.
     * @throws {NoSuchElementError} If no proposal exists at that id.
     * @throws {Error} If the id is invalid, the multisig does not exist, the signer cannot
     *   vote, the proposal is not open for voting, the signer has already approved it, or the
     *   RPC request fails.
     */
    approveProposal(proposalId: number | bigint | string, memo?: string): Promise<SolanaMultisigProposalResult>;
    /**
     * Rejects a pending transaction proposal.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @param {string} [memo] - An optional note recorded on chain with the vote. It costs
     *   rent, and an empty string is stored as a present-but-empty memo rather than none.
     * @returns {Promise<SolanaMultisigProposalResult>} The rejection result.
     * @throws {NoSuchElementError} If no proposal exists at that id.
     * @throws {Error} If the id is invalid, the multisig does not exist, the signer cannot
     *   vote, the proposal is not open for voting, the signer has already rejected it, or the
     *   RPC request fails.
     */
    rejectProposal(proposalId: number | bigint | string, memo?: string): Promise<SolanaMultisigProposalResult>;
    /**
     * Submits an approved proposal for on-chain execution.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<TransactionResult>} The execution transaction's result.
     * @throws {NoSuchElementError} If no proposal exists at that id.
     * @throws {ValueError} If the proposal has not reached the approval threshold.
     * @throws {Error} If the id is invalid, the multisig does not exist, the signer cannot
     *   execute, its time lock has not elapsed, a config proposal has been invalidated, or the
     *   RPC request fails.
     * @throws {NotImplementedError} If the proposal backs a batch.
     */
    executeProposal(proposalId: number | bigint | string): Promise<TransactionResult>;
    /**
     * Proposes adding a new member to the multisig, with full permissions.
     *
     * @param {string} ownerAddress - The address of the member to add.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
     * @throws {Error} If the address is malformed or already a member, the threshold is out of
     *   range, the multisig does not exist or is controlled by a configuration authority, the
     *   signer cannot propose, or the RPC request fails.
     * @todo Let the caller choose the new member's permissions.
     */
    addOwner(ownerAddress: string, options?: MultisigOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes removing a member from the multisig.
     *
     * @param {string} ownerAddress - The address of the member to remove.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
     * @throws {Error} If the address is malformed or not a member, the removal would leave the
     *   multisig with no members or nobody able to vote, propose or execute, the threshold would
     *   exceed the remaining voters, the multisig does not exist or is controlled by a
     *   configuration authority, the signer cannot propose, or the RPC request fails.
     */
    removeOwner(ownerAddress: string, options?: MultisigOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes swapping one member for another, the new member inheriting the old one's
     * permissions.
     *
     * @param {string} oldOwnerAddress - The address of the member to replace.
     * @param {string} newOwnerAddress - The address of the new member.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
     * @throws {Error} If either address is malformed, they are equal, the old address is not a
     *   member, the new one already is, the threshold would exceed the resulting voters, the
     *   multisig does not exist or is controlled by a configuration authority, the signer cannot
     *   propose, or the RPC request fails.
     */
    swapOwner(oldOwnerAddress: string, newOwnerAddress: string, options?: MultisigOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes changing the approval threshold of the multisig.
     *
     * @param {number} newThreshold - The new threshold.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
     * @throws {Error} If the threshold is not an integer between 1 and the number of owners able
     *   to vote, is the threshold already in force, the multisig does not exist or is controlled
     *   by a configuration authority, the signer cannot propose, or the RPC request fails.
     */
    changeThreshold(newThreshold: number): Promise<SolanaMultisigProposalResult>;
    /**
     * Returns a read-only copy of the account.
     *
     * @returns {WalletAccountReadOnlyMultisigSolanaSquads} The read-only account.
     */
    toReadOnlyAccount(): WalletAccountReadOnlyMultisigSolanaSquads;
    /**
     * Disposes the wallet account, erasing the private key from the memory.
     *
     * @returns {void} Nothing; the account cannot sign once disposed.
     */
    dispose(): void;
    /** @private */
    private _getCreateKeySigner;
    /** @private */
    private _validateOwners;
    /** @private */
    private _proposeVaultTransaction;
    /** @private */
    private _requireDeployed;
    /** @private */
    private _proposeTransaction;
    /** @private */
    private _buildAutoExecuteInstructions;
    /** @private */
    private _canAutoExecute;
    /** @private */
    private _encodeTransactionMessage;
    /** @private */
    private _compileTransactionMessage;
    /** @private */
    private _requirePermission;
    /** @private */
    private _requireVotableProposal;
    /** @private */
    private _buildProposalVoteInstruction;
    /** @private */
    private _buildConfigExecuteInstruction;
    /** @private */
    private _resolveSpendingLimitAccounts;
    /** @private */
    private _buildVaultExecuteInstruction;
    /** @private */
    private _resolveExecutionAccounts;
    /** @private */
    private _getLookupTableAddresses;
    /** @private */
    private _isStaticWritableIndex;
    /** @private */
    private _toAccountRole;
    /** @private */
    private _encodeProposalVoteData;
    /** @private */
    private _requireAutonomous;
    /** @private */
    private _validateThreshold;
    /** @private */
    private _requireCanPropose;
    /** @private */
    private _countVoters;
    /** @private */
    private _requireViableMembers;
    /** @private */
    private _encodeRemoveMemberAction;
    /** @private */
    private _encodeAddMemberAction;
    /** @private */
    private _encodeChangeThresholdAction;
    /** @private */
    private _encodeConfigTransactionCreateData;
    /** @private */
    private _encodeVaultTransactionCreateData;
    /** @private */
    private _encodeProposalCreateData;
    /** @private */
    private _encodeMultisigCreateV2Data;
}
export type IWalletAccountMultisig = import("@tetherto/wdk-wallet/multisig").IWalletAccountMultisig;
export type IMultisigOwnerManagement = import("@tetherto/wdk-wallet/multisig").IMultisigOwnerManagement;
export type MultisigAutoExecuteResult = import("@tetherto/wdk-wallet/multisig").MultisigAutoExecuteResult;
export type MultisigProposal = import("@tetherto/wdk-wallet/multisig").MultisigProposal;
/**
 * `MultisigProposal` widened with the signature and fee of the transaction that carried the call.
 */
export type SolanaMultisigProposalResult = MultisigProposal & MultisigAutoExecuteResult & {
    hash: string;
    fee: bigint;
};
export type MultisigTransactionOptions = import("@tetherto/wdk-wallet/multisig").MultisigTransactionOptions;
export type MultisigOptions = import("@tetherto/wdk-wallet/multisig").MultisigOptions;
export type MultisigMessageProposal = import("@tetherto/wdk-wallet/multisig").MultisigMessageProposal;
export type MultisigSignature = import("@tetherto/wdk-wallet/multisig").MultisigSignature;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type SolanaTransaction = import("@tetherto/wdk-wallet-solana").SolanaTransaction;
export type SolanaMultisigSquadsConfig = import("./wallet-account-read-only-multisig-solana-squads.js").SolanaMultisigSquadsConfig;
import WalletAccountReadOnlyMultisigSolanaSquads from './wallet-account-read-only-multisig-solana-squads.js';
import { WalletAccountSolana } from '@tetherto/wdk-wallet-solana';
