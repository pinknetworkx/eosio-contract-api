import { Api, JsonRpc } from 'eosjs/dist';
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';

const fetch = require('node-fetch');

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
}
