import fetch from 'node-fetch';
import { Api, JsonRpc } from 'eosjs/dist';
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';

export default class ChainApi {
    readonly rpc: JsonRpc;
    readonly api: Api;

    constructor(readonly endpoint: string, readonly name: string, readonly chainId: string) {
        // @ts-ignore
        this.rpc = new JsonRpc(endpoint, { fetch });
        this.api = new Api({ rpc: this.rpc, signatureProvider: new JsSignatureProvider([]) });
    }

    async post(path: string, body: any): Promise<any> {
        const request = await fetch(this.endpoint + path, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        return await request.json();
    }

    deserializeAbi(data: Uint8Array): Abi {
        return this.api.rawAbiToJson(data);
    }
}
