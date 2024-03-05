const bucket = new WeakMap(); // 之所以用WeakMap，是因为WeakMap是弱引用。 而bucket中的的key是要代理的目标，如果目标不被用户使用，也就没有收集依赖的必要。
let activeEffect = null;
const effectStack = [];

const jobQueue = new Set();
const p = Promise.resolve();

let isFlushing = false;
const flushJobs = () => {
  if (isFlushing) return;
  isFlushing = true;
  // job是异步任务，因此需要同步代码都执行完后，在下一轮事件循环中执行
  p.then(() => {
    jobQueue.forEach((job) => job());
  }).finally(() => {
    isFlushing = false;
  });
};

const cleanup = (effectFn) => {
  for (const deps of effectFn.deps) {
    deps.delete(effectFn);
  }
  effectFn.deps.length = 0;
};

const effect = (fn, options = {}) => {
  const effectFn = () => {
    cleanup(effectFn);
    activeEffect = effectFn;
    effectStack.push(effectFn);

    fn();

    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
  };
  effectFn.deps = [];
  effectFn.options = options;

  effectFn();
};

const track = (target, key) => {
  if (!activeEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()));
  }
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, (deps = new Set()));
  }
  deps.add(activeEffect);

  activeEffect.deps.push(deps);
};

const trigger = (target, key) => {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const deps = depsMap.get(key);

  const depsToRun = new Set(deps);
  depsToRun.forEach((effectFn) => {
    if (effectFn === activeEffect) {
      depsToRun.delete(effectFn);
    }
  });

  depsToRun.forEach((effectFn) => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
};

const data = {
  foo: 1,
  bar: true,
};

const obj = new Proxy(data, {
  get(target, key) {
    track(target, key);

    return target[key];
  },
  set(target, key, newValue) {
    target[key] = newValue;
    trigger(target, key);

    return true;
  },
});

//#region 分支切换与cleanup
// effect(() => {
//   document.body.innerHTML = obj.ok ? obj.text : "not";
// });
// #endregion

//#region  嵌套 effect
// let temp1, temp2;

// effect(function effect1() {
//   console.log("effect1");

//   effect(function effect2() {
//     console.log("effect2");
//     temp2 = obj.bar;
//   });

//   temp1 = obj.foo;
// });
//#endregion

//#region 避免无限递归
// effect(() => {
//   obj.foo++;
// });
//#endregion

//#region 调度执行
effect(
  () => {
    console.log(obj.foo);
  },
  {
    scheduler(fn) {
      jobQueue.add(fn);
      flushJobs();
    },
  }
);

obj.foo++;
obj.foo++;
// console.log("end");
//#endregion
