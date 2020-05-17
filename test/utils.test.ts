import 'mocha';
import { expect } from 'chai';
import PQueue from 'p-queue';

async function sleep(timeout: number) {
    return new Promise((resolve => setTimeout(resolve, timeout)));
}

describe('utils tests', () => {
    it('promise events race condition test', async () => {
        const queue = new PQueue({concurrency: 1, autoStart: false});

        queue.pause();

        queue.add(async () => {
            await sleep(1000);
            console.log('1');
        }, {priority: 50});

        queue.add(async () => {
            await sleep(1000);
            console.log('2');
        }, {priority: 100});

        await sleep(2000);

        console.log('start');

        queue.start();

        await queue.onEmpty();
        queue.pause();

        await sleep(2000);

        console.log('done 1');

        queue.add(async () => {
            await sleep(1000);
            console.log('3');
        });

        queue.add(async () => {
            await sleep(1000);
            console.log('4');
        });

        await queue.onEmpty();

        await sleep(2000);

        console.log('done 2');
    }).timeout(20000);
});
