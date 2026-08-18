/**
 * The coordinator a Squads account uses when the configuration names none: the member signs with
 * the key derived from its own seed and broadcasts immediately. This is the only place in the
 * package that reaches a signer account to put a transaction on the cluster.
 */
export default class LocalSignerCoordinator implements IMultisigCoordinator {
    /**
     * Creates a coordinator over a local signer account.
     *
     * @param {WalletAccountSolana} signerAccount - The member's signer account. It is not owned by the coordinator, which never erases its key.
     */
    constructor(signerAccount: import("@tetherto/wdk-wallet-solana").WalletAccountSolana);
    /**
     * The member's signer account.
     *
     * @protected
     * @type {WalletAccountSolana | undefined}
     */
    protected _signerAccount: import("@tetherto/wdk-wallet-solana").WalletAccountSolana | undefined;
    /**
     * Signs a transaction with the member's key and broadcasts it.
     *
     * @param {SolanaTransaction} tx - The unsigned transaction.
     * @returns {Promise<TransactionResult>} The transaction's signature and the fee it paid.
     * @throws {Error} The coordinator must not have been disposed.
     */
    sendTransaction(tx: import("@tetherto/wdk-wallet-solana").SolanaTransaction): Promise<import("@tetherto/wdk-wallet").TransactionResult>;
    /**
     * Drops the reference to the signer account. The account that created it erases its key.
     *
     * @returns {void}
     */
    dispose(): void;
    /**
     * Returns the signer account, refusing to work once the coordinator has been disposed.
     *
     * @protected
     * @returns {WalletAccountSolana} The member's signer account.
     * @throws {Error} The coordinator must not have been disposed.
     */
    protected _requireSignerAccount(): import("@tetherto/wdk-wallet-solana").WalletAccountSolana;
}
import { IMultisigCoordinator } from './multisig-coordinator-interface.js';
