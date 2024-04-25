import {
  reactive,
  shallowReactive,
  readonly,
  shallowReadonly,
  effect,
} from "./04.js";

//#region 代理Object
// const obj = {
//   foo: 1,
//   get bar() {
//     console.log(this.foo);
//   },
// };

// const p = reactive(obj);

// effect(() => {
//   console.log(p.foo);
// });

// setTimeout(() => {
// p.foo = 1;
// }, 1000);
//#endregion

//#region 合理的触发更新，值不变不更新，原型链
// const reactive = (obj) => {
//   return new Proxy(obj, {
//     get(target, key) {
//       if (key === "raw") {
//         return target;
//       }
//       console.log("get", target);
//       return target[key];
//     },
//     set(target, key, newValue, receiver) {
//       if (target === receiver.raw) {
//         console.log("set", target);
//       }
//       target[key] = newValue;
//       return true;
//     },
//   });
// };

// const obj = {};
// const proto = { foo: 1 };

// const child = reactive(obj);
// const parent = reactive(proto);

// Object.setPrototypeOf(child, parent);

// effect(() => {
//   console.log(child.foo);
// });
// // console.log(parent.foo);

// console.log(child.raw === obj);

// child.foo = 33;
// parent.foo = 34;
// parent.foo = 36;
// console.log(child.foo);

//#endregion

//#region 浅响应与深响应

// const obj = {
//   foo: {
//     bar: 1,
//   },
// };

// const p = shallowReactive(obj);

// effect(() => {
//   console.log(p.foo.bar);
// });

// p.foo.bar = 2;
//#endregion

// #region 只读和只浅读
// const obj = {
//   foo: {
//     bar: 1,
//   },
// };

// const p = shallowReadonly(obj);

// effect(() => {
//   console.log(p.foo.bar);
// });

// p.foo.bar = 2;
//#endregion

//#region 代理数组

const arr = reactive([1, 2, 3]);

// arr[Symbol.iterator] = function () {
//   const target = this;
//   let index = 0;
//   return {
//     next() {
//       return {
//         value: index < target.length ? target[index] : undefined,
//         done: index++ >= target.length,
//       };
//     },
//   };
// };

effect(() => {
  // console.log(arr[0]);
  // console.log(arr.length);
  // console.log(arr[2]);
  // for (const item in arr) {
  //   console.log(item);
  // }
  // for (const value of arr) {
  //   console.log(value);
  // }
  // console.log(arr.includes(3));
});

// arr[0] = 4;

// const obj = {};
// const arr1 = reactive([obj]);
// console.log(arr1.indexOf(arr1[0]));
// console.log(arr1.includes(obj));

effect(() => {
  arr.push(1);
});
effect(() => {
  arr.push(1);
});

// #endregion
