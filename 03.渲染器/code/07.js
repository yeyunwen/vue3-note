import {
  isArray,
  isObject,
  isString,
  normalizeClass,
} from "../../shared/index.js";
import { effect, ref } from "../../dist/reactivity.esm-browser.js";

const DOM_API = {
  createElement(tag) {
    console.log(`createElement ${tag}`);
    return document.createElement(tag);
  },
  setElementText(container, text) {
    console.log(`setElementText ${text}`);
    container.textContent = text;
  },
  /**
   *
   * @param {HTMLElement} child
   * @param {HTMLElement} parent
   * @param {HTMLElement | null} anchor 将要插在这个节点之前，如果null，则在末尾插入
   */
  insert(child, parent, anchor = null) {
    console.log(`insert ${child} ${parent} ${anchor}`);
    parent.insertBefore(child, anchor);
  },

  patchProps(el, key, prevValue, nextValue) {
    const shouldSetAsProps = (el, key, value) => {
      if (key === "form" && el.tagName === "INPUT") return false;
      return key in el;
    };

    if (/^on/.test(key)) {
      const invokers = el._vei || (el._vei = {});
      let invoker = invokers[key];
      const name = key.slice(2).toLowerCase();
      if (nextValue) {
        if (!invoker) {
          invoker = invokers[key] = (e) => {
            // e事件对象的值是触发的时候获得的，invoker的value值是绑定事件的时候通过闭包获得的
            // 通过对比时间戳，判断事件触发的事件是否早于绑定事件的事件，如果是的话就不触发
            if (e.timestamp < invoker.attached) return;
            if (isArray(invoker.value)) {
              invoker.value.forEach((fn) => fn(e));
            } else {
              invoker.value(e);
            }
          };
          invoker.value = nextValue;
          invoker.attached = performance.now();
          el.addEventListener(name, invoker);
        } else {
          invoker.value = nextValue;
        }
      } else if (invoker) {
        // 如果新的事件处理函数不存在，但是之前的存在，则清楚之前的绑定
        el.removeEventListener(name, invoker);
      }
    } else if (key === "class") {
      // 设置class有三种方法 setAttribute、el.className、el.classList
      // el.className性能最优
      el.className = nextValue || "";
    } else if (shouldSetAsProps(el, key, nextValue)) {
      const type = typeof el[key];
      if (type === "boolean" && nextValue === "") {
        el[key] = true;
      } else {
        el[key] = nextValue;
      }
    } else {
      el.setAttribute(key, nextValue);
    }
  },
};

const createRenderer = (options) => {
  const { createElement, setElementText, insert, patchProps } = options;

  const hydrate = () => {};
  const render = (vnode, container) => {
    if (vnode) {
      // 挂载
      patch(container._vnode, vnode, container);
    } else {
      // 新节点不存在 && 旧节点存在 指向卸载
      if (container._vnode) {
        unmount(container._vnode);
      }
    }
    container._vnode = vnode;
  };
  /**
   *
   * @param {VNode} n1 旧节点
   * @param {VNode} n2 新节点
   * @param {*} container 容器
   */
  const patch = (n1, n2, container) => {
    // 如果两个vnode类型不同，直接卸载旧节点
    if (n1 && n1.type !== n2.type) {
      unmount(n1);
      n1 = null;
    }
    // 到这为止，如果n1 !== null 说明两个vnode类型相同
    const { type } = n2;
    if (isString(type)) {
      // 如果旧节点不存在，就意味着挂载
      if (!n1) {
        mountElement(n2, container);
      } else {
        // 更新
        // patchElement(n1, n2);
        mountElement(n2, container);
      }
    } else if (isObject(type)) {
      // 组件
    }
  };

  const mountElement = (vnode, container) => {
    const el = (vnode.el = createElement(vnode.type));

    // 处理children
    if (typeof vnode.children === "string") {
      setElementText(el, vnode.children);
    } else if (Array.isArray(vnode.children)) {
      vnode.children.forEach((child) => {
        patch(null, child, el);
      });
    }

    // 处理props
    if (vnode.props) {
      for (const key in vnode.props) {
        patchProps(el, key, null, vnode.props[key]);
      }
    }

    insert(el, container);
  };

  const patchElement = (n1, n2) => {};

  const unmount = (vnode) => {
    const parent = vnode.el.parent;
    if (parent) {
      parent.removeChild(vnode.el);
    }
  };

  return {
    render,
    hydrate,
  };
};

// const vnode = {
//   type: "h1",
//   children: "hello",
// };

// const vnode = {
//   type: "div",
//   props: {
//     id: "foo",
//     class: normalizeClass([
//       "foo bar",
//       {
//         baz: true,
//         zsh: false,
//       },
//     ]),
//     onClick: [
//       (e) => {
//         console.log("click1", e);
//       },
//       (e) => {
//         console.log("click2", e);
//       },
//     ],
//     onMouseenter: (e) => {
//       console.log("Mouseenter", e);
//     },
//   },
//   children: [
//     {
//       type: "p",
//       children: "12323",
//     },
//   ],
// };

const container = { type: "root" };
console.log("1");

const renderer = createRenderer(DOM_API);
const bol = ref(false);

effect(() => {
  const vnode = {
    type: "div",
    props: bol.value
      ? {
          onClick: () => {
            alert("父元素clickde");
          },
        }
      : {},
    children: [
      {
        type: "p",
        props: {
          onClick: (e) => {
            bol.value = true;
            console.log("子元素clickde", e);
          },
        },
        children: "text",
      },
    ],
  };
  console.log("effect");
  renderer.render(vnode, document.querySelector("#app"));
});
