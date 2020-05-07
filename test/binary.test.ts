import { expect } from 'chai';
import 'mocha';

import { deserializeUInt, serializeUInt } from '../src/utils/binary';

describe('basic tests', () => {
    it('uint serialization', async () => {
        const unsignedNumber = 0xFF00_0000n;
        const signedNumber = BigInt(-16777216);

        expect(serializeUInt(unsignedNumber, 4).toString(10)).to.equal(signedNumber.toString(10));
        expect(deserializeUInt(signedNumber, 4).toString(10)).to.equal(unsignedNumber.toString(10));
    });
});
