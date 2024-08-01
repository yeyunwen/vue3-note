const jobQueue = new Set();
const p = Promise.resolve();

let isFlushing = false;
export const queueJob = (job) => {
  jobQueue.add(job);
  if (isFlushing) return;
  isFlushing = true;
  // job是异步任务，因此需要同步代码都执行完后，在下一轮事件循环中执行
  p.then(() => {
    jobQueue.forEach((job) => job());
  }).finally(() => {
    isFlushing = false;
    jobQueue.clear();
  });
};
