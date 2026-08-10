/** @typedef {ReturnType<typeof import('@solana/rpc').createSolanaRpc>} SolanaRpc */
/** @typedef {import('@solana/rpc-types').Commitment} Commitment */
/** @typedef {import('@solana/addresses').Address} Address */
/** @typedef {import('@tetherto/wdk-wallet/multisig').IWalletAccountReadOnlyMultisig} IWalletAccountReadOnlyMultisig */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigInfo} MultisigInfo */
/**
 * @typedef {MultisigInfo & { masks: number[] }} SolanaMultisigInfo
 *   `MultisigInfo` widened with each owner's Squads permission mask, aligned with `owners`.
 */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigMessageProposal} MultisigMessageProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigProposal} MultisigProposal */
/**
 * @typedef {MultisigProposal & { statusName: string, approved: string[], rejected: string[], cancelled: string[] }} SolanaMultisigProposal
 *   `MultisigProposal` widened with the proposal's Squads status and its vote lists.
 */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransactionReceipt} SolanaTransactionReceipt */
/**
 * @typedef {Object} SolanaMultisigSquadsCommonConfig
 * @property {string | string[]} provider - A Solana RPC URL, or a list of URLs for failover.
 * @property {Commitment} [commitment='confirmed'] - The commitment level for transactions.
 * @property {number} [retries=3] - The number of retries for the failover provider.
 * @property {string} [programId] - An override for the Squads program address.
 * @property {string} [multisigPda] - The address of an existing Squads multisig to operate on.
 * @property {string} [createKey] - The create key used to derive a new multisig PDA on creation.
 */
/**
 * @typedef {Object} SolanaMultisigSquadsSigningConfig
 * @property {string | Uint8Array} [createKeySecret] - The create key's secret, required to
 *   deploy a multisig. Base58 or raw bytes, either a 32-byte private key or a 64-byte keypair.
 * @property {number | bigint} [createMaxFee] - The maximum fee amount for the create/deploy operation.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfers.
 */
/** @typedef {SolanaMultisigSquadsCommonConfig & SolanaMultisigSquadsSigningConfig} SolanaMultisigSquadsConfig */
/** @typedef {SolanaMultisigSquadsCommonConfig} SolanaMultisigSquadsReadOnlyConfig */
export const SQUADS_PROGRAM_ADDRESS: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";
export const TRANSACTION_KIND_VAULT: "vault";
export const TRANSACTION_KIND_CONFIG: "config";
export const TRANSACTION_KIND_BATCH: "batch";
/**
 * Read-only Solana Squads multisig wallet account implementation.
 *
 * @implements {IWalletAccountReadOnlyMultisig}
 */
