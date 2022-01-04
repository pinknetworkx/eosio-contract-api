import { EventEmitter } from 'events';

export enum JobQueuePriority {
    HIGH = 1,
    MEDIUM = 2,
    LOW = 3,
}

type Job = {
    name: string,
    interval: number,
    priority: JobQueuePriority,
    fn: () => any,
    nextRun: number,
};

export class JobQueue extends EventEmitter {

    private readonly jobs: Array<Job> = [];

    private pulseID: NodeJS.Timer;
    private readonly pulseInterval: number;
    private runningPriorities: Array<number> = [];

    get active(): number {
        return this.runningPriorities.length;
    }

    constructor(pulseInterval = 1_000) {
        super();

        this.pulseInterval = pulseInterval;
    }

    add(name: string, interval: number, priority: JobQueuePriority, fn: () => any): void {
        this.jobs.push({
            name,
            interval,
            priority,
            fn,
            nextRun: Date.now(),
        });
    }

    private pulse(): void {
        const start = Date.now();
        for (const priority of [JobQueuePriority.HIGH.valueOf(), JobQueuePriority.MEDIUM.valueOf(), JobQueuePriority.LOW.valueOf()]) {
            if (this.runningPriorities.includes(priority)) {
                continue;
            }

            const jobs = this.jobs
                .filter(job => job.priority.valueOf() === priority)
                .filter(job => job.nextRun <= start)
                .sort((a, b) => a.nextRun - b.nextRun);

            if (jobs.length > 0) {
                this.runningPriorities.push(jobs[0].priority.valueOf());

                this.run(jobs[0]).finally(() => {
                    this.runningPriorities = this.runningPriorities.filter(r => r !== jobs[0].priority.valueOf());
                });
            }
        }
    }

    private async run(job: Job): Promise<void> {
        try {
            this.emit('debug', `Started job ${job.name}`, job);
            await job.fn();
        } catch (e) {
            this.emit('error', e, job);
        } finally {
            job.nextRun = Date.now() + job.interval;
            this.emit('debug', `Ended job ${job.name}`, job);
        }
    }

    start(): void  {
        this.pulseID = setInterval(() => this.pulse(), this.pulseInterval);
    }

    stop(): void {
        clearInterval(this.pulseID);
        this.pulseID = null;
        this.jobs.length = 0;
    }

}
