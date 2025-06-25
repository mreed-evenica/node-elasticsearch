// Type definitions for JSONStream
// Project: https://github.com/dominictarr/JSONStream
// Definitions by: Generated for this project

declare module 'JSONStream' {
    import { Transform } from 'stream';

    interface JSONStreamOptions {
        /**
         * The path to parse. Can be a string or array of strings.
         * Examples: 
         * - '*' to parse each item in an array
         * - 'rows.*' to parse each item in the rows array
         * - ['rows', true] to parse each item in the rows array
         */
        path?: string | (string | number | boolean)[];
    }

    /**
     * Parse a JSON stream and emit objects at the specified path
     * @param path The path to parse (default: '*' for array items)
     * @returns A Transform stream that emits parsed objects
     */
    export function parse(path?: string | (string | number | boolean)[]): Transform;

    /**
     * Create a readable stream that stringifies objects
     * @param open Opening string (default: '[\n')
     * @param sep Separator string (default: ',\n')
     * @param close Closing string (default: '\n]\n')
     * @returns A Transform stream that stringifies input objects
     */
    export function stringify(open?: string, sep?: string, close?: string): Transform;

    /**
     * Create a readable stream that stringifies objects with custom formatting
     * @param open Opening string or function
     * @param sep Separator string or function
     * @param close Closing string or function
     * @returns A Transform stream that stringifies input objects
     */
    export function stringifyObject(
        open?: string | (() => string),
        sep?: string | ((key: string, value: any) => string),
        close?: string | (() => string)
    ): Transform;
}
