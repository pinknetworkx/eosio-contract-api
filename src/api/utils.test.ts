import 'mocha';
import {expect} from 'chai';

import {applyActionGreylistFilters, extractNotificationIdentifiers, respondApiError} from './utils';
import {NotificationData} from '../filler/notifier';
import {ApiError} from './error';

describe('utils', () => {
    describe('ApplyActionGreyListFilters', () => {
        const action_whitelist = 'a,b,c';
        const action_blacklist = 'c,d,e';

        it('does not apply any filter if no filter is given', () => {
            expect(applyActionGreylistFilters(['a'], {})).to.deep.equal(['a']);
        });

        it('applies white list filter, ignores given actions', () => {
            expect(applyActionGreylistFilters(['d'], {action_whitelist}))
                .to.deep.equal(['a', 'b', 'c']);
        });

        it('applies blacklist filter removing not allowed actions', () => {
            expect(applyActionGreylistFilters(['a', 'c'], {action_blacklist})).to.deep.equal(['a']);
        });

        it('applies both white and black list filters on the actions', () => {
            expect(applyActionGreylistFilters([], {action_blacklist, action_whitelist}))
                .to.deep.equal(['a', 'b']);
        });
    });

    describe('extractNotificationIdentifiers', () => {
        const key = 'key';
        const deltaNotification: NotificationData = {
            type: 'delta',
            data: {
                delta: {
                    value: {[key]: 'deltaNotificationVal'},
                } as any,
            } as any,
            channel: 'channel',
        };

        const traceNotification: NotificationData = {
            type: 'trace',
            data: {
                trace: {
                    act: {
                        data: {[key]: 'traceNotificationVal'},
                    },
                } as any,
            } as any,
            channel: 'channel',
        };

        it('extracts the notifications of type delta given key', () => {
            expect(extractNotificationIdentifiers([deltaNotification], key))
                .to.deep.equal(['deltaNotificationVal']);
        });

        it('extracts the notifications of type trace given key', () => {
            expect(extractNotificationIdentifiers([traceNotification], key))
                .to.deep.equal(['traceNotificationVal']);
        });

        it('ignores trace notification when no trace information is present', () => {
            const emptyTrace = {
                ...traceNotification,
                data: {
                    trace: undefined,
                } as any,
            };
            expect(extractNotificationIdentifiers([emptyTrace], key))
                .to.deep.equal([]);
        });

        it('ignores repeated identifiers', () => {
            expect(extractNotificationIdentifiers([deltaNotification, deltaNotification], key))
                .to.deep.equal(['deltaNotificationVal']);
        });
    });

    describe('respondApiError', () => {
        const createMockResponse = (): { statusCalled: any[], jsonCalled: any[] } => {
            const response: any = {
                statusCalled: [],
                jsonCalled: [],
            };

            response['status'] = (...args: any[]): any => {
                response.statusCalled = args;
                return response;
            };

            response['json'] = (...args: any[]): any => {
                response.jsonCalled = args;
            };
            return response;
        };

        const apiError: ApiError = {
            code: 409,
            message: 'duplicated transaction',
            name: 'Duplicated',
            showMessage: true,
            stack: 'stack',
        };


        it('on unhandled error, formats to internal server error', () => {
            const mockResponse = createMockResponse();
            respondApiError(mockResponse as any, new Error('Unhandled error'));
            const returnedStatus = mockResponse.statusCalled[0];
            expect(returnedStatus).to.equal(500);
        });

        it('on api error handled error, shows the message and the code of the error', () => {
            const mockResponse = createMockResponse();
            respondApiError(mockResponse as any, apiError);
            const returnedStatus = mockResponse.statusCalled[0];
            expect(returnedStatus).to.deep.equal(apiError.code);
            const responseBody = mockResponse.jsonCalled[0];
            expect(responseBody).to.deep.equal({success: false, message: apiError.message});
        });

        it('on api error handled error, skip on sensitive information', () => {
            const mockResponse = createMockResponse();
            const noMessageShow = {...apiError, showMessage: false};
            respondApiError(mockResponse as any, noMessageShow);
            const returnedStatus = mockResponse.statusCalled[0];
            expect(returnedStatus).to.equal(500);
        });
    });
});