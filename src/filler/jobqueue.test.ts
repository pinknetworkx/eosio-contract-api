import 'mocha';
import { expect } from 'chai';
import { JobQueue, JobQueuePriority } from './jobqueue';

describe('JobQueue', () => {

    it('queues job for immediate execution', async () => {

        const jq = new JobQueue(1);

        let called = false;
        jq.add('Test1', 100, JobQueuePriority.HIGH, () => called = true);

        jq.start();

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(called).to.equal(true);
    });

    it('does not run 2 jobs with the same priority at the same time', async () => {

        const jq = new JobQueue(1);

        const promiseJob1 = new Promise(() => null);

        let calledJob1 = false;
        jq.add('Job1', 1, JobQueuePriority.HIGH, () => (calledJob1 = true) && promiseJob1);
        let calledJob2 = false;
        jq.add('Job2', 1, JobQueuePriority.HIGH, () => calledJob2 = true);

        jq.start();

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(jq.active).to.equal(1);

        expect(calledJob1).to.equal(true);
        expect(calledJob2).to.equal(false);
    });

    it('does not run medium and low priority jobs at the same time', async () => {

        const jq = new JobQueue(1);

        const promiseJob1 = new Promise(() => null);

        let calledJob1 = false;
        jq.add('Job1', 1, JobQueuePriority.MEDIUM, () => (calledJob1 = true) && promiseJob1);
        let calledJob2 = false;
        jq.add('Job2', 1, JobQueuePriority.LOW, () => calledJob2 = true);

        jq.start();

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(calledJob1).to.equal(true);
        expect(calledJob2).to.equal(false);
    });

    it('does run a high and an other priority jobs at the same time', async () => {

        const jq = new JobQueue(1);

        const promiseJob1 = new Promise(() => null);

        let calledJob1 = false;
        jq.add('Job1', 1, JobQueuePriority.HIGH, () => (calledJob1 = true) && promiseJob1);
        let calledJob2 = false;
        jq.add('Job2', 1, JobQueuePriority.LOW, () => calledJob2 = true);

        jq.start();

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(calledJob1).to.equal(true);
        expect(calledJob2).to.equal(true);
    });

    it('only runs jobs that are due', async () => {

        const jq = new JobQueue(1);

        const promiseJob1 = new Promise((res) => res(null));

        let calledJob1 = 0;
        jq.add('Job1', 100, JobQueuePriority.HIGH, () => ++calledJob1 && promiseJob1);

        jq.start();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(calledJob1).to.equal(1);
    });

    it('does not crash when no job is available', async () => {

        const jq = new JobQueue(1);

        jq.start();

        await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('emits error and queues the job again when the job function throws an error', async () => {
        let err: any;
        const jq = new JobQueue(1);
        jq.on('error', (error: Error, job: any) => {
            err = {
                job,
                error,
            };
        });

        const promiseJob1 = new Promise((_, rej) => rej(new Error('Stop')));
        promiseJob1.catch(() => null); // prevent node warning about uncaught promise

        let calledJob1 = 0;
        jq.add('Job1', 1, JobQueuePriority.HIGH, () => ++calledJob1 && promiseJob1);

        jq.start();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(calledJob1).to.greaterThan(1);
        expect(err.error.message).to.equal('Stop');
        expect(err.job.name).to.equal('Job1');
    });

    it('emits debug messages when a job starts and ends', async () => {

        const logs: string[] = [];
        const jq = new JobQueue(1);
        jq.on('debug', message => {
            logs.push(message);
        });

        jq.add('Test1', 100, JobQueuePriority.HIGH, () => null);

        jq.start();

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(logs).to.deep.equal([
            'Started job Test1',
            'Ended job Test1',
        ]);
    });

});
