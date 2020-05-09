import 'mocha';
import { expect } from 'chai';

import { deserializeUInt, serializeUInt } from '../src/utils/binary';
import { deserializeEosioName, serializeEosioName } from '../src/utils/eosio';

describe('binary tests', () => {
    it('uint serialization', async () => {
        const unsignedNumber = BigInt(0xFF00_0000);
        const signedNumber = BigInt(-16777216);

        expect(serializeUInt(unsignedNumber, 4).toString(10)).to.equal(signedNumber.toString(10));
        expect(deserializeUInt(signedNumber, 4).toString(10)).to.equal(unsignedNumber.toString(10));
    });

    it('eosio name serialization', async () => {
        expect(serializeEosioName('eosio').toString()).to.equal('15347797');
        expect(deserializeEosioName('15347797').toString()).to.equal('eosio');

        expect(serializeEosioName('eosio.token').toString()).to.equal('46868006049558613');
        expect(deserializeEosioName('46868006049558613').toString()).to.equal('eosio.token');

        expect(serializeEosioName('pinknetworkx').toString()).to.equal('-3395250964074485845');
        expect(deserializeEosioName('-3395250964074485845').toString()).to.equal('pinknetworkx');
    });
});
