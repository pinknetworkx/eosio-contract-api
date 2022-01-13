import 'mocha';
import { expect } from 'chai';
import { filterQueryArgs } from './validation';
import { ApiError } from '../error';

describe('filterQueryArgs', () => {

    it('removes values that are not defined in the filter', () => {
        const result = filterQueryArgs({a: 1, b: 2}, {a: {type: 'string'}});

        expect(Object.keys(result)).to.deep.equal(['a']);
    });

    it('returns the default value when the value is null', () => {
        const result = filterQueryArgs({a: null}, {a: {type: 'string', default: 1}});

        expect(result.a).to.equal(1);
    });

    it('returns the default value when the value is undefined', () => {
        const result = filterQueryArgs({a: undefined}, {a: {type: 'string', default: 1}});

        expect(result.a).to.equal(1);
    });

    it('returns the default value for arrays when the value is an empty string', () => {
        const result = filterQueryArgs({a: ''}, {a: {type: 'string[]', default: [1]}});

        expect(result.a).to.deep.equal([1]);
    });

    it('returns an empty array for arrays when the value is an empty string', () => {
        const result = filterQueryArgs({a: ''}, {a: {type: 'string[]'}});

        expect(result.a).to.deep.equal([]);
    });

    it('returns an empty array for arrays when the value is not set', () => {
        const result = filterQueryArgs({}, {a: {type: 'int[]'}});

        expect(result.a).to.deep.equal([]);
    });

    it('throws error when value is not in allowedValues', () => {
        try {
            filterQueryArgs({a: 'A'}, {a: {type: 'string', allowedValues: ['a']}});
            expect.fail();
        } catch (e) {
            expect(e).to.be.instanceof(ApiError);
            expect(e.code).to.equal(400);
            expect(e.message).to.equal('Invalid value for parameter a');
        }
    });

    it('throws error when array value is not in allowedValues', () => {
        try {
            filterQueryArgs({a: '2'}, {a: {type: 'int[]', allowedValues: [1]}});
            expect.fail();
        } catch (e) {
            expect(e).to.be.instanceof(ApiError);
            expect(e.code).to.equal(400);
            expect(e.message).to.equal('Invalid value for parameter a');
        }
    });

    it('throws error when array value is not valid', () => {
        for (const value of ['a', '1,a', '1,,2']) {
            try {
                filterQueryArgs({a: value}, {a: {type: 'int[]'}});
                expect.fail();
            } catch (e) {
                expect(e).to.be.instanceof(ApiError);
                expect(e.code).to.equal(400);
                expect(e.message).to.equal('Invalid value for parameter a');
            }
        }
    });

    it('allows valid valid values that are in allowedValues', () => {
        const result = ['a']
            .map(value => filterQueryArgs({a: value}, {a: {type: 'string', allowedValues: ['a']}}).a);

        expect(result).to.deep.equal(['a']);
    });

    describe('int type', () => {

        it('allows valid int values', () => {
            const result = ['1', '9223372036854775807', '-1']
                .map(value => filterQueryArgs({a: value}, {a: {type: 'int'}}).a);

            // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
            expect(result).to.deep.equal([1, 9223372036854775807, -1]);
        });

        it('allows valid array int values', () => {
            const result = ['1,9223372036854775807,-1']
                .map(value => filterQueryArgs({a: value}, {a: {type: 'int[]'}}).a);

            // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
            expect(result).to.deep.equal([[1, 9223372036854775807, -1]]);
        });

        it('throws errors for invalid int values', () => {
            for (const value of ['a', '1.1', '1a']) {
                try {
                    filterQueryArgs({a: value}, {a: {type: 'int'}});
                    expect.fail();
                } catch (e) {
                    expect(e).to.be.instanceof(ApiError);
                    expect(e.code).to.equal(400);
                    expect(e.message).to.equal('Invalid value for parameter a');
                }
            }
        });

        it('throws error when int values are out of bounds', () => {
            for (const value of ['1', '4']) {
                try {
                    filterQueryArgs({a: value}, {a: {type: 'int', min: 2, max: 3}});
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

        it('allows valid string values', () => {
            const result = ['a']
                .map(value => filterQueryArgs({a: value}, {a: {type: 'string'}}).a);

            expect(result).to.deep.equal(['a']);
        });

        it('allows valid array string values', () => {
            const result = ['a,2']
                .map(value => filterQueryArgs({a: value}, {a: {type: 'string[]'}}).a);

            expect(result).to.deep.equal([['a', '2']]);
        });

        it('throws error when string values are out of bounds', () => {
            for (const value of ['a', 'abcd']) {
                try {
                    filterQueryArgs({a: value}, {a: {type: 'string', min: 2, max: 3}});
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

        it('allows valid float values', () => {
            const result = ['0.1', '1', '1.1', '-0.1']
                .map(value => filterQueryArgs({a: value}, {a: {type: 'float'}}).a);

            expect(result).to.deep.equal([0.1, 1, 1.1, -0.1]);
        });

        it('allows valid array float values', () => {
            const result = ['0.1,1,1.1,-0.1']
                .map(value => filterQueryArgs({a: value}, {a: {type: 'float[]'}}).a);

            expect(result).to.deep.equal([[0.1, 1, 1.1, -0.1]]);
        });

        it('throws errors for invalid float values', () => {
            for (const value of ['a', '..1', '1a', '1..']) {
                try {
                    filterQueryArgs({a: value}, {a: {type: 'float'}});
                    expect.fail();
                } catch (e) {
                    expect(e).to.be.instanceof(ApiError);
                    expect(e.code).to.equal(400);
                    expect(e.message).to.equal('Invalid value for parameter a');
                }
            }
        });

        it('throws error when float values are out of bounds', () => {
            for (const value of ['1.3', '3.5']) {
                try {
                    filterQueryArgs({a: value}, {a: {type: 'float', min: 1.4, max: 3.4}});
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

        it('allows valid bool values', () => {
            const result = ['true', '1', 'false', '0']
                .map(value => filterQueryArgs({a: value}, {a: {type: 'bool'}}).a);

            expect(result).to.deep.equal([true, true, false, false]);
        });

        it('allows valid array bool values', () => {
            const result = ['true,1,false,0']
                .map(value => filterQueryArgs({a: value}, {a: {type: 'bool[]'}}).a);

            expect(result).to.deep.equal([[true, true, false, false]]);
        });

        it('throws errors for invalid bool values', () => {
            for (const value of ['a', 'FALSE', 'TRUE', '2']) {
                try {
                    filterQueryArgs({a: value}, {a: {type: 'bool'}});
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

        it('allows valid name values', () => {
            const result = ['a', '12345.abcdezj']
                .map(value => filterQueryArgs({a: value}, {a: {type: 'name'}}).a);

            expect(result).to.deep.equal(['a', '12345.abcdezj']);
        });

        it('allows valid array name values', () => {
            const result = ['a']
                .map(value => filterQueryArgs({a: value}, {a: {type: 'name[]'}}).a);

            expect(result).to.deep.equal([['a']]);
        });

        it('throws errors for invalid name values', () => {
            for (const value of ['6', '12345.abcdezz', '12345.abcdezja']) {
                try {
                    filterQueryArgs({a: value}, {a: {type: 'name'}});
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
