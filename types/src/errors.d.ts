/**
 * Thrown by methods that Squads cannot support, as opposed to methods that are merely
 * unimplemented. Callers can treat this as final: retrying, upgrading, or waiting will
 * not make the operation available.
 */
export class NotSupportedError extends Error {
    /**
     * Create a new not supported error.
     *
     * @param {string} methodName - The method's name.
     * @param {string} reason - Why Squads cannot support the method.
     */
    constructor(methodName: string, reason: string);
    /**
     * The name of the method that is not supported.
     *
     * @type {string}
     */
    methodName: string;
    /**
     * Why Squads cannot support the method.
     *
     * @type {string}
     */
    reason: string;
}
