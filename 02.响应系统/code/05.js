import { reactive, effect } from "./04.js";

const obj = {
  foo: 1,
  get bar() {
    console.log(this.foo);
  },
};

const p = reactive(obj);

effect(() => {
  for (const key in p) {
    console.log(key);
  }
});

setTimeout(() => {
  delete p.foo;
}, 1000);
