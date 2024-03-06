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
    // 触发track，收集依赖
    // 执行 用户传入的副作用函数，并将结果保存在res中
    const res = fn();
    console.log("effectFn");
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];

    return res; // 返回用户传入的副作用函数的执行结果
  };
  effectFn.deps = [];
  effectFn.options = options;
  if (!effectFn.options.lazy) {
    effectFn();
  }
  // 懒执行 effect 不会被立即执行 而是将内部包含副作用函数的effecFn函数返回，
  // 让使用者自己执行，提高了函数的可调用性，让副作用函数更加灵活
  return effectFn;
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
      // 如果有调度函数，就调用，让调用者自己实现副作用的逻辑
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
};

const computed = (getter) => {
  let value;
  let dirty = true;

  const effectFn = effect(getter, {
    lazy: true,
    scheduler: () => {
      if (!dirty) {
        // 只有在依赖发生改变时才会执行，即触发trigger时，才会恢复计算, 这里还用到了闭包。🐮！！！
        dirty = true;
        trigger(obj, "value");
      }
    },
  });

  return {
    get value() {
      if (dirty) {
        value = effectFn();
        dirty = false;
      }

      track(obj, "value");
      return value;
    },
  };
};

/**
 * 递归遍历给定值，以防止循环引用，并对每个嵌套值执行操作。
 *
 * @param {any} value - 要遍历的值
 * @param {Set} seen - 已经遍历过的值的集合，以防止循环引用
 * @return {void}
 */
const traverse = (value, seen = new Set()) => {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const k in value) {
    traverse(value[k], seen);
  }
};

const watch = (source, cb) => {
  let getter;
  if (typeof source === "function") {
    getter = source;
  } else {
    getter = () => traverse(source);
  }
  let oldValue, newValue;
  const effectFn = effect(() => getter(), {
    // 开启懒执行，返回副作用函数
    lazy: true,
    scheduler() {
      newValue = effectFn();
      cb(newValue, oldValue);
      oldValue = newValue;
    },
  });
  // 初始化时执行一次拿到旧值，并进行依赖收集
  // 调用副作用函数，拿到用户传入副作用函数（getter）的返回值
  oldValue = effectFn();
};

const data = {
  foo: 1,
  bar: 2,
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
// effect(
//   () => {
//     console.log(obj.foo);
//   },
//   {
//     scheduler(fn) {
//       jobQueue.add(fn);
//       flushJobs();
//     },
//   }
// );

// obj.foo++;
// obj.foo++;
// console.log("end");
//#endregion

// #region 懒执行
// const effectFn = effect(() => obj.foo + obj.bar, {
//   lazy: true,
// });
// #endregion

// #region 计算属性 computed
// const doubleFoo = computed(() => obj.foo * 2);
// console.log(doubleFoo.value);
// obj.foo = 2;
// doubleFoo.value;

// const sumRefs = computed(() => obj.foo + obj.bar);

// effect(() => {
//   console.log(sumRefs.value);
// });
//#endregion

//#region watch
watch(
  () => obj.foo,
  (newValue, oldValue) => {
    console.log("newValue: ", newValue);
    console.log("odlValue: ", oldValue);
  }
);
//#endregionx
