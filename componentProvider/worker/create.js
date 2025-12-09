import { Worker } from 'node:worker_threads'

export async function create(opts = {}) {
  const {
    workersCount = 1,
    directories,
    NATS_IP,
    streamName,
  } = opts

  const workerFile = new URL("./worker.js", import.meta.url)
  let workers = Array.from({ length: workersCount }).map((_, workerIndex) =>
    new Worker(workerFile, {
      workerData: {
        workerIndex,
        NATS_IP,
        directories,
        streamName,
      }
    }))
}