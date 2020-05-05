import { Api, JsonRpc } from 'eosjs/dist';
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';
import { SerialBuffer } from 'eosjs/dist/eosjs-serialize';

const fetch = require('node-fetch');
const { TextDecoder, TextEncoder } = require('text-encoding');

export default class ChainApi {
    readonly rpc: JsonRpc;
    readonly api: Api;

    constructor(endpoint: string) {
        this.rpc = new JsonRpc(endpoint, { fetch });
        this.api = new Api({ rpc: this.rpc, signatureProvider: new JsSignatureProvider([]) });
    }

    deserializeAbi(data: Uint8Array): Abi {
        return this.api.rawAbiToJson(data);
    }

    serializeName(name: string): string {
        const buffer = new SerialBuffer({textEncoder: new TextEncoder, textDecoder: new TextDecoder});

        buffer.pushName(name);

        const bytes = buffer.asUint8Array();
        let n = BigInt(0);

        for (const byte of bytes) {
            n = (n << BigInt(8)) + BigInt(byte);
        }

        return n.toString();
    }

    deserializeName(data: string): string {
        const bytes = new Uint8Array(8);
        let n = BigInt(data);

        for (let i = 0; i < 8; i ++) {
            bytes[7 - i] = Number(n & BigInt(0xFF));
            n = n >> BigInt(8);
        }

        const buffer = new SerialBuffer({textEncoder: new TextEncoder, textDecoder: new TextDecoder, array: bytes});

        return buffer.getName();
    }
}
