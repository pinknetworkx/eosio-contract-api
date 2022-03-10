import 'mocha';
import {expect} from 'chai';

import {JobQueue, JobQueuePriority} from './jobqueue';

describe('JobQueue', () => {

    const executeTestWithQueue = async (pulseInterval: number, callback: (jq: JobQueue) => Promise<void>): Promise<void> => {
        const jq = new JobQueue(pulseInterval);
        try {
            await callback(jq);
        } catch (e: unknown) {
            jq.stop();
            throw e;
        } finally {
            jq.stop();
        }
    };

    it('queues job for immediate execution', async () => {
        await executeTestWithQueue(1, async (jq) => {
            let called = false;
            jq.add('Test1', 100, JobQueuePriority.HIGH, () => called = true);

            jq.start();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(called).to.equal(true);
        });
    },);

    it('does not run 2 jobs with the same priority at the same time', async () => {
        await executeTestWithQueue(1, async (jq) => {
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
    });

    it('does run medium and low priority jobs at the same time', async () => {
        await executeTestWithQueue(1, async (jq) => {
            const promiseJob1 = new Promise(() => null);
            const now = new Date();
            let calledJob1At: Date;
            jq.add('Job1', 1, JobQueuePriority.MEDIUM, () => (calledJob1At = new Date()) && promiseJob1);
            let calledJob2At: Date;
            jq.add('Job2', 1, JobQueuePriority.LOW, () => calledJob2At = new Date());

            jq.start();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(calledJob1At).to.be.greaterThan(now);
            expect(calledJob1At).to.be.lessThanOrEqual(calledJob2At);
        });
    });

    it('does run a high and an other priority jobs at the same time', async () => {
        await executeTestWithQueue(1, async (jq) => {
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
    });

    it('only runs jobs that are due', async () => {
        await executeTestWithQueue(1, async (jq) => {
            const promiseJob1 = new Promise((res) => res(null));

            let calledJob1 = 0;
            jq.add('Job1', 100, JobQueuePriority.HIGH, () => ++calledJob1 && promiseJob1);

            jq.start();

            await new Promise(resolve => setTimeout(resolve, 20));

            expect(calledJob1).to.equal(1);
        });
    });

    it('does not crash when no job is available', async () => {
        await executeTestWithQueue(1, async (jq) => {
            jq.start();
            await new Promise(resolve => setTimeout(resolve, 10));
        });
    });

    it('emits error and queues the job again when the job function throws an error', async () => {
        await executeTestWithQueue(1, async (jq) => {
            let err: any;
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
    });

    it('emits debug messages when a job starts and ends', async () => {
        await executeTestWithQueue(1, async (jq) => {
            const logs: string[] = [];
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
});
