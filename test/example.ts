import { expect } from 'chai';
import { agent as request } from 'supertest';
import 'mocha';

import App from '../src/index';

describe('baseRoute', () => {
    it('should GET', async () => {
        const res = await request(App).get('/');
        // we check the status
        expect(res.status).to.equal(200);
        // we check the return type
        expect(res.type).to.equal('application/json');
        // we check the body message
        expect(res.body.message).to.equal('Hello World!');
    });
});
