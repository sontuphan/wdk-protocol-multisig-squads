/** @typedef {ReturnType<typeof import('@solana/rpc').createSolanaRpc>} SolanaRpc */
/** @typedef {import('@solana/rpc-types').Commitment} Commitment */
/** @typedef {import('@solana/addresses').Address} Address */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnlyMultisig} IWalletAccountReadOnlyMultisig */
/** @typedef {import('@tetherto/wdk-wallet').MultisigInfo} MultisigInfo */
/** @typedef {import('@tetherto/wdk-wallet').MessageInfo} MessageInfo */
/** @typedef {import('@tetherto/wdk-wallet').MultisigProposal} MultisigProposal */
/** @typedef {import('@tetherto/wdk-wallet-solana').SimpleSolanaTransaction} SimpleSolanaTransaction */
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
 * @property {number | bigint} [createMaxFee] - The maximum fee amount for the create/deploy operation.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfers.
 */
/** @typedef {SolanaMultisigSquadsCommonConfig & SolanaMultisigSquadsSigningConfig} SolanaMultisigSquadsConfig */
/** @typedef {SolanaMultisigSquadsCommonConfig} SolanaMultisigSquadsReadOnlyConfig */
export const DEFAULT_COMMITMENT: "confirmed";
/**
 * The address of the Squads Protocol v4 program.
 *
 * @type {string}
 */
