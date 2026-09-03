/**
 * Derives a program address from seeds and a bump, the runtime's `create_program_address`.
 *
 * @param {Object} input - The derivation input.
 * @param {string} input.programAddress - The program to derive for.
 * @param {(string | Uint8Array)[]} input.seeds - The seeds, strings taken as UTF-8.
 * @returns {Address} The derived address.
 * @throws {ValueError} There must be at most 16 seeds, each of at most 32 bytes, and the address they hash to must lie off the ed25519 curve.
 */
export function createProgramDerivedAddressSync({ programAddress, seeds }: {
    programAddress: string;
    seeds: (string | Uint8Array)[];
}): Address;
/**
 * Derives the canonical program-derived address for the given seeds, the highest bump whose
 * address lies off the ed25519 curve. The synchronous counterpart of
 * `getProgramDerivedAddress` from `@solana/addresses`, returning the same pair.
 *
 * @param {Object} input - The derivation input.
 * @param {string} input.programAddress - The program to derive for.
 * @param {(string | Uint8Array)[]} input.seeds - The seeds, strings taken as UTF-8.
 * @returns {ProgramDerivedAddress} The address and the bump it was found at.
 * @throws {ValueError} Some bump must yield an address off the ed25519 curve.
 */
export function getProgramDerivedAddressSync({ programAddress, seeds }: {
    programAddress: string;
    seeds: (string | Uint8Array)[];
}): ProgramDerivedAddress;
export type Address = import("@solana/addresses").Address;
export type ProgramDerivedAddress = import("@solana/addresses").ProgramDerivedAddress;