export default class WalletAccountReadOnlyMultisigSolanaSquads extends WalletAccountReadOnly implements IWalletAccountReadOnlyMultisig {
    /**
     * Creates a new read-only Solana Squads multisig wallet account.
     *
     * @param {string | null} signerAddress - The signer's address, or null for pure read-only.
     * @param {SolanaMultisigSquadsReadOnlyConfig} config - The configuration object.
     */
    constructor(signerAddress: string | null, config: SolanaMultisigSquadsReadOnlyConfig);
    /**
     * The multisig Squads configuration.
     *
     * @protected
     * @type {SolanaMultisigSquadsReadOnlyConfig}
     */
    protected _config: SolanaMultisigSquadsReadOnlyConfig;
    /**
     * The signer's address.
     *
     * @protected
     * @type {string | null}
     */
    protected _signerAddress: string | null;
    /**
     * The address of the Squads multisig account.
     *
     * @protected
     * @type {string | null}
     */
    protected _multisigPda: string | null;
    /**
     * The create key used to derive the multisig address, if configured.
     *
     * @protected
     * @type {string | null}
     */
    protected _createKey: string | null;
    /**
     * The address of the Squads program to operate against.
     *
     * @protected
     * @type {Address}
     */
    protected _programId: Address;
    /**
     * The commitment level for transactions.
     *
     * @protected
     * @type {Commitment}
     */
    protected _commitment: Commitment;
    /**
     * A Solana RPC client for HTTP requests.
     *
     * @protected
     * @type {SolanaRpc}
     */
    protected _rpc: SolanaRpc;
    /**
     * Returns whether the multisig account exists on-chain.
     *
     * @returns {Promise<boolean>} Whether the multisig account exists.
     * @throws {Error} If no address is configured, or if the RPC request fails.
     */
    isDeployed(): Promise<boolean>;
    /**
     * Returns the addresses of the multisig's members, in on-chain order.
     *
     * @returns {Promise<string[]>} The member addresses.
     * @throws {Error} If the multisig account does not exist, or if the RPC request fails.
     */
    getOwners(): Promise<string[]>;
    /**
     * Returns the number of approvals a proposal needs before it can be executed.
     *
     * @returns {Promise<number>} The threshold.
     * @throws {Error} If the multisig account does not exist, or if the RPC request fails.
     */
    getThreshold(): Promise<number>;
    /**
     * Returns aggregated information about the multisig.
     *
     * @returns {Promise<SolanaMultisigInfo>} The multisig info.
     * @throws {Error} If the address holds a non-Squads account, or if the RPC request fails.
     */
    getMultisigInfo(): Promise<SolanaMultisigInfo>;
    /**
     * Returns the transaction index of the most recently created transaction.
     *
     * @returns {Promise<bigint>} The transaction index.
     * @throws {Error} If the multisig account does not exist, or if the RPC request fails.
     */
    getNonce(): Promise<bigint>;
    /**
     * Returns the address of one of the multisig's vaults, where its funds are held.
     *
     * @param {number | string} [vaultIndexOrAddress=0] - A vault index between 0 and 255,
     *   or a vault address to use as given.
     * @returns {Promise<string>} The vault address.
     * @throws {Error} If the index is out of range, or the address is not valid base58.
     */
    getVaultAddress(vaultIndexOrAddress?: number | string): Promise<string>;
    /**
     * Returns the native SOL balance of one of the multisig's vaults.
     *
     * @param {number | string} [vaultIndexOrAddress=0] - A vault index between 0 and 255,
     *   or a vault address to read as given.
     * @returns {Promise<bigint>} The balance in lamports.
     * @throws {Error} If the vault cannot be resolved, or if the RPC request fails.
     */
    getBalance(vaultIndexOrAddress?: number | string): Promise<bigint>;
    /**
     * Returns the balance of an SPL token held by one of the multisig's vaults.
     *
     * @param {string} tokenAddress - The SPL token mint address.
     * @param {number | string} [vaultIndexOrAddress=0] - A vault index between 0 and 255,
     *   or a vault address to read as given.
     * @returns {Promise<bigint>} The token balance (in base unit).
     * @throws {Error} If the mint address is malformed, or if the RPC request fails.
     * @todo Support Token-2022 (Token Extensions Program).
     */
    getTokenBalance(tokenAddress: string, vaultIndexOrAddress?: number | string): Promise<bigint>;
    /**
     * Retrieves a transaction receipt by its signature.
     *
     * @param {string} hash - The transaction signature.
     * @returns {Promise<SolanaTransactionReceipt | null>} The receipt, or null if the
     *   transaction was not found.
     * @throws {Error} If the signature is malformed, or if the RPC request fails.
     */
    getTransactionReceipt(hash: string): Promise<SolanaTransactionReceipt | null>;
    /**
     * Verifies a message's signature. Not supported by Squads.
     *
     * @param {string | Uint8Array} message - The signed message.
     * @param {string | Uint8Array} signature - The signature to verify.
     * @returns {Promise<boolean>} Whether the signature is valid.
     * @throws {NotSupportedError} Always, since a multisig address has no private key.
     */
    verify(message: string | Uint8Array, signature: string | Uint8Array): Promise<boolean>;
    /**
     * Returns the proposals at the given ids, keyed by id in canonical decimal form.
     *
     * @param {Array<number | bigint | string>} proposalIds - The proposal (transaction index) ids.
     * @returns {Promise<Record<string, SolanaMultisigProposal | null>>} For each id, the
     *   proposal, or null if no proposal exists at that id.
     * @throws {Error} If an id is not a non-negative integer, or if the RPC request fails.
     */
    getProposals(proposalIds: Array<number | bigint | string>): Promise<Record<string, SolanaMultisigProposal | null>>;
    /**
     * Returns the proposal at the given id.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<SolanaMultisigProposal | null>} The proposal, or null if no proposal
     *   exists at that id.
     * @throws {Error} If the id is not a non-negative integer, or if the RPC request fails.
     */
    getProposal(proposalId: number | bigint | string): Promise<SolanaMultisigProposal | null>;
    /**
     * Returns whether a proposal can be executed right now.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<boolean>} Whether the proposal can be executed.
     * @throws {Error} If the id is invalid, no address is configured, or the RPC fails.
     */
    isReadyToExecute(proposalId: number | bigint | string): Promise<boolean>;
    /**
     * Returns the signed-message proposals for the given message hashes. Not supported by Squads.
     *
     * @param {string[]} messageIds - The message hashes.
     * @returns {Promise<Record<string, MultisigMessageProposal | null>>} For each hash, the
     *   message proposal, or null if it has not been found.
     * @throws {NotSupportedError} Always, since Squads has no message-signing primitive.
     */
    getMessageProposals(messageIds: string[]): Promise<Record<string, MultisigMessageProposal | null>>;
    /**
     * Returns the signed-message proposal for the given message hash. Not supported by Squads.
     *
     * @param {string} messageId - The message's hash.
     * @returns {Promise<MultisigMessageProposal | null>} The message proposal, or null if it
     *   has not been found.
     * @throws {NotSupportedError} Always, since Squads has no message-signing primitive.
     */
    getMessageProposal(messageId: string): Promise<MultisigMessageProposal | null>;
    /**
     * Quotes the costs of a deploy operation.
     *
     * @param {number} [memberCount=1] - The number of members the multisig will hold.
     * @returns {Promise<{ fee: bigint }>} The deploy quote, in lamports.
     * @throws {Error} If `memberCount` is out of range, or if the RPC request fails.
     */
    quoteDeploy(memberCount?: number): Promise<{
        fee: bigint;
    }>;
    /**
     * Quotes the costs of a propose operation.
     *
     * @param {SolanaTransaction} tx - The transaction to quote.
     * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged
     *   over this account's configuration.
     * @returns {Promise<{ fee: bigint }>} The transaction quote, in lamports.
     * @throws {Error} If the multisig does not exist, the transaction is malformed, or the
     *   RPC request fails.
     */
    quotePropose(tx: SolanaTransaction, config?: SolanaMultisigSquadsConfig): Promise<{
        fee: bigint;
    }>;
    /**
     * Quotes the costs of a transfer operation.
     *
     * @param {import('@tetherto/wdk-wallet').TransferOptions} transferOptions - The transfer options.
     * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged
     *   over this account's configuration.
     * @returns {Promise<{ fee: bigint }>} The transfer quote, in lamports.
     * @throws {Error} If the mint or recipient is malformed, the multisig does not exist,
     *   or the RPC request fails.
     * @todo Support Token-2022 (Token Extensions Program).
     */
    quoteTransfer(transferOptions: import("@tetherto/wdk-wallet").TransferOptions, config?: SolanaMultisigSquadsConfig): Promise<{
        fee: bigint;
    }>;
    /**
     * Quotes the costs of an execute proposal operation.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The execution quote, in lamports.
     * @throws {NoSuchElementError} If no proposal exists at that id.
     * @throws {Error} If the id is invalid, no address is configured, or the RPC request fails.
     */
    quoteExecuteProposal(proposalId: number | bigint | string): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Reads and decodes the multisig account, keeping every field it holds.
     *
     * @protected
     * @returns {Promise<{ address: string, isCreated: boolean, configAuthority: string | null, threshold: number, timeLock: number, transactionIndex: bigint, staleTransactionIndex: bigint, rentCollector: string | null, members: Array<{ address: string, mask: number }> }>}
     *   The decoded account. When `isCreated` is false every other field is a placeholder.
     * @throws {Error} If the address holds a non-Squads account, or if the RPC request fails.
     */
    protected _getMultisigAccount(): Promise<{
        address: string;
        isCreated: boolean;
        configAuthority: string | null;
        threshold: number;
        timeLock: number;
        transactionIndex: bigint;
        staleTransactionIndex: bigint;
        rentCollector: string | null;
        members: Array<{
            address: string;
            mask: number;
        }>;
    }>;
    /**
     * Reads the multisig and one of its proposals in a single request.
     *
     * @protected
     * @param {bigint} index - The proposal (transaction index) id.
     * @returns {Promise<{ multisig: Awaited<ReturnType<WalletAccountReadOnlyMultisigSolanaSquads['_getMultisigAccount']>>, proposal: { address: Address, exists: boolean, status: number, statusName: string | null, approved: string[], rejected: string[], cancelled: string[] } }>}
     *   The decoded accounts. `proposal.exists` is false when no proposal has been created
     *   at that index, in which case its other fields are placeholders.
     * @throws {Error} If the multisig address holds a non-Squads account, or if the RPC
     *   request fails.
     */
    protected _getMultisigAndProposal(index: bigint): Promise<{
        multisig: Awaited<ReturnType<WalletAccountReadOnlyMultisigSolanaSquads["_getMultisigAccount"]>>;
        proposal: {
            address: Address;
            exists: boolean;
            status: number;
            statusName: string | null;
            approved: string[];
            rejected: string[];
            cancelled: string[];
        };
    }>;
    /**
     * Reads the multisig, a proposal, its backing transaction and the clock in a single request.
     *
     * @protected
     * @param {bigint} index - The proposal (transaction index) id.
     * @returns {Promise<{ multisig: Object, proposal: Object, transaction: Object, now: bigint }>}
     *   The decoded accounts and the cluster's current Unix timestamp.
     * @throws {Error} If the multisig address holds a non-Squads account, the clock cannot be
     *   read, or the RPC request fails.
     */
    protected _getMultisigProposalAndTransaction(index: bigint): Promise<{
        multisig: any;
        proposal: any;
        transaction: any;
        now: bigint;
    }>;
    /**
     * Reads the Squads program config account.
     *
     * @protected
     * @returns {Promise<{ programConfigPda: Address, creationFee: bigint, treasury: string }>}
     *   The program config address, its multisig creation fee, and its treasury address.
     * @throws {Error} If the account is missing or is not a program config.
     */
    protected _getProgramConfig(): Promise<{
        programConfigPda: Address;
        creationFee: bigint;
        treasury: string;
    }>;
    /** @private */
    private _createFailoverRpc;
    /** @private */
    private _hasDiscriminator;
    /** @private */
    private _isSignature;
    /** @private */
    private _toProposalIndex;
    /** @private */
    private _withConfig;
    /** @private */
    private _vaultTransactionMessageSize;
    /** @private */
    private _splTransferMessageSize;
    /** @private */
    private _getTransactionSeeds;
    /** @private */
    private _getTransactionPda;
    /**
     * Derives the ephemeral signer addresses a stored transaction's message expects.
     *
     * @protected
     * @param {string} transactionPda - The transaction address the signers are derived from.
     * @param {number} count - How many the message needs.
     * @returns {Promise<Address[]>} The ephemeral signer addresses, in index order.
     */
    protected _getEphemeralSignerPdas(transactionPda: string, count: number): Promise<Address[]>;
    /**
     * Derives a spending limit's address from the create key its action carries.
     *
     * @protected
     * @param {string} multisigPda - The multisig address.
     * @param {string} createKey - The action's `createKey`.
     * @returns {Promise<Address>} The spending limit address.
     */
    protected _getSpendingLimitPda(multisigPda: string, createKey: string): Promise<Address>;
    /** @private */
    private _getProposalPda;
    /** @private */
    private _decodeMultisigAccount;
    /** @private */
    private _decodeProposalAccount;
    /** @private */
    private _decodeTransactionAccount;
    /** @private */
    private _decodeVaultTransactionMessage;
    /** @private */
    private _decodeConfigActions;
    /** @private */
    private _toProposal;
}
export type SolanaRpc = ReturnType<typeof import("@solana/rpc").createSolanaRpc>;
export type Commitment = import("@solana/rpc-types").Commitment;
export type Address = import("@solana/addresses").Address;
export type IWalletAccountReadOnlyMultisig = import("@tetherto/wdk-wallet/multisig").IWalletAccountReadOnlyMultisig;
export type MultisigInfo = import("@tetherto/wdk-wallet/multisig").MultisigInfo;
/**
 * `MultisigInfo` widened with each owner's Squads permission mask, aligned with `owners`.
 */
