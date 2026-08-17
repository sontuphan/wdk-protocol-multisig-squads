/** @typedef {import('./transports/squads-transaction-transport-interface.js').default} ISquadsTransactionTransport */
/** @typedef {import('@tetherto/wdk-wallet/multisig').IWalletAccountMultisig} IWalletAccountMultisig */
/** @typedef {import('@tetherto/wdk-wallet/multisig').IMultisigOwnerManagement} IMultisigOwnerManagement */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigAutoExecuteResult} MultisigAutoExecuteResult */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigProposal} MultisigProposal */
/**
 * `MultisigProposal` widened with the signature and fee of the transaction that carried the
 * call, plus `transaction` from `MultisigAutoExecuteResult`, which is set only when that same
 * call also executed the proposal.
 *
 * @typedef {MultisigProposal & MultisigAutoExecuteResult & { hash: string, fee: bigint }} SolanaMultisigProposalResult
 */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigTransactionOptions} MultisigTransactionOptions */
/**
 * `MultisigTransactionOptions` widened with the vault the proposal spends from: an index between 0
 * and 255, which the stored transaction carries so the program signs with the same vault the
 * message was compiled against. It defaults to the main vault, 0.
 *
 * @typedef {MultisigTransactionOptions & { vaultIndex?: number }} SolanaMultisigTransactionOptions
 */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigOptions} MultisigOptions */
/**
 * `MultisigOptions` widened with the Squads permission mask to grant the member being added: a
 * bitwise OR of `PERMISSION.initiate`, `PERMISSION.vote` and `PERMISSION.execute`. Both fields
 * are optional; the threshold and the mask each keep their default when omitted.
 *
 * @typedef {Partial<MultisigOptions> & { mask?: number }} SolanaMultisigAddOwnerOptions
 */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@solana/signers').KeyPairSigner} KeyPairSigner */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */
/** @typedef {import('./wallet-account-read-only-multisig-solana-squads.js').SolanaMultisigSquadsConfig} SolanaMultisigSquadsConfig */
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
     * Builds the signer a multisig is created with, from the secret its create key derives from.
     *
     * @param {string | Uint8Array} createKeySecret - The create key's secret. Base58 or raw bytes, either a 32-byte private key or a 64-byte keypair.
     * @returns {Promise<KeyPairSigner>} The create key signer.
     */
    static getCreateKeySigner(createKeySecret: string | Uint8Array): Promise<KeyPairSigner>;
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
     * The transport every operation is signed and broadcast through. The account builds the
     * instructions; nothing below this field knows how they reach the cluster.
     *
     * @protected
     * @type {ISquadsTransactionTransport}
     */
    protected _transport: ISquadsTransactionTransport;
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
     * @throws {UnsupportedOperationError} A multisig is a program-derived address and cannot sign.
     */
    signTransaction(tx: SolanaTransaction): Promise<SolanaTransaction>;
    /**
     * Sends a transaction from the multisig. Not supported by Squads.
     *
     * @param {SolanaTransaction} tx - The transaction to send.
     * @returns {Promise<TransactionResult>} The transaction's result.
     * @throws {UnsupportedOperationError} A multisig proposes transactions rather than submitting them.
     */
    sendTransaction(tx: SolanaTransaction): Promise<TransactionResult>;
    /**
     * Validates that the signer is a member of the multisig.
     *
     * @returns {Promise<void>} Resolves if the signer is a member, otherwise throws.
     * @throws {Error} The signer must be a member of the multisig.
     */
    validateSignerIsOwner(): Promise<void>;
    /**
     * Creates the multisig account on-chain, deriving its address from the configured
     * `createKeySecret`.
     *
     * @param {string[]} [owners] - The member addresses. Defaults to this account's signer.
     * @param {number} [threshold] - The approvals a proposal needs (default: 1).
     * @returns {Promise<Pick<TransactionResult, 'hash'>>} The creation transaction's signature.
     * @throws {Error} `createKeySecret` must be configured, the arguments must be valid, the multisig must not exist yet, and the quote must stay within `createMaxFee`.
     */
    deploy(owners?: string[], threshold?: number): Promise<Pick<TransactionResult, "hash">>;
    /**
     * Proposes a transaction to the multisig, open for voting. `tx` is either `{ to, value }` for a
     * SOL transfer or a message carrying `instructions`, which the vault executes as they stand.
     *
     * @param {SolanaTransaction} tx - The transaction to propose.
     * @param {SolanaMultisigTransactionOptions} [transactionOptions] - The multisig transaction's options. `vaultIndex` names the vault to spend from (default: 0). `autoExecute` executes the proposal in the same transaction only when it can: threshold 1, no time lock, and a signer holding both vote and execute. Where it cannot, it goes inert and the result's `status` stays `'pending'` rather than throwing.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     */
    propose(tx: SolanaTransaction, { vaultIndex, ...transactionOptions }?: SolanaMultisigTransactionOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes an SPL token transfer to the multisig.
     *
     * @param {TransferOptions} transferOptions - The transfer options.
     * @param {SolanaMultisigTransactionOptions} [transactionOptions] - The multisig transaction's options. `vaultIndex` names the vault to spend from (default: 0). `autoExecute` executes the proposal in the same transaction only when it can: threshold 1, no time lock, and a signer holding both vote and execute. Where it cannot, it goes inert and the result's `status` stays `'pending'` rather than throwing.
     * @returns {Promise<SolanaMultisigProposalResult>} The transfer proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {Error} The transfer options must be valid, the signer must be allowed to propose, and the quote must stay within `transferMaxFee`.
     * @todo Support Token-2022 (Token Extensions Program), whose associated token accounts this method does not derive.
     */
    transfer(transferOptions: TransferOptions, { vaultIndex, ...transactionOptions }?: SolanaMultisigTransactionOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Approves a pending transaction proposal.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @param {string} [memo] - An optional note recorded on chain with the vote. It costs rent, and an empty string is stored as a present-but-empty memo rather than none.
     * @returns {Promise<SolanaMultisigProposalResult>} The approval result.
     * @throws {Error} The proposal must be open to this signer's approval, and the RPC request must succeed.
     */
    approveProposal(proposalId: number | bigint | string, memo?: string): Promise<SolanaMultisigProposalResult>;
    /**
     * Rejects a pending transaction proposal.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @param {string} [memo] - An optional note recorded on chain with the vote. It costs rent, and an empty string is stored as a present-but-empty memo rather than none.
     * @returns {Promise<SolanaMultisigProposalResult>} The rejection result.
     * @throws {Error} The proposal must be open to this signer's rejection, and the RPC request must succeed.
     */
    rejectProposal(proposalId: number | bigint | string, memo?: string): Promise<SolanaMultisigProposalResult>;
    /**
     * Submits an approved proposal for on-chain execution.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<TransactionResult>} The execution transaction's result.
     * @throws {NoSuchElementError} A proposal must exist at that id.
     * @throws {ValueError} The proposal must have reached the approval threshold, and its transaction account must still be open.
     * @throws {Error} The proposal must be executable by this signer, and the RPC request must succeed.
     */
    executeProposal(proposalId: number | bigint | string): Promise<TransactionResult>;
    /**
     * Proposes adding a new member to the multisig.
     *
     * @param {string} ownerAddress - The address of the member to add.
     * @param {SolanaMultisigAddOwnerOptions} [options] - The operation options. `mask` is the member's Squads permissions (default: all three).
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {Error} The addition and the resulting configuration must be valid, the signer must be allowed to propose, and the RPC request must succeed.
     */
    addOwner(ownerAddress: string, { mask, threshold }?: SolanaMultisigAddOwnerOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes removing a member from the multisig.
     *
     * @param {string} ownerAddress - The address of the member to remove.
     * @param {Partial<MultisigOptions>} [options] - The operation options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {Error} The removal and the resulting configuration must be valid, the signer must be allowed to propose, and the RPC request must succeed.
     */
    removeOwner(ownerAddress: string, { threshold }?: Partial<MultisigOptions>): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes swapping one member for another, the new member inheriting the old one's
     * permissions.
     *
     * @param {string} oldOwnerAddress - The address of the member to replace.
     * @param {string} newOwnerAddress - The address of the new member.
     * @param {Partial<MultisigOptions>} [options] - The operation options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {Error} The swap and the resulting configuration must be valid, the signer must be allowed to propose, and the RPC request must succeed.
     */
    swapOwner(oldOwnerAddress: string, newOwnerAddress: string, { threshold }?: Partial<MultisigOptions>): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes changing the approval threshold of the multisig.
     *
     * @param {number} newThreshold - The new threshold.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result. `fee` is the network fee plus the rent the transaction and proposal accounts lock up, the same basis the quotes use.
     * @throws {Error} The threshold must be valid and not already in force, the signer must be allowed to propose, and the RPC request must succeed.
     */
    changeThreshold(newThreshold: number): Promise<SolanaMultisigProposalResult>;
    /**
     * Returns a read-only copy of the account. The multisig address is resolved first, since the
     * copy carries no `createKeySecret` to resolve it from.
     *
     * @returns {Promise<WalletAccountReadOnlyMultisigSolanaSquads>} The read-only account.
     */
    toReadOnlyAccount(): Promise<WalletAccountReadOnlyMultisigSolanaSquads>;
    /**
     * Disposes the wallet account, erasing the private key from the memory.
     */
    dispose(): void;
    /** @private */
    private _proposeVaultTransaction;
    /** @private */
    private _getRentPayerAccount;
    /** @private */
    private _proposeConfigTransaction;
    /** @private */
    private _requireDeployed;
    /** @private */
    private _proposeTransaction;
    /** @private */
    private _buildAutoExecuteInstructions;
    /** @private */
    private _requirePermission;
    /** @private */
    private _requireVotableProposal;
    /** @private */
    private _buildProposalVoteInstruction;
    /** @private */
    private _buildConfigExecuteInstruction;
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
    private _requireViableMembers;
}
export type ISquadsTransactionTransport = import("./transports/squads-transaction-transport-interface.js").default;
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
/**
 * `MultisigTransactionOptions` widened with the vault the proposal spends from: an index between 0
 * and 255, which the stored transaction carries so the program signs with the same vault the
 * message was compiled against. It defaults to the main vault, 0.
 */
export type SolanaMultisigTransactionOptions = MultisigTransactionOptions & {
    vaultIndex?: number;
};
export type MultisigOptions = import("@tetherto/wdk-wallet/multisig").MultisigOptions;
/**
 * `MultisigOptions` widened with the Squads permission mask to grant the member being added: a
 * bitwise OR of `PERMISSION.initiate`, `PERMISSION.vote` and `PERMISSION.execute`. Both fields
 * are optional; the threshold and the mask each keep their default when omitted.
 */
export type SolanaMultisigAddOwnerOptions = Partial<MultisigOptions> & {
    mask?: number;
};
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type KeyPairSigner = import("@solana/signers").KeyPairSigner;
export type SolanaTransaction = import("@tetherto/wdk-wallet-solana").SolanaTransaction;
export type SolanaMultisigSquadsConfig = import("./wallet-account-read-only-multisig-solana-squads.js").SolanaMultisigSquadsConfig;
import WalletAccountReadOnlyMultisigSolanaSquads from './wallet-account-read-only-multisig-solana-squads.js';
import { WalletAccountSolana } from '@tetherto/wdk-wallet-solana';
