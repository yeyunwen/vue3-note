const bucket = new Set();

const data = {
  text: "hello world",
};

let activeEffect = null;

const effect = (fn) => {
  activeEffect = fn;
  fn();
};

const obj = new Proxy(data, {
  get(target, key) {
    if (activeEffect) {
      bucket.add(activeEffect);
    }
    return target[key];
  },
  set(target, key, newValue) {
    target[key] = newValue;
    bucket.forEach((fn) => fn());
    return true;
  },
});

effect(() => {
  document.body.innerHTML = obj.text;
});

setTimeout(() => {
  obj.text = "hello vue";
}, 1000);
