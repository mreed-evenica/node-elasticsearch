// Additional type definitions for node-fetch compatibility
declare module 'node-fetch' {
    export interface Response {
        ok: boolean;
        status: number;
        statusText: string;
        headers: any;
        url: string;
        text(): Promise<string>;
        json(): Promise<any>;
        arrayBuffer(): Promise<ArrayBuffer>;
        blob(): Promise<Blob>;
        buffer(): Promise<Buffer>;
    }

    export interface RequestInit {
        method?: string;
        headers?: Record<string, string>;
        body?: string | Buffer | NodeJS.ReadableStream;
        redirect?: 'follow' | 'error' | 'manual';
        follow?: number;
        timeout?: number;
        compress?: boolean;
        size?: number;
        agent?: any;
    }

    declare function fetch(url: string, init?: RequestInit): Promise<Response>;
    export default fetch;
    export { fetch };
}
