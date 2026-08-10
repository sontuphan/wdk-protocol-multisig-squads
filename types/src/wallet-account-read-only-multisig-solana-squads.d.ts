/** @typedef {ReturnType<typeof import('@solana/rpc').createSolanaRpc>} SolanaRpc */
/** @typedef {import('@solana/rpc-types').Commitment} Commitment */
/** @typedef {import('@solana/addresses').Address} Address */
/** @typedef {import('@tetherto/wdk-wallet/multisig').IWalletAccountReadOnlyMultisig} IWalletAccountReadOnlyMultisig */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigInfo} MultisigInfo */
/**
 * `MultisigInfo` widened with each owner's Squads permission mask, aligned with `owners`, and
 * whether the multisig account exists on-chain.
 *
 * @typedef {MultisigInfo & { masks: number[], isCreated: boolean }} SolanaMultisigInfo
 */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigMessageProposal} MultisigMessageProposal */
/** @typedef {import('@tetherto/wdk-wallet/multisig').MultisigProposal} MultisigProposal */
/**
 * `MultisigProposal` widened with the proposal's Squads status and its vote lists.
 *
 * @typedef {MultisigProposal & { statusName: string, approved: string[], rejected: string[], cancelled: string[] }} SolanaMultisigProposal
 */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransactionReceipt} SolanaTransactionReceipt */
/**
 * The configuration a read-only Squads account takes: how to reach the cluster, and how to
 * identify the multisig. `multisigPda` names an existing one; `createKey` derives its address
 * instead. Both may be given, and must then agree. A signing account may give neither and
 * supply `createKeySecret`, which the create key is derived from.
 *
 * @typedef {Object} SolanaMultisigSquadsReadOnlyConfig
 * @property {string | string[]} [provider] - A Solana RPC URL, or a list of URLs for
 *   failover. Omit it to derive addresses without reaching the cluster; every method that
 *   needs the cluster then throws.
 * @property {Commitment} [commitment] - The commitment level for transactions (default: 'confirmed').
 * @property {number} [retries] - The number of retries for the failover provider (default: 3).
 * @property {string} [programId] - The Squads program to operate against, for a fork or a
 *   local deployment (default: `SQUADS_PROGRAM_ADDRESS`).
 * @property {string} [multisigPda] - The address of an existing Squads multisig to operate on.
 * @property {string} [createKey] - The create key used to derive a new multisig PDA on creation.
 */
/**
 * The extra configuration a signing account takes: the secret it derives a new multisig's
 * address from, and the fee ceilings above which it refuses to submit.
 *
 * @typedef {Object} SolanaMultisigSquadsSigningConfig
 * @property {string | Uint8Array} [createKeySecret] - The create key's secret, required to
 *   deploy a multisig. Base58 or raw bytes, either a 32-byte private key or a 64-byte keypair.
 * @property {number | bigint} [createMaxFee] - The maximum fee amount for the create/deploy operation.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfers.
 */
/** @typedef {SolanaMultisigSquadsReadOnlyConfig & SolanaMultisigSquadsSigningConfig} SolanaMultisigSquadsConfig */
/**
 * A member of a Squads multisig, as stored on-chain.
 *
 * @typedef {Object} SquadsMember
 * @property {string} address - The member's address.
 * @property {number} mask - The member's permission bitmask: 1 initiate, 2 vote, 4 execute.
 */
/**
 * A decoded Squads multisig account. When `isCreated` is false the account does not exist
 * on-chain and every other field holds a placeholder.
 *
 * @typedef {Object} SquadsMultisigAccount
 * @property {string} address - The multisig address the account was read from.
 * @property {boolean} isCreated - Whether the account exists on-chain.
 * @property {string | null} configAuthority - The authority that alone may change the members
 *   and threshold, or null when the multisig votes on its own configuration.
 * @property {number} threshold - The number of approvals a proposal needs to be executable.
 * @property {number} timeLock - Seconds an approved proposal must wait before it can execute.
 * @property {bigint} transactionIndex - The index of the most recently created transaction.
 * @property {bigint} staleTransactionIndex - Proposals at or below this index were invalidated
 *   by a later configuration change and can no longer be voted on or executed.
 * @property {string | null} rentCollector - The address that reclaims rent when a proposal's
 *   accounts are closed, or null when the multisig collects none.
 * @property {SquadsMember[]} members - The members, in on-chain order.
 */
