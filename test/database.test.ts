import { expect } from 'chai';
import 'mocha';

import ConnectionManager from '../src/connections/manager';
import { ContractDB } from '../src/filler/database';

const config = require('../config/connections.config.json');

describe('database tests', () => {
    const connection = new ConnectionManager(config);
    const contract = new ContractDB('test', connection);

    it('Contract DB Rollback', async () => {

    });
});