export const SQUADS_PROGRAM_ADDRESS: string;
/**
 * Read-only Solana Squads multisig wallet account.
 * Provides query-only operations for Squads multisig wallets.
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
     * Lazily populated by {@link getAddress} when only a `createKey` is configured.
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
     * Builds a failover-backed Solana RPC client from a list of URLs.
     *
     * @private
     * @param {string[]} urls - The RPC URLs.
     * @param {number} retries - The number of retries.
     * @returns {SolanaRpc} The failover RPC client.
     */
    private _createFailoverRpc;
    /**
     * Returns the signer's address.
     *
     * @returns {Promise<string | null>} The signer's address.
     */
    getSignerAddress(): Promise<string | null>;
    /**
     * Returns whether the multisig account exists on-chain.
     *
     * Squads deploys no program per multisig — the Squads program is shared by every
     * multisig on the network. This reports whether the `Multisig` account at this
     * account's address has been created (by `multisigCreateV2`), which is what
     * `deploy()` does.
     *
     * Note that just after `deploy()` resolves this may still return `false`, until
     * the creating transaction reaches this account's commitment level.
     *
     * @returns {Promise<boolean>} Whether the multisig account exists.
     * @throws {Error} If no address is configured, or if the RPC request fails.
     */
    isDeployed(): Promise<boolean>;
    /**
     * Returns whether the given account data begins with the `Multisig` discriminator.
     *
     * @private
     * @param {Uint8Array} data - The account data, or at least its first 8 bytes.
     * @returns {boolean} Whether the data is that of a `Multisig` account.
     */
    private _hasMultisigDiscriminator;
    /**
     * Returns the addresses of the multisig's members, in on-chain order.
     *
     * Note that Squads members carry permissions (proposer / voter / executor) that
     * this list does not express: the number of members is **not** the denominator
     * of {@link getThreshold}, since only members holding the voter permission can
     * approve a proposal.
     *
     * @returns {Promise<string[]>} The member addresses.
     * @throws {Error} If the multisig account does not exist, or if the RPC request fails.
     */
    getOwners(): Promise<string[]>;
    /**
     * Returns the number of approvals a proposal needs before it can be executed.
     *
     * Note that only members holding the voter permission can approve, so this is
     * **not** a fraction of {@link getOwners}'s length: a multisig can hold members
     * that are unable to vote.
     *
     * @returns {Promise<number>} The threshold.
     * @throws {Error} If the multisig account does not exist, or if the RPC request fails.
     */
    getThreshold(): Promise<number>;
    /**
     * Returns aggregated information about the multisig.
     *
     * This is the single account read the other accessors are derived from:
     * {@link getOwners} and {@link getThreshold} both delegate here, so every field
     * they return comes from one consistent snapshot.
     *
     * When `isCreated` is `false` the multisig does not exist on chain yet, and
     * `owners` and `threshold` are placeholders that must not be read — they are `[]`
     * and `0` regardless of what a future multisig at this address would hold.
     *
     * @returns {Promise<MultisigInfo>} The multisig info.
     * @throws {Error} If the address holds a non-Squads account, or if the RPC request fails.
     */
    getMultisigInfo(): Promise<MultisigInfo>;
    /**
     * Returns the current transaction index (nonce) of the multisig.
     *
     * This is the index of the **most recently created** transaction, or `0n` when
     * none has been created yet. A new proposal takes the next index, so callers
     * creating one want `await getNonce() + 1n` rather than this value.
     *
     * @returns {Promise<bigint>} The transaction index.
     * @throws {Error} If the multisig account does not exist, or if the RPC request fails.
     */
    getNonce(): Promise<bigint>;
    /**
     * Returns the receipt of a confirmed transaction.
     *
     * @param {string} hash - The transaction signature.
     * @returns {Promise<SolanaTransactionReceipt>} The transaction receipt.
     */
    getTransactionReceipt(hash: string): Promise<SolanaTransactionReceipt>;
    /**
     * Verifies that a signature over a message is valid for this account.
     *
     * @param {string | Uint8Array} message - The signed message.
     * @param {string | Uint8Array} signature - The signature to verify.
     * @returns {Promise<boolean>} Whether the signature is valid.
     */
    verify(message: string | Uint8Array, signature: string | Uint8Array): Promise<boolean>;
    /**
     * Returns the pending proposals for the given proposal ids.
     *
     * @param {Array<number | bigint>} proposalIds - The proposal (transaction index) ids.
     * @returns {Promise<MultisigProposal[]>} The proposals.
     */
    getProposals(proposalIds: Array<number | bigint>): Promise<MultisigProposal[]>;
    /**
     * Returns whether a proposal has reached the threshold and is ready to execute.
     *
     * @param {number | bigint} proposalId - The proposal id.
     * @returns {Promise<boolean>} Whether the proposal is ready to execute.
     */
    isReadyToExecute(proposalId: number | bigint): Promise<boolean>;
    /**
     * Returns the signed-message proposals for the given message hashes.
     *
     * @param {string[]} messageHashes - The message hashes.
     * @returns {Promise<MessageInfo[]>} The message proposals.
     */
    getMessages(messageHashes: string[]): Promise<MessageInfo[]>;
    /**
     * Quotes the cost of deploying (creating) the multisig.
     *
     * @returns {Promise<{ fee: bigint }>} The deploy quote.
     */
    quoteDeploy(): Promise<{
        fee: bigint;
    }>;
    /**
     * Quotes the cost of proposing a transaction.
     *
     * @param {SimpleSolanaTransaction} tx - The transaction to quote.
     * @param {SolanaMultisigSquadsConfig} [config] - An optional config override.
     * @returns {Promise<{ fee: bigint }>} The transaction quote.
     */
    quoteSendTransaction(tx: SimpleSolanaTransaction, config?: SolanaMultisigSquadsConfig): Promise<{
        fee: bigint;
    }>;
    /**
     * Quotes the cost of a transfer.
     *
     * @param {import('@tetherto/wdk-wallet').TransferOptions} transferOptions - The transfer options.
     * @param {SolanaMultisigSquadsConfig} [config] - An optional config override.
     * @returns {Promise<{ fee: bigint }>} The transfer quote.
     */
    quoteTransfer(transferOptions: import("@tetherto/wdk-wallet").TransferOptions, config?: SolanaMultisigSquadsConfig): Promise<{
        fee: bigint;
    }>;
}
export type SolanaRpc = ReturnType<typeof import("@solana/rpc").createSolanaRpc>;
export type Commitment = import("@solana/rpc-types").Commitment;
export type Address = import("@solana/addresses").Address;
export type IWalletAccountReadOnlyMultisig = any;
export type MultisigInfo = import("@tetherto/wdk-wallet").MultisigInfo;
export type MessageInfo = import("@tetherto/wdk-wallet").MessageInfo;
export type MultisigProposal = import("@tetherto/wdk-wallet").MultisigProposal;
export type SimpleSolanaTransaction = import("@tetherto/wdk-wallet-solana").SimpleSolanaTransaction;
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
