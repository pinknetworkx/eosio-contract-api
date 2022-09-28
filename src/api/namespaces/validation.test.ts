import 'mocha';
import { expect } from 'chai';
import { filterQueryArgs } from './validation';
import { ApiError } from '../error';
import { toInt } from '../../utils';

describe('filterQueryArgs', () => {

    it('removes values that are not defined in the filter', async () => {
        const result = await filterQueryArgs({a: 1, b: 2} as any, {a: {type: 'string'}});

        expect(Object.keys(result)).to.deep.equal(['a']);
    });

    it('returns the default value when the value is null', async () => {
        const result = await filterQueryArgs({a: null}, {a: {type: 'string', default: 1}});

        expect(result.a).to.equal(1);
    });

    it('returns the default value when the value is undefined', async () => {
        const result = await filterQueryArgs({a: undefined}, {a: {type: 'string', default: 1}});

        expect(result.a).to.equal(1);
    });

    it('returns the default value for arrays when the value is an empty string', async () => {
        const result = await filterQueryArgs({a: ''}, {a: {type: 'string[]', default: [1]}});

        expect(result.a).to.deep.equal([1]);
    });

    it('returns an empty array for arrays when the value is an empty string', async () => {
        const result = await filterQueryArgs({a: ''}, {a: {type: 'string[]'}});

        expect(result.a).to.deep.equal([]);
    });

    it('returns an empty array for arrays when the value is not set', async () => {
        const result = await filterQueryArgs({}, {a: {type: 'int[]'}});

        expect(result.a).to.deep.equal([]);
    });

    it('throws error when value is not in allowedValues', async () => {
        try {
            await filterQueryArgs({a: 'A'}, {a: {type: 'string', allowedValues: ['a']}});
            expect.fail();
        } catch (e) {
            expect(e).to.be.instanceof(ApiError);
            expect(e.code).to.equal(400);
            expect(e.message).to.equal('Invalid value for parameter a');
        }
    });

    it('throws error when array value is not in allowedValues', async () => {
        try {
            await filterQueryArgs({a: '2'}, {a: {type: 'int[]', allowedValues: [1]}});
            expect.fail();
        } catch (e) {
            expect(e).to.be.instanceof(ApiError);
            expect(e.code).to.equal(400);
            expect(e.message).to.equal('Invalid value for parameter a');
        }
    });

    it('throws error when array value is not valid', async () => {
        for (const value of ['a', '1,a', '1,,2']) {
            try {
                await filterQueryArgs({a: value}, {a: {type: 'int[]'}});
                expect.fail();
            } catch (e) {
                expect(e).to.be.instanceof(ApiError);
                expect(e.code).to.equal(400);
                expect(e.message).to.equal('Invalid value for parameter a');
            }
        }
    });

    it('allows valid values that are in allowedValues', async () => {
        for (const value of ['a']) {
            const {a} = await filterQueryArgs({a: value}, {a: {type: 'string', allowedValues: ['a']}});
            expect(a).to.deep.equal(value);
        }
    });

    describe('int type', () => {

        it('allows valid int values', async () => {
            for (const value of ['1', '9223372036854775807', '-1']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'int'}});
                expect(a).to.deep.equal(toInt(value));
            }
        });

        it('allows valid array int values', async () => {
            for (const value of ['1,9223372036854775807,-1']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'int[]'}});
                expect(a).to.deep.equal(value.split(',').map(toInt));
            }
        });

        it('throws errors for invalid int values', async () => {
            for (const value of ['a', '1.1', '1a']) {
                try {
                    await filterQueryArgs({a: value}, {a: {type: 'int'}});
                    expect.fail();
                } catch (e) {
                    expect(e).to.be.instanceof(ApiError);
                    expect(e.code).to.equal(400);
                    expect(e.message).to.equal('Invalid value for parameter a');
                }
            }
        });

        it('throws error when int values are out of bounds', async () => {
            for (const value of ['1', '4']) {
                try {
                    await filterQueryArgs({a: value}, {a: {type: 'int', min: 2, max: 3}});
                    expect.fail();
                } catch (e) {
                    expect(e).to.be.instanceof(ApiError);
                    expect(e.code).to.equal(400);
                    expect(e.message).to.equal('Invalid value for parameter a');
                }
            }
        });

    });

    describe('string type', () => {

        it('allows valid string values', async () => {
            for (const value of ['a']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'string'}});
                expect(a).to.deep.equal(value);
            }
        });

        it('allows valid array string values', async () => {
            for (const value of ['a,2']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'string[]'}});
                expect(a).to.deep.equal(value.split(','));
            }
        });

        it('throws error when string values are out of bounds', async () => {
            for (const value of ['a', 'abcd']) {
                try {
                    await filterQueryArgs({a: value}, {a: {type: 'string', min: 2, max: 3}});
                    expect.fail();
                } catch (e) {
                    expect(e).to.be.instanceof(ApiError);
                    expect(e.code).to.equal(400);
                    expect(e.message).to.equal('Invalid value for parameter a');
                }
            }
        });

    });

    describe('float type', () => {

        it('allows valid float values', async () => {
            for (const value of ['0.1', '1', '1.1', '-0.1']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'float'}});
                expect(a).to.deep.equal(parseFloat(value));
            }
        });

        it('allows valid array float values', async () => {
            for (const value of ['0.1,1,1.1,-0.1']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'float[]'}});
                expect(a).to.deep.equal(value.split(',').map(parseFloat));
            }
        });

        it('throws errors for invalid float values', async () => {
            for (const value of ['a', '..1', '1a', '1..']) {
                try {
                    await filterQueryArgs({a: value}, {a: {type: 'float'}});
                    expect.fail();
                } catch (e) {
                    expect(e).to.be.instanceof(ApiError);
                    expect(e.code).to.equal(400);
                    expect(e.message).to.equal('Invalid value for parameter a');
                }
            }
        });

        it('throws error when float values are out of bounds', async () => {
            for (const value of ['1.3', '3.5']) {
                try {
                    await filterQueryArgs({a: value}, {a: {type: 'float', min: 1.4, max: 3.4}});
                    expect.fail();
                } catch (e) {
                    expect(e).to.be.instanceof(ApiError);
                    expect(e.code).to.equal(400);
                    expect(e.message).to.equal('Invalid value for parameter a');
                }
            }
        });

    });

    describe('bool type', () => {

        it('allows valid bool values', async () => {
            for (const value of ['true', '1', 'false', '0']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'bool'}});
                expect(a).to.deep.equal(['true', '1'].includes(value));
            }
        });

        it('allows valid array bool values', async () => {
            const {a} = await filterQueryArgs({a: 'true,1,false,0'}, {a: {type: 'bool[]'}});

            expect(a).to.deep.equal([true, true, false, false]);
        });

        it('throws errors for invalid bool values', async () => {
            for (const value of ['a', 'FALSE', 'TRUE', '2']) {
                try {
                    await filterQueryArgs({a: value}, {a: {type: 'bool'}});
                    expect.fail();
                } catch (e) {
                    expect(e).to.be.instanceof(ApiError);
                    expect(e.code).to.equal(400);
                    expect(e.message).to.equal('Invalid value for parameter a');
                }
            }
        });

    });

    describe('name type', () => {

        it('allows valid name values', async () => {
            for (const value of ['a', '12345.abcdezj']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'name'}});
                expect(a).to.deep.equal(value);
            }
        });

        it('allows valid array name values', async () => {
            for (const value of ['a,12345.abcdezj']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'name[]'}});
                expect(a).to.deep.equal(value.split(','));
            }
        });

        it('throws errors for invalid name values', async () => {
            for (const value of ['6', '12345.abcdezz', '12345.abcdezja']) {
                try {
                    await filterQueryArgs({a: value}, {a: {type: 'name'}});
                    expect.fail();
                } catch (e) {
                    expect(e).to.be.instanceof(ApiError);
                    expect(e.code).to.equal(400);
                    expect(e.message).to.equal('Invalid value for parameter a');
                }
            }
        });

    });

    describe('id type', () => {

        it('allows valid id values', async () => {
            for (const value of ['123', 'null', '99999999999999999999999999999999999999999999999999999999999999999999999999']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'id'}});
                expect(a).to.deep.equal(value);
            }
        });

        it('allows valid array name values', async () => {
            for (const value of ['123,null,99999999999999999999999999999999999999999999999999999999999999999999999999']) {
                const {a} = await filterQueryArgs({a: value}, {a: {type: 'id[]'}});
                expect(a).to.deep.equal(value.split(','));
            }
        });

        it('throws errors for invalid id values', async () => {
            for (const value of ['1e9', 'a']) {
                try {
                    await filterQueryArgs({a: value}, {a: {type: 'id'}});
                    expect.fail();
                } catch (e) {
                    expect(e).to.be.instanceof(ApiError);
                    expect(e.code).to.equal(400);
                    expect(e.message).to.equal('Invalid value for parameter a');
                }
            }
        });

    });
});
