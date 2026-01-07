import client from "prom-client";

// 1. ADD 'export' HERE so server.js can see it
export const register = new client.Registry();

// Add default metrics (CPU usage, RAM usage, Event Loop lag)
client.collectDefaultMetrics({ register });

// Custom Metrics ->

// Track total HTTP requests
export const httpRequestCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// Track request duration (Latency)
export const httpRequestDurationMicroseconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Track Submission Queue Depth (Worker Metric)
export const submissionQueueGauge = new client.Gauge({
  name: "submission_queue_depth",
  help: "Number of jobs waiting in the queue",
  registers: [register],
});

// (No need for export default register anymore)