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

export const effect = (fn, options = {}) => {
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
  if (!activeEffect || !shouldTrack) return;
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

const trigger = (target, key, type, newValue) => {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effects = depsMap.get(key);

  const effectsToRun = new Set();
  effects &&
    effects.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    });

  if (type === TriggerType.ADD || type === TriggerType.DELETE) {
    const iterateEffects = depsMap.get(ITERATE_KEY);

    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn);
        }
      });
  }

  if (type === TriggerType.ADD && Array.isArray(target)) {
    const lengthEffects = depsMap.get("length");
    lengthEffects &&
      lengthEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn);
        }
      });
  }

  if (key === "length" && Array.isArray(target)) {
    depsMap.forEach((effects, key) => {
      if (key < newValue || key === "length") return;
      effects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToRun.add(effectFn);
        }
      });
    });
  }

  effectsToRun.forEach((effectFn) => {
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

const watch = (source, cb, options = {}) => {
  let getter;
  if (typeof source === "function") {
    getter = source;
  } else {
    getter = () => traverse(source);
  }
  let oldValue, newValue;
  // 用来存储用户注册的过期回调
  let cleanup;
  const onInvalidate = (fn) => {
    cleanup = fn;
  };

  const job = () => {
    if (cleanup) {
      cleanup();
    }
    newValue = effectFn();
    cb(newValue, oldValue, onInvalidate);
    oldValue = newValue;
  };
  const effectFn = effect(() => getter(), {
    // 开启懒执行，返回副作用函数
    lazy: true,
    scheduler: () => {
      if (options.flush === "post") {
        const p = Promise.resolve();
        p.then(job);
      } else {
        job();
      }
    },
  });
  // 初始化时执行一次拿到旧值，并进行依赖收集
  // 调用副作用函数，拿到用户传入副作用函数（getter）的返回值
  if (options.immediate) {
    job();
  } else {
    oldValue = effectFn();
  }
};

// const data = {
//   foo: 1,
//   bar: 2,
// };

// const obj = new Proxy(data, {
//   get(target, key) {
//     track(target, key);

//     return target[key];
//   },
//   set(target, key, newValue) {
//     target[key] = newValue;
//     trigger(target, key);

//     return true;
//   },
// });

const ITERATE_KEY = Symbol();

const TriggerType = {
  SET: "SET",
  ADD: "ADD",
  DELETE: "DELETE",
};

/**
 * 重写数组原型中的某些方法，为了解决调用数组方法时this指向问题
 * @description 因为在代理对象上调用includes方法时，includes的this指向代理对象，如Reflect.get(target, key, receiver)
 * @example
 * ```js
 * const obj = {};
 * const arr = reactive([obj]);
 * console.log(arr.includes(obj)); // false
 * ```
 */
const arrayFindOrginMethods = ["includes", "indexOf", "lastIndexOf"];

/**
 * 重写数组原型中的某些方法，为了解决调用设置数组的方法时也会触发track，导致溢栈的问题
 * @description 因为在代理对象上调用includes方法时，includes的this指向代理对象，如Reflect.get(target, key, receiver)
 * @example
 * ```js
 * effect(() => {
 *  arr.push(1);
 * });
 * effect(() => {
 *  arr.push(1);
 *});
 * ```
 */
const arraySetOrginMethods = ["push", "pop", "shift", "unshift", "splice"];
let shouldTrack = true;

const arrayInstrumentations = {};

arrayFindOrginMethods.forEach((method) => {
  const orginMethod = Array.prototype[method];

  arrayInstrumentations[method] = function (...args) {
    let res = orginMethod.apply(this, args);
    if (res === false || res === -1) {
      res = orginMethod.apply(this.raw, args);
    }
    return res;
  };
});

arraySetOrginMethods.forEach((method) => {
  const orginMethod = Array.prototype[method];
  arrayInstrumentations[method] = function (...args) {
    shouldTrack = false;
    const res = orginMethod.apply(this, args);
    shouldTrack = true;
    return res;
  };
});

export const createReactive = (obj, isShallow = false, isReadonly = false) => {
  return new Proxy(obj, {
    get(target, key, receiver) {
      console.log("get", key);
      if (key === "raw") {
        return target;
      }

      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }

      const res = Reflect.get(target, key, receiver);

      if (!isReadonly && typeof key !== "symbol") {
        track(target, key);
      }

      if (isShallow) {
        return res;
      }
      if (typeof res === "object" && res !== null) {
        return isReadonly ? readonly(res) : reactive(res);
      }
      return res;
    },
    set(target, key, newValue, receiver) {
      if (isReadonly) {
        console.warn(`属性${key}是只读的`);
        return true;
      }

      const oldValue = target[key];
      const type = Array.isArray(target)
        ? Number(key) < target.length
          ? TriggerType.SET
          : TriggerType.ADD
        : Object.prototype.hasOwnProperty.call(target, key)
        ? TriggerType.SET
        : TriggerType.ADD;

      const res = Reflect.set(target, key, newValue, receiver);
      if (target === receiver.raw) {
        if (
          oldValue !== newValue &&
          (oldValue === oldValue || newValue === newValue)
        ) {
          trigger(target, key, type, newValue);
        }
      }

      return res;
    },
    // 支持 in 操作
    has(target, key) {
      track(target, key);
      return Reflect.has(target, key);
    },
    // 支持 for...in 操作
    ownKeys(target) {
      track(target, Array.isArray(target) ? "length" : ITERATE_KEY);
      return Reflect.ownKeys(target);
    },
    // 支持 for...in 操作
    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`属性${key}是只读的`);
        return true;
      }
      const hasKey = Object.prototype.hasOwnProperty.call(target, key);
      const res = Reflect.deleteProperty(target, key);

      if (res && hasKey) {
        trigger(target, key, TriggerType.DELETE);
      }

      return res;
    },
  });
};

/**
 * @description 解决多次读取深层响应式对象上非原始值属性时，每次读取都会得到不一样的reactive对象的问题
 *
 * @example
 * ```js
 * const obj = {};
 * const arr1 = reactive([obj]);
 * console.log(arr1.includes(arr1[0])); // false
 * ```
 */
const reactiveMap = new Map();

export const reactive = (obj) => {
  const existingProxy = reactiveMap.get(obj);
  if (existingProxy) {
    return existingProxy;
  }

  const proxy = createReactive(obj);

  reactiveMap.set(obj, proxy);

  return proxy;
};

export const shallowReactive = (obj) => {
  return createReactive(obj, true);
};

export const readonly = (obj) => {
  return createReactive(obj, false, true);
};

export const shallowReadonly = (obj) => {
  return createReactive(obj, true, true);
};

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
// watch(
//   () => obj.foo,
//   (newValue, oldValue, onInvalidate) => {
//     console.log("newValue: ", newValue);
//     console.log("odlValue: ", oldValue);
//     onInvalidate(() => {
//       console.log("onInvalidate");
//     });
//   },
//   {
//     immediate: true,
//     flush: "post",
//   }
// );

// // obj.foo++;
// console.log("sync");
//#endregion
