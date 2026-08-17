/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-solana').SolanaTransaction} SolanaTransaction */
/** @typedef {import('@tetherto/wdk-wallet-solana').WalletAccountSolana} WalletAccountSolana */
/**
 * The transport a Squads account uses when the configuration names none: the member signs with
 * the key derived from its own seed and broadcasts immediately. This is the only place in the
 * package that reaches a signer account to put a transaction on the cluster.
 *
 * @implements {ISquadsTransactionTransport}
 */
export default class LocalSignerTransport extends ISquadsTransactionTransport implements ISquadsTransactionTransport {
    /**
     * Creates a transport over a local signer account.
     *
     * @param {WalletAccountSolana} signerAccount - The member's signer account. It is not owned by the transport, which never erases its key.
     */
    constructor(signerAccount: WalletAccountSolana);
    /**
     * The member's signer account.
     *
     * @protected
     * @type {WalletAccountSolana | undefined}
     */
    protected _signerAccount: WalletAccountSolana | undefined;
    /**
     * Signs a transaction with the member's key and broadcasts it.
     *
     * @param {SolanaTransaction} tx - The unsigned transaction.
     * @returns {Promise<TransactionResult>} The transaction's signature and the fee it paid.
     * @throws {Error} The transport must not have been disposed.
     */
    sendTransaction(tx: SolanaTransaction): Promise<TransactionResult>;
    /**
     * Drops the reference to the signer account. The account that created it erases its key.
     */
    dispose(): void;
    /**
     * Returns the signer account, refusing to work once the transport has been disposed.
     *
     * @protected
     * @returns {WalletAccountSolana} The member's signer account.
     * @throws {Error} The transport must not have been disposed.
     */
    protected _requireSignerAccount(): WalletAccountSolana;
}
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type SolanaTransaction = import("@tetherto/wdk-wallet-solana").SolanaTransaction;
export type WalletAccountSolana = import("@tetherto/wdk-wallet-solana").WalletAccountSolana;
import ISquadsTransactionTransport from './squads-transaction-transport-interface.js';
