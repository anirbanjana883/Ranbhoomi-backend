import { Queue } from "bullmq";
import { redisTCP } from "./redis.js";

const defaultOpts = {
    connection: redisTCP,
    defaultJobOptions: {
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
    }
};

export const dispatchQueue = new Queue("dispatch-queue", defaultOpts);
export const pollingQueue = new Queue("polling-queue", defaultOpts);
export const contestDispatchQueue = new Queue("contest-dispatch-queue", defaultOpts);
export const contestPollingQueue = new Queue("contest-polling-queue", defaultOpts);
export const aiRetryQueue = new Queue("ai-retry-queue", { connection: redisTCP, defaultJobOptions: { removeOnComplete: true } });