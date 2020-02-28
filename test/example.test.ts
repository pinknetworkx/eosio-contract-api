import { expect } from 'chai';
import { agent as request } from 'supertest';
import 'mocha';

import App from '../src/index';

describe('baseRoute', () => {
    it('should GET', async () => {
        const res = await request(App).get('/');

        expect(res.status).to.equal(200);
        expect(res.type).to.equal('application/json');
        expect(res.body.message).to.equal('Hello World!');
    });
});
