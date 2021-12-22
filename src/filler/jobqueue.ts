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
    private running: Array<JobQueuePriority> = [];

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
            if (this.running.includes(priority)) {
                continue;
            }

            if ((priority !== JobQueuePriority.HIGH) && this.running.filter(r => r !== JobQueuePriority.HIGH).length) {
                return;
            }

            const jobs = this.jobs
                .filter(job => job.priority === priority)
                .filter(job => job.nextRun <= start);
            if (jobs.length) {
                this.run(jobs[0]);
            }
        }
    }

    private async run(job: Job): Promise<void> {
        this.running.push(job.priority);
        try {
            this.emit('debug', `Started job ${job.name}`, job);
            await job.fn();
        } catch (e) {
            this.emit('error', e, job);
        } finally {
            this.running = this.running.filter(r => r !== job.priority);
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
