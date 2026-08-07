/**
 * Wallet manager for Solana Squads multisig wallets.
 */
export default class WalletManagerMultisigSolanaSquads extends WalletManager {
    /**
     * Creates a new wallet manager for Solana Squads multisig wallets.
     *
     * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
     * @param {SolanaMultisigSquadsConfig} [config] - The configuration object.
     */
    constructor(seed: string | Uint8Array, config?: SolanaMultisigSquadsConfig);
    /**
     * A Solana RPC client for HTTP requests.
     *
     * @protected
     * @type {SolanaRpc | undefined}
     */
    protected _rpc: SolanaRpc | undefined;
    /**
     * Returns the wallet account at a specific index (see [SLIP-0010](https://slips.readthedocs.io/en/latest/slip-0010/)).
     *
     * @example
     * // Returns the account with derivation path m/44'/501'/1'/0'
     * const account = await wallet.getAccount(1);
     * @param {number} [index] - The index of the account to get (default: 0).
     * @returns {Promise<WalletAccountMultisigSolanaSquads>} The account.
     */
    getAccount(index?: number): Promise<WalletAccountMultisigSolanaSquads>;
    /**
     * Returns the wallet account at a specific SLIP-0010 derivation path.
     *
     * @example
     * // Returns the account with derivation path m/44'/501'/0'/0'/1'
     * const account = await wallet.getAccountByPath("0'/0'/1'");
     * @param {string} path - The derivation path (e.g. "0'/0'").
     * @returns {Promise<WalletAccountMultisigSolanaSquads>} The account.
     */
    getAccountByPath(path: string): Promise<WalletAccountMultisigSolanaSquads>;
    /** @private */
    private _createFailoverRpc;
}
export type SolanaRpc = ReturnType<typeof import("@solana/rpc").createSolanaRpc>;
export type FeeRates = import("@tetherto/wdk-wallet").FeeRates;
export type SolanaMultisigSquadsConfig = import("./wallet-account-read-only-multisig-solana-squads.js").SolanaMultisigSquadsConfig;
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountMultisigSolanaSquads from './wallet-account-multisig-solana-squads.js';
