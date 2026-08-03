// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
'use strict'

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
  constructor (methodName, reason) {
    super(`Method '${methodName}' is not supported: ${reason}`)

    this.name = 'NotSupportedError'

    /**
     * The name of the method that is not supported.
     *
     * @type {string}
     */
    this.methodName = methodName

    /**
     * Why Squads cannot support the method.
     *
     * @type {string}
     */
    this.reason = reason
  }
}
