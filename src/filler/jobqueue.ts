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
    private runningPriorities: Array<JobQueuePriority> = [];

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
        for (const priority of [JobQueuePriority.HIGH, JobQueuePriority.MEDIUM, JobQueuePriority.LOW]) {
            if (this.runningPriorities.includes(priority)) {
                continue;
            }

            if ((priority !== JobQueuePriority.HIGH) && this.runningPriorities.filter(r => r !== JobQueuePriority.HIGH).length) {
                return;
            }

            const job = this.jobs
                .filter(job => job.priority === priority)
                .filter(job => job.nextRun <= start)
                .find(job => job);
            if (job) {
                this.runningPriorities.push(job.priority);
                this.run(job)
                    .finally(() => this.runningPriorities = this.runningPriorities.filter(r => r !== job.priority));
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
