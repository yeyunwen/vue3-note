import { reactive, effect } from "./04.js";

export const ref = (value) => {
  const wapper = {
    value,
  };
  Object.defineProperty(wapper, "__v_isRef", {
    value: true,
  });
  return reactive(wapper);
};

export const toRef = (obj, key) => {
  const wapper = {
    get value() {
      return obj[key];
    },
    set value(newValue) {
      obj[key] = newValue;
    },
  };

  Object.defineProperty(wapper, "__v_isRef", {
    value: true,
  });

  return wapper;
};

export const toRefs = (obj) => {
  const ret = {};
  for (const key in obj) {
    ret[key] = toRef(obj, key);
  }

  return ret;
};

export const proxyRefs = (target) => {
  return new Proxy(target, {
    get(target, key, receiver) {
      const res = Reflect.get(target, key, receiver);
      return res.__v_isRef ? res.value : res;
    },
    set(target, key, newValue, receiver) {
      const value = target[key];
      if (value.__v_isRef) {
        value.value = newValue;
        return true;
      }
      return Reflect.set(target, key, newValue, receiver);
    },
  });
};

// const refVal = ref(1);

const obj = reactive({ foo: 1, bar: 2 });

// const newObj = {
//   foo: toRef(obj, "foo"),
//   bar: toRef(obj, "bar"),
// };

// const newObj = {
//   ...toRefs(obj),
// };

const newObj = proxyRefs({
  ...toRefs(obj),
});

effect(() => {
  console.log(newObj.foo);
});
obj.foo = 2;
