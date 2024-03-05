const bucket = new WeakMap(); // 之所以用WeakMap，是因为WeakMap是弱引用。 而bucket中的的key是要代理的目标，如果目标不被用户使用，也就没有收集依赖的必要。
let activeEffect = null;
const effectStack = [];

const cleanup = (effectFn) => {
  for (const deps of effectFn.deps) {
    deps.delete(effectFn);
  }
  effectFn.deps.length = 0;
};

const effect = (fn) => {
  const effectFn = () => {
    cleanup(effectFn);
    activeEffect = effectFn;
    effectStack.push(effectFn);
    fn();
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
  };
  effectFn.deps = [];

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
  depsToRun.forEach((fn) => fn());
};

const data = {
  foo: true,
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
let temp1, temp2;

effect(function effect1() {
  console.log("effect1");

  effect(function effect2() {
    console.log("effect2");
    temp2 = obj.bar;
  });

  temp1 = obj.foo;
});
//#endregion