export type SolanaMultisigInfo = MultisigInfo & {
    masks: number[];
};
export type MultisigMessageProposal = import("@tetherto/wdk-wallet/multisig").MultisigMessageProposal;
export type MultisigProposal = import("@tetherto/wdk-wallet/multisig").MultisigProposal;
/**
 * `MultisigProposal` widened with the proposal's Squads status and its vote lists.
 */
export type SolanaMultisigProposal = MultisigProposal & {
    statusName: string;
    approved: string[];
    rejected: string[];
    cancelled: string[];
};
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type SolanaTransaction = import("@tetherto/wdk-wallet-solana").SolanaTransaction;
export type SolanaTransactionReceipt = import("@tetherto/wdk-wallet-solana").SolanaTransactionReceipt;
export type SolanaMultisigSquadsCommonConfig = {
    /**
     * - A Solana RPC URL, or a list of URLs for failover.
     */
    provider: string | string[];
    /**
     * - The commitment level for transactions.
     */
    commitment?: Commitment;
    /**
     * - The number of retries for the failover provider.
     */
    retries?: number;
    /**
     * - An override for the Squads program address.
     */
    programId?: string;
    /**
     * - The address of an existing Squads multisig to operate on.
     */
    multisigPda?: string;
    /**
     * - The create key used to derive a new multisig PDA on creation.
     */
    createKey?: string;
};
export type SolanaMultisigSquadsSigningConfig = {
    /**
     * - The create key's secret, required to
     * deploy a multisig. Base58 or raw bytes, either a 32-byte private key or a 64-byte keypair.
     */
    createKeySecret?: string | Uint8Array;
    /**
     * - The maximum fee amount for the create/deploy operation.
     */
    createMaxFee?: number | bigint;
    /**
     * - The maximum fee amount for transfers.
     */
    transferMaxFee?: number | bigint;
};
export type SolanaMultisigSquadsConfig = SolanaMultisigSquadsCommonConfig & SolanaMultisigSquadsSigningConfig;
export type SolanaMultisigSquadsReadOnlyConfig = SolanaMultisigSquadsCommonConfig;
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