/**
 * A decoded Squads proposal account. When `exists` is false no proposal has been created at
 * that transaction index and every other field holds a placeholder.
 *
 * @typedef {Object} SquadsProposalAccount
 * @property {Address} address - The proposal's program-derived address.
 * @property {boolean} exists - Whether a proposal has been created at that index.
 * @property {number} status - The raw status discriminant, or -1 when the proposal is absent.
 * @property {string | null} statusName - The status as a name, e.g. `'Active'`.
 * @property {string | null} statusPhrase - The status as a sentence fragment, for error messages.
 * @property {bigint | null} statusTimestamp - The Unix timestamp the status was set at, or null
 *   while the proposal is executing, the one status Squads stores without a timestamp.
 * @property {string[]} approved - The members that have approved.
 * @property {string[]} rejected - The members that have rejected.
 * @property {string[]} cancelled - The members that have cancelled.
 */
/**
 * A lookup a stored transaction message makes into an address lookup table.
 *
 * @typedef {Object} SquadsAddressTableLookup
 * @property {string} accountKey - The lookup table's address.
 * @property {number[]} writableIndexes - The table indexes loaded as writable accounts.
 * @property {number[]} readonlyIndexes - The table indexes loaded as read-only accounts.
 */
/**
 * The message a vault transaction executes, decoded far enough to rebuild its account list.
 *
 * @typedef {Object} SquadsTransactionMessage
 * @property {number} numSigners - How many leading account keys are signers.
 * @property {number} numWritableSigners - How many of those leading signers are writable.
 * @property {number} numWritableNonSigners - How many non-signers after them are writable.
 * @property {string[]} accountKeys - The statically listed addresses, in message order.
 * @property {SquadsAddressTableLookup[]} addressTableLookups - The lookup table references.
 */
/** @typedef {'vault' | 'config' | 'batch'} SquadsTransactionKind */
/** @typedef {'AddMember' | 'RemoveMember' | 'ChangeThreshold' | 'SetTimeLock' | 'AddSpendingLimit' | 'RemoveSpendingLimit' | 'SetRentCollector'} SquadsConfigActionKind */
/**
 * A configuration change a config transaction applies. `createKey` and `spendingLimit` name the
 * spending limit account the executor has to pass through, and are null for every other kind.
 *
 * @typedef {Object} SquadsConfigAction
 * @property {SquadsConfigActionKind} kind - The change the action applies.
 * @property {string | null} createKey - The key the spending limit to create derives from.
 * @property {string | null} spendingLimit - The address of the spending limit to close.
 */
/**
 * A decoded Squads transaction account backing a proposal. When `exists` is false no
 * transaction has been created at that index and every other field holds a placeholder.
 *
 * @typedef {Object} SquadsTransactionAccount
 * @property {Address} address - The transaction's program-derived address.
 * @property {boolean} exists - Whether a transaction has been created at that index.
 * @property {SquadsTransactionKind | null} kind - The transaction kind, null when the
 *   account is absent or holds a kind this package cannot decode.
 * @property {number} vaultIndex - The vault the message spends from; 0 for non-vault kinds.
 * @property {number} ephemeralSignerCount - The ephemeral signers the message expects.
 * @property {SquadsTransactionMessage | null} message - The stored message, vault kind only.
 * @property {SquadsConfigAction[]} actions - The configuration actions, config kind only.
 */
/**
 * The Squads program config: the fee it charges to create a multisig, and the treasury that
 * collects it.
 *
 * @typedef {Object} SquadsProgramConfig
 * @property {Address} programConfigPda - The program config's program-derived address.
 * @property {bigint} creationFee - The fee charged per multisig creation, in lamports.
 * @property {string} treasury - The address the creation fee is paid to.
 */
