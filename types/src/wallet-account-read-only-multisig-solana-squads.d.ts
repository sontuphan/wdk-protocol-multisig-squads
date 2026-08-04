/** @typedef {ReturnType<typeof import('@solana/rpc').createSolanaRpc>} SolanaRpc */
/** @typedef {import('@solana/rpc-types').Commitment} Commitment */
/** @typedef {import('@solana/addresses').Address} Address */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnlyMultisig} IWalletAccountReadOnlyMultisig */
/** @typedef {import('@tetherto/wdk-wallet').MultisigInfo} MultisigInfo */
/** @typedef {import('@tetherto/wdk-wallet').MessageInfo} MessageInfo */
/** @typedef {import('@tetherto/wdk-wallet').MultisigProposal} MultisigProposal */
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
     * Returns the address of one of the multisig's vaults.
     *
     * Vaults are where a Squads multisig holds its funds, so this is **not** the
     * address returned by {@link getAddress}: that one identifies the multisig and
     * holds only its rent. Index `0` is the main treasury; higher indices are the
     * sub-accounts the Squads app exposes.
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
     * Returns `0n` when the vault holds nothing, which is also the case when it has
     * never been funded and therefore has no account on chain yet.
     *
     * Not all of this balance is transferable in a single instruction: a transfer must
     * leave the vault either empty or above the rent-exempt minimum.
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
     * Tokens are held in a token account owned by the vault, not in the vault account
     * itself, so this reads the vault's associated token account for the given mint.
     * Returns `0n` when the vault holds none of the token, including when no associated
     * token account exists for it yet.
     *
     * Only legacy SPL Token mints are supported: the associated token account is derived
     * with the SPL Token program as a seed, so a Token-2022 mint resolves to a different
     * address and reports `0n` even when it holds a balance.
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
     * Returns the receipt of a transaction, or `null` if the RPC has no record of it.
     *
     * This reports on a single Solana transaction and is not proposal-aware: a Squads
     * proposal spans a creation, one approval per voter, and an execution, each with its
     * own signature. Use {@link getProposals} to ask about a proposal's state.
     *
     * A returned receipt does **not** imply the transaction succeeded — a failed
     * transaction is still included in a block and has a receipt, with `meta.err` set.
     * Note also that `null` covers both "not confirmed yet" and "no longer served by
     * this node", since nodes retain transaction history for a limited window.
     *
     * A configured commitment of `processed` is raised to `confirmed`, because the
     * underlying RPC method rejects anything lower and a receipt cannot exist for an
     * unconfirmed transaction.
     *
     * @param {string} hash - The transaction signature.
     * @returns {Promise<SolanaTransactionReceipt | null>} The receipt, or null if the
     *   transaction was not found.
     * @throws {Error} If the signature is malformed, or if the RPC request fails.
     */
    getTransactionReceipt(hash: string): Promise<SolanaTransactionReceipt | null>;
    /**
     * Verifies that a signature over a message is valid for this account.
     *
     * **Not supported, and not pending work.** This account's address is a
     * program-derived address with no private key, so no signature can be attributed to
     * it and there is nothing to verify against. Solana has no equivalent of EIP-1271,
     * which is what lets a keyless smart-contract wallet answer this question on other
     * chains. To check an individual member's signature, verify it against that member's
     * own address instead.
     *
     * @param {string | Uint8Array} message - The signed message.
     * @param {string | Uint8Array} signature - The signature to verify.
     * @returns {Promise<boolean>} Whether the signature is valid.
     * @throws {NotSupportedError} Always, for the reasons above.
     */
    verify(message: string | Uint8Array, signature: string | Uint8Array): Promise<boolean>;
    /**
     * Returns the proposals at the given ids, in the same order.
     *
     * A proposal's id is its transaction index. Entries are `null` where no proposal
     * exists at that id, so the result stays positionally aligned with the input.
     *
     * Note that `confirmations >= threshold` does **not** mean a proposal can be
     * executed: it must also be in the approved status, not invalidated by a later
     * configuration change, and past any time lock. Use {@link isReadyToExecute}.
     *
     * @param {Array<number | bigint | string>} proposalIds - The proposal (transaction index) ids.
     * @returns {Promise<Array<MultisigProposal | null>>} For each id, the proposal, or
     *   null if no proposal exists at that id.
     * @throws {Error} If an id is not a non-negative integer, or if the RPC request fails.
     */
    getProposals(proposalIds: Array<number | bigint | string>): Promise<Array<MultisigProposal | null>>;
    /**
     * Returns whether a proposal can be executed right now.
     *
     * A proposal becomes executable once it has been approved and its time lock has
     * elapsed. Configuration proposals additionally must not have been invalidated by a
     * later configuration change; vault and batch proposals that were approved before
     * being invalidated stay executable.
     *
     * This is a point-in-time answer rather than a guarantee: a configuration change or
     * a cancellation can make an executable proposal unexecutable. Every reason for a
     * `false` result collapses into the same value, including a proposal that does not
     * exist.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<boolean>} Whether the proposal can be executed.
     * @throws {Error} If the id is invalid, no address is configured, or the RPC fails.
     */
    isReadyToExecute(proposalId: number | bigint | string): Promise<boolean>;
    /**
     * Returns the signed-message proposals for the given message hashes.
     *
     * **Not supported, and not pending work.** Squads has no message-signing primitive,
     * and a multisig cannot produce a signature at all: its accounts are program-derived
     * addresses, which hold no private key. A message's *approval* can be recorded
     * on-chain by wrapping it in a vault transaction, but the result is proof of approval
     * rather than a signature, and Squads keys its accounts by sequential transaction
     * index rather than by message hash, so a hash cannot be resolved to an account.
     *
     * @param {string[]} messageHashes - The message hashes.
     * @returns {Promise<Array<MessageInfo | null>>} For each hash, the message proposal,
     *   or null if it has not been found.
     * @throws {NotSupportedError} Always, for the reasons above.
     */
    getMessages(messageHashes: string[]): Promise<Array<MessageInfo | null>>;
    /**
     * Quotes the cost of deploying (creating) the multisig.
     *
     * The quote covers what the creator's account is debited: rent for the multisig
     * account, the protocol's creation fee, and the base fee for the two signatures the
     * creation transaction carries. It excludes priority fees, which the sender chooses,
     * and excludes funding a vault, which is a separate step.
     *
     * Rent scales with the number of members, which the multisig does not have until it
     * is created, so `memberCount` defaults to a single member. Pass the intended count
     * to quote a larger multisig.
     *
     * Note that this rent is **not** refundable: Squads has no instruction to close a
     * multisig account, unlike the accounts backing proposals and transactions.
     *
     * @param {number} [memberCount=1] - The number of members the multisig will hold.
     * @returns {Promise<{ fee: bigint }>} The deploy quote, in lamports.
     * @throws {Error} If `memberCount` is out of range, or if the RPC request fails.
     */
    quoteDeploy(memberCount?: number): Promise<{
        fee: bigint;
    }>;
    /**
     * Quotes the cost of proposing a transaction.
     *
     * This is what the **proposer** is debited: rent for the transaction and proposal
     * accounts Squads creates, plus the base fee for the single signature that creates
     * them. Approvals and execution are paid by the members who submit them, from their
     * own accounts, so they are excluded — as are priority fees.
     *
     * Most of the quote is refundable rent rather than a fee: the accounts can be closed
     * once the proposal is executed or cancelled, refunding to the multisig's rent
     * collector when one is configured. Proposal rent scales with the number of members,
     * so it usually dominates.
     *
     * @param {SolanaTransaction} tx - The transaction to quote.
     * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged
     *   over this account's configuration.
     * @returns {Promise<{ fee: bigint }>} The transaction quote, in lamports.
     * @throws {Error} If the multisig does not exist, the transaction is malformed, or the
     *   RPC request fails.
     */
    quoteSendTransaction(tx: SolanaTransaction, config?: SolanaMultisigSquadsConfig): Promise<{
        fee: bigint;
    }>;
    /**
     * Quotes the cost of a transfer.
     *
     * This is what the **proposer** is debited: rent for the transaction and proposal
     * accounts Squads creates, plus the base fee for the single signature that creates
     * them. Approvals and execution are paid by the members who submit them, and priority
     * fees are excluded.
     *
     * One cost is deliberately **not** included. When the recipient holds no account for
     * the token yet, one is created during execution and paid for by the **vault**, not by
     * the proposer. That rent leaves the treasury, is not refundable to the multisig, and a
     * vault without enough SOL to cover it will fail execution after the proposal has
     * already been created and approved.
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
     * Reads and decodes the multisig account, keeping every field it holds.
     *
     * This is the single decode the account-level accessors project from, so callers that
     * need several fields — a threshold together with a transaction index, say — get them
     * from one consistent snapshot.
     *
     * @protected
     * @returns {Promise<{ address: string, isCreated: boolean, threshold: number, timeLock: number, transactionIndex: bigint, staleTransactionIndex: bigint, rentCollector: string | null, members: Array<{ address: string, mask: number }> }>}
     *   The decoded account. When `isCreated` is false every other field is a placeholder.
     * @throws {Error} If the address holds a non-Squads account, or if the RPC request fails.
     */
    protected _getMultisigAccount(): Promise<{
        address: string;
        isCreated: boolean;
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
    /** @private */
    private _getProposalPda;
    /** @private */
    private _toProposal;
    /** @private */
    private _countApprovals;
}
export type SolanaRpc = ReturnType<typeof import("@solana/rpc").createSolanaRpc>;
export type Commitment = import("@solana/rpc-types").Commitment;
export type Address = import("@solana/addresses").Address;
export type IWalletAccountReadOnlyMultisig = any;
export type MultisigInfo = import("@tetherto/wdk-wallet").MultisigInfo;
export type MessageInfo = import("@tetherto/wdk-wallet").MessageInfo;
export type MultisigProposal = import("@tetherto/wdk-wallet").MultisigProposal;
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