/**
 * A multisig, one of its proposals, the transaction that proposal backs, and the cluster clock,
 * read together so an execution can be checked against a single consistent snapshot.
 *
 * @typedef {Object} SquadsProposalContext
 * @property {SquadsMultisigAccount} multisig - The decoded multisig account.
 * @property {SquadsProposalAccount} proposal - The decoded proposal account.
 * @property {SquadsTransactionAccount} transaction - The decoded transaction account.
 * @property {bigint} now - The cluster's current Unix timestamp, read from the clock sysvar.
 */
export const SQUADS_PROGRAM_ADDRESS: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";
/**
 * The transaction kinds a Squads proposal can back, keyed by kind.
 *
 * @type {{ [K in SquadsTransactionKind]: K }}
 */
export const TRANSACTION_KIND: { [K in SquadsTransactionKind]: K; };
/**
 * Read-only Solana Squads multisig wallet account implementation.
 *
 * @implements {IWalletAccountReadOnlyMultisig}
 */
export default class WalletAccountReadOnlyMultisigSolanaSquads extends WalletAccountReadOnly implements IWalletAccountReadOnlyMultisig {
    /**
     * Creates a new read-only Solana Squads multisig wallet account.
     *
     * @param {string | undefined} signerAddress - The signer's address, or undefined for a
     *   pure read-only account.
     * @param {SolanaMultisigSquadsReadOnlyConfig} config - The configuration object.
     */
    constructor(signerAddress: string | undefined, config: SolanaMultisigSquadsReadOnlyConfig);
    /**
     * The multisig Squads configuration. It carries the signing fields too when a signing
     * account owns it, or when one derived this account through `_withConfig`.
     *
     * @protected
     * @type {SolanaMultisigSquadsConfig}
     */
    protected _config: SolanaMultisigSquadsConfig;
    /**
     * The signer's address.
     *
     * @protected
     * @type {string | undefined}
     */
    protected _signerAddress: string | undefined;
    /**
     * The address of the Squads multisig account.
     *
     * @protected
     * @type {string | undefined}
     */
    protected _multisigPda: string | undefined;
    /**
     * The create key used to derive the multisig address, if configured.
     *
     * @protected
     * @type {string | undefined}
     */
    protected _createKey: string | undefined;
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
     * @type {SolanaRpc | undefined}
     */
    protected _rpc: SolanaRpc | undefined;
    /**
     * Returns the address of the Squads multisig account.
     *
     * @returns {Promise<string>} The multisig address.
     * @throws {Error} If neither `multisigPda` nor `createKey` is configured.
     */
    getAddress(): Promise<string>;
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
     * @param {number | string} [vaultIndexOrAddress] - A vault index between 0 and 255, or a
     *   vault address to use as given (default: 0).
     * @returns {Promise<string>} The vault address.
     * @throws {Error} If the index is out of range, or the address is not valid base58.
     */
    getVaultAddress(vaultIndexOrAddress?: number | string): Promise<string>;
    /**
     * Returns the native SOL balance of one of the multisig's vaults.
     *
     * @param {number | string} [vaultIndexOrAddress] - A vault index between 0 and 255, or a
     *   vault address to read as given (default: 0).
     * @returns {Promise<bigint>} The balance in lamports.
     * @throws {Error} If the vault cannot be resolved, or if the RPC request fails.
     */
    getBalance(vaultIndexOrAddress?: number | string): Promise<bigint>;
    /**
     * Returns the balance of an SPL token held by one of the multisig's vaults.
     *
     * @param {string} tokenAddress - The SPL token mint address.
     * @param {number | string} [vaultIndexOrAddress] - A vault index between 0 and 255, or a
     *   vault address to read as given (default: 0).
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
     * @param {string} message - The signed message.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} Whether the signature is valid.
     * @throws {NotSupportedError} Always, since a multisig address has no private key.
     */
    verify(message: string, signature: string): Promise<boolean>;
    /**
     * Returns the proposals at the given ids, keyed by id in canonical decimal form.
     *
     * @param {(number | bigint | string)[]} proposalIds - The proposal (transaction index) ids.
     * @returns {Promise<Record<string, SolanaMultisigProposal | null>>} For each id, the
     *   proposal, or null if no proposal exists at that id.
     * @throws {Error} If an id is not a non-negative integer, or if the RPC request fails.
     */
    getProposals(proposalIds: (number | bigint | string)[]): Promise<Record<string, SolanaMultisigProposal | null>>;
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
     * Quotes the costs of a send transaction operation. Not supported by Squads.
     *
     * @param {SolanaTransaction} tx - The transaction to quote.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quote.
     * @throws {NotSupportedError} Always, since a multisig does not submit transactions itself.
     */
    quoteSendTransaction(tx: SolanaTransaction): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Quotes the costs of a deploy operation.
     *
     * @param {number} [memberCount] - The number of members the multisig will hold (default: 1).
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The deploy quote, in lamports.
     * @throws {Error} If `memberCount` is out of range, or if the RPC request fails.
     */
    quoteDeploy(memberCount?: number): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Quotes the costs of a propose operation.
     *
     * @param {SolanaTransaction} tx - The transaction to quote.
     * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged
     *   over this account's configuration.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction quote, in lamports.
     * @throws {Error} If the multisig does not exist, the transaction is malformed, or the
     *   RPC request fails.
     */
    quotePropose(tx: SolanaTransaction, config?: SolanaMultisigSquadsConfig): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Quotes the costs of a transfer operation.
     *
     * @param {TransferOptions} transferOptions - The transfer options.
     * @param {SolanaMultisigSquadsConfig} [config] - An optional config override, merged
     *   over this account's configuration.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transfer quote, in lamports.
     * @throws {Error} If the mint or recipient is malformed, the multisig does not exist,
     *   or the RPC request fails.
     * @todo Support Token-2022 (Token Extensions Program).
     */
    quoteTransfer(transferOptions: TransferOptions, config?: SolanaMultisigSquadsConfig): Promise<Omit<TransactionResult, "hash">>;
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
     * @returns {Promise<SquadsMultisigAccount>} The decoded account.
     * @throws {Error} If the address holds a non-Squads account, or if the RPC request fails.
     */
    protected _getMultisigAccount(): Promise<SquadsMultisigAccount>;
    /**
     * Reads the multisig and one of its proposals in a single request.
     *
     * @protected
     * @param {bigint} index - The proposal (transaction index) id.
     * @returns {Promise<Pick<SquadsProposalContext, 'multisig' | 'proposal'>>} The decoded
     *   multisig and proposal accounts.
     * @throws {Error} If the multisig address holds a non-Squads account, or if the RPC
     *   request fails.
     */
    protected _getMultisigAndProposal(index: bigint): Promise<Pick<SquadsProposalContext, "multisig" | "proposal">>;
    /**
     * Reads the multisig, a proposal, its backing transaction and the clock in a single request.
     *
     * @protected
     * @param {bigint} index - The proposal (transaction index) id.
     * @returns {Promise<SquadsProposalContext>} The decoded accounts and the cluster's current
     *   Unix timestamp.
     * @throws {Error} If the multisig address holds a non-Squads account, the clock cannot be
     *   read, or the RPC request fails.
     */
    protected _getMultisigProposalAndTransaction(index: bigint): Promise<SquadsProposalContext>;
    /**
     * Reads the Squads program config account.
     *
     * @protected
     * @returns {Promise<SquadsProgramConfig>} The program config address, its multisig creation
     *   fee, and its treasury address.
     * @throws {Error} If the account is missing or is not a program config.
     */
    protected _getProgramConfig(): Promise<SquadsProgramConfig>;
    /**
     * Normalizes a proposal id into the Squads transaction index it refers to.
     *
     * @protected
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @returns {bigint} The transaction index.
     * @throws {Error} If the id is not an integer between 0 and 18446744073709551615.
     */
    protected _toProposalIndex(proposalId: number | bigint | string): bigint;
    /**
     * Derives the address of the transaction account stored at the given index.
     *
     * @protected
     * @param {string} multisigPda - The multisig address the transaction belongs to.
     * @param {bigint} index - The transaction index.
     * @returns {Promise<Address>} The transaction address.
     */
    protected _getTransactionPda(multisigPda: string, index: bigint): Promise<Address>;
    /**
     * Derives the address of the proposal account that votes on the transaction at the given
     * index.
     *
     * @protected
     * @param {string} multisigPda - The multisig address the proposal belongs to.
     * @param {bigint} index - The transaction index the proposal votes on.
     * @returns {Promise<Address>} The proposal address.
     */
    protected _getProposalPda(multisigPda: string, index: bigint): Promise<Address>;
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
    private _hasDiscriminator;
    /** @private */
    private _isSignature;
    /** @private */
    private _withConfig;
    /** @private */
    private _vaultTransactionMessageSize;
    /** @private */
    private _splTransferMessageSize;
    /** @private */
    private _getTransactionSeeds;
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
 * `MultisigInfo` widened with each owner's Squads permission mask, aligned with `owners`,
 * and whether the multisig account exists on-chain.
 */
export type SolanaMultisigInfo = MultisigInfo & {
    masks: number[];
    isCreated: boolean;
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
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type SolanaTransaction = import("@tetherto/wdk-wallet-solana").SolanaTransaction;
export type SolanaTransactionReceipt = import("@tetherto/wdk-wallet-solana").SolanaTransactionReceipt;
/**
 * The configuration a read-only Squads account takes: how to reach the cluster, and how to
 * identify the multisig. `multisigPda` names an existing one; `createKey` derives its address
 * instead. Both may be given, and must then agree. A signing account may give neither and
 * supply `createKeySecret`, which the create key is derived from.
 */
export type SolanaMultisigSquadsReadOnlyConfig = {
    /**
     * - A Solana RPC URL, or a list of URLs for
     * failover. Omit it to derive addresses without reaching the cluster; every method that
     * needs the cluster then throws.
     */
    provider?: string | string[];
    /**
     * - The commitment level for transactions.
     */
    commitment?: Commitment;
    /**
     * - The number of retries for the failover provider.
     */
    retries?: number;
    /**
     * - The Squads program to operate against, for a fork or a
     * local deployment (default: `SQUADS_PROGRAM_ADDRESS`).
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
/**
 * The extra configuration a signing account takes: the secret it derives a new multisig's
 * address from, and the fee ceilings above which it refuses to submit.
 */
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
export type SolanaMultisigSquadsConfig = SolanaMultisigSquadsReadOnlyConfig & SolanaMultisigSquadsSigningConfig;
/**
 * A member of a Squads multisig, as stored on-chain.
 */
export type SquadsMember = {
    /**
     * - The member's address.
     */
    address: string;
    /**
     * - The member's permission bitmask: 1 initiate, 2 vote, 4 execute.
     */
    mask: number;
};
/**
 * A decoded Squads multisig account. When `isCreated` is false the account does not exist
 * on-chain and every other field holds a placeholder.
 */
export type SquadsMultisigAccount = {
    /**
     * - The multisig address the account was read from.
     */
    address: string;
    /**
     * - Whether the account exists on-chain.
     */
    isCreated: boolean;
    /**
     * - The authority that alone may change the members
     * and threshold, or null when the multisig votes on its own configuration.
     */
    configAuthority: string | null;
    /**
     * - The number of approvals a proposal needs to be executable.
     */
    threshold: number;
    /**
     * - Seconds an approved proposal must wait before it can execute.
     */
    timeLock: number;
    /**
     * - The index of the most recently created transaction.
     */
    transactionIndex: bigint;
    /**
     * - Proposals at or below this index were invalidated
     * by a later configuration change and can no longer be voted on or executed.
     */
    staleTransactionIndex: bigint;
    /**
     * - The address that reclaims rent when a proposal's
     * accounts are closed, or null when the multisig collects none.
     */
    rentCollector: string | null;
    /**
     * - The members, in on-chain order.
     */
    members: SquadsMember[];
};
/**
 * A decoded Squads proposal account. When `exists` is false no proposal has been created at
 * that transaction index and every other field holds a placeholder.
 */
export type SquadsProposalAccount = {
    /**
     * - The proposal's program-derived address.
     */
    address: Address;
    /**
     * - Whether a proposal has been created at that index.
     */
    exists: boolean;
    /**
     * - The raw status discriminant, or -1 when the proposal is absent.
     */
    status: number;
    /**
     * - The status as a name, e.g. `'Active'`.
     */
    statusName: string | null;
    /**
     * - The status as a sentence fragment, for error messages.
     */
    statusPhrase: string | null;
    /**
     * - The Unix timestamp the status was set at, or null
     * while the proposal is executing, the one status Squads stores without a timestamp.
     */
    statusTimestamp: bigint | null;
    /**
     * - The members that have approved.
     */
    approved: string[];
    /**
     * - The members that have rejected.
     */
    rejected: string[];
    /**
     * - The members that have cancelled.
     */
    cancelled: string[];
};
/**
 * A lookup a stored transaction message makes into an address lookup table.
 */
export type SquadsAddressTableLookup = {
    /**
     * - The lookup table's address.
     */
    accountKey: string;
    /**
     * - The table indexes loaded as writable accounts.
     */
    writableIndexes: number[];
    /**
     * - The table indexes loaded as read-only accounts.
     */
    readonlyIndexes: number[];
};
/**
 * The message a vault transaction executes, decoded far enough to rebuild its account list.
 */
export type SquadsTransactionMessage = {
    /**
     * - How many leading account keys are signers.
     */
    numSigners: number;
    /**
     * - How many of those leading signers are writable.
     */
    numWritableSigners: number;
    /**
     * - How many non-signers after them are writable.
     */
    numWritableNonSigners: number;
    /**
     * - The statically listed addresses, in message order.
     */
    accountKeys: string[];
    /**
     * - The lookup table references.
     */
    addressTableLookups: SquadsAddressTableLookup[];
};
export type SquadsTransactionKind = 'vault' | 'config' | 'batch';
export type SquadsConfigActionKind = 'AddMember' | 'RemoveMember' | 'ChangeThreshold' | 'SetTimeLock' | 'AddSpendingLimit' | 'RemoveSpendingLimit' | 'SetRentCollector';
/**
 * A configuration change a config transaction applies. `createKey` and `spendingLimit` name the
 * spending limit account the executor has to pass through, and are null for every other kind.
 */
export type SquadsConfigAction = {
    /**
     * - The change the action applies.
     */
    kind: SquadsConfigActionKind;
    /**
     * - The key the spending limit to create derives from.
     */
    createKey: string | null;
    /**
     * - The address of the spending limit to close.
     */
    spendingLimit: string | null;
};
/**
 * A decoded Squads transaction account backing a proposal. When `exists` is false no
 * transaction has been created at that index and every other field holds a placeholder.
 */
export type SquadsTransactionAccount = {
    /**
     * - The transaction's program-derived address.
     */
    address: Address;
    /**
     * - Whether a transaction has been created at that index.
     */
    exists: boolean;
    /**
     * - The transaction kind, null when the
     * account is absent or holds a kind this package cannot decode.
     */
    kind: SquadsTransactionKind | null;
    /**
     * - The vault the message spends from; 0 for non-vault kinds.
     */
    vaultIndex: number;
    /**
     * - The ephemeral signers the message expects.
     */
    ephemeralSignerCount: number;
    /**
     * - The stored message, vault kind only.
     */
    message: SquadsTransactionMessage | null;
    /**
     * - The configuration actions, config kind only.
     */
    actions: SquadsConfigAction[];
};
/**
 * The Squads program config: the fee it charges to create a multisig, and the treasury that
 * collects it.
 */
export type SquadsProgramConfig = {
    /**
     * - The program config's program-derived address.
     */
    programConfigPda: Address;
    /**
     * - The fee charged per multisig creation, in lamports.
     */
    creationFee: bigint;
    /**
     * - The address the creation fee is paid to.
     */
    treasury: string;
};
/**
 * A multisig, one of its proposals, the transaction that proposal backs, and the cluster clock,
 * read together so an execution can be checked against a single consistent snapshot.
 */
export type SquadsProposalContext = {
    /**
     * - The decoded multisig account.
     */
    multisig: SquadsMultisigAccount;
    /**
     * - The decoded proposal account.
     */
    proposal: SquadsProposalAccount;
    /**
     * - The decoded transaction account.
     */
    transaction: SquadsTransactionAccount;
    /**
     * - The cluster's current Unix timestamp, read from the clock sysvar.
     */
    now: bigint;
};
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
