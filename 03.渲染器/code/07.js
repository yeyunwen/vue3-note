import {
  isArray,
  isObject,
  isString,
  normalizeClass,
} from "../../shared/index.js";
import { effect, ref } from "../../dist/reactivity.esm-browser.js";

/**
 * @typedef {{
 * type: string | object,
 * props: Record<string, any> | null,
 * children: string | VNode[]| null,
 * el: HTMLElement,
 * key: string | number | null
 * }} VNode
 * */

export const DOM_API = {
  createElement(tag) {
    console.log(`createElement ${tag}`);
    return document.createElement(tag);
  },
  setElementText(container, text) {
    console.log(`setElementText ${text}`);
    container.textContent = text;
  },
  createText(text) {
    return document.createTextNode(text);
  },
  setText(el, text) {
    el.nodeValue = text;
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

  /**
   *  更新Props
   * @param {HTMLElement} el 已挂载的真实DOM
   * @param {string} key props key
   * @param {any} prevValue 上一次对应props[key]的值
   * @param {any} nextValue 新的props[key]的值
   */
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

const Text = Symbol("text");
const Comment = Symbol("comment");
const Fragment = Symbol("fragment");

/**
 *
 * @param {typeof DOM_API} options
 * @returns {{render: () => void, hydrate: () => void}}
 */
export const createRenderer = (options) => {
  const {
    createElement,
    setElementText,
    insert,
    patchProps,
    createText,
    setText,
  } = options;

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
    // 记录当前节点，在下次render是判断之前是否render
    container._vnode = vnode;
  };
  /**
   *  挂载、更新
   * @param {VNode | null} n1 旧节点 如果为null就走挂载
   * @param {VNode} n2 新节点
   * @param {HTMLElement} container 容器
   * @param {HTMLElement | null} anchor 将要插在这个节点之前，如果null，则在末尾插入
   */
  const patch = (n1, n2, container, anchor = null) => {
    // 如果两个vnode类型不同，直接卸载旧节点
    if (n1 && n1.type !== n2.type) {
      unmount(n1);
      n1 = null;
    }
    // 到这为止，如果n1 !== null 说明两个vnode类型相同
    const { type } = n2;
    switch (type) {
      case Text: {
        if (!n1) {
          // 确保vnode 有el属性指向它的真实dom
          const el = (n2.el = createText(n2.children));
          insert(el, container, anchor);
        } else {
          // 确保vnode 有el属性指向它的真实dom
          const el = (n2.el = n1.el);
          if (n2.children !== n1.children) {
            setText(el, n2.children);
          }
        }
        break;
      }
      case Comment: {
        break;
      }
      case Fragment: {
        if (!n1) {
          n2.children.forEach((c) => patch(null, c, container, anchor));
        } else {
          patchChildren(n1, n2, container);
        }
        break;
      }
      default: {
        if (isString(type)) {
          // 如果旧节点不存在，就意味着挂载
          if (!n1) {
            mountElement(n2, container, anchor);
          } else {
            // 新旧节点类型相同 更新
            patchElement(n1, n2);
          }
        } else if (isObject(type)) {
          // 组件
        }
      }
    }
  };

  /**
   * 挂载节点
   * @param {VNode} vnode 需要挂载的vnode
   * @param {HTMLElement} container 挂载容器
   * @param {HTMLElement | null} anchor 将要插入的位置
   */
  const mountElement = (vnode, container, anchor = null) => {
    // 确保vnode 有el属性指向它的真实dom
    const el = (vnode.el = createElement(vnode.type));

    // 处理children
    if (typeof vnode.children === "string") {
      setElementText(el, vnode.children);
    } else if (Array.isArray(vnode.children)) {
      vnode.children.forEach((child) => {
        patch(null, child, el, anchor);
      });
    }

    // 处理props
    if (vnode.props) {
      for (const key in vnode.props) {
        patchProps(el, key, null, vnode.props[key]);
      }
    }

    insert(el, container, anchor);
  };

  /**
   * 更新节点
   * @param {VNode} n1 旧节点
   * @param {VNode} n2 新节点
   */
  const patchElement = (n1, n2) => {
    // 确保vnode 有el属性指向它的真实dom
    // 在patch更新阶段、旧节点肯定会有属性el指向它的真实DOM
    const el = (n2.el = n1.el);
    const oldProps = n1.props;
    const newProps = n2.props;
    // 更新props
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key]);
      }
    }
    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null);
      }
    }

    // 更新children
    patchChildren(n1, n2, el);
  };

  /**
   *  更新子节点
   * @param {VNode} n1 旧vnode
   * @param {VNode} n2 新vnode
   * @param {HTMLElement} container 原先的真实DOM
   */
  const patchChildren = (n1, n2, container) => {
    // 新子节点是文本
    if (isString(n2.children)) {
      if (isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c));
      }
      setElementText(container, n2.children);
    } else if (isArray(n2.children)) {
      // 新子节点是数组
      // 这里是会涉及到patch的核心：diff
      if (isArray(n1.children)) {
        // 有key的情况
        patchKeyedChildren(n1, n2, container);
        // 没有Key的情况
        // patchUnKeyedChildren(n1, n2, container);
      } else {
        setElementText(container, "");
        n2.children.forEach((c) => patch(null, c, container));
      }
    } else {
      // 新子节点不存在
      if (isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c));
      } else {
        setElementText(container, "");
      }
    }
  };

  /**
   *
   * @param {VNode} c1
   * @param {VNode} c2
   * @param {HTMLElement} container
   */
  const patchKeyedChildren = (c1, c2, container) => {
    /** @type {VNode[]} */
    const oldChildren = c1.children;
    /** @type {VNode[]} */
    const newChildren = c2.children;
    // 4个指针 分别指向旧节点和新节点的头尾节点
    let oldStartIdx = 0;
    let newStartIdx = 0;
    let oldEndIdx = oldChildren.length - 1;
    let newEndIdx = newChildren.length - 1;
    // 旧节点和新节点的头尾节点
    let oldStartVNode = oldChildren[oldStartIdx];
    let newStartVNode = newChildren[newStartIdx];
    let oldEndVNode = oldChildren[oldEndIdx];
    let newEndVNode = newChildren[newEndIdx];

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (oldStartVNode.key === newStartVNode.key) {
        // 头头
        patch(oldStartVNode, newStartVNode, container);
        ++oldStartIdx;
        ++newStartIdx;
      } else if (oldEndVNode.key === newEndVNode.key) {
        // 尾尾
        patch(oldEndVNode, newEndVNode, container);
        --oldEndIdx;
        --newEndIdx;
      } else if (oldStartVNode.key === newEndVNode.key) {
        // 头尾
        patch(oldStartVNode, newEndVNode, container);
        insert(oldStartVNode.el, container, oldEndVNode.el.nextSibling);
        oldStartVNode = oldChildren[++oldStartIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldEndVNode.key === newStartVNode.key) {
        // 尾头
        patch(oldEndVNode, newStartVNode, container);
        insert(oldEndVNode.el, container, oldStartVNode.el);
        oldEndVNode = oldChildren[--oldEndIdx];
        newStartVNode = newChildren[++newStartIdx];
      }
    }
  };

  /**
   *
   * @param {VNode} c1
   * @param {VNode} c2
   * @param {HTMLElement} container
   */
  const patchUnKeyedChildren = (c1, c2, container) => {
    const oldChildren = c1.children;
    const newChildren = c2.children;
    const oldLen = oldChildren.length;
    const newLen = newChildren.length;
    const commonLen = Math.min(oldLen, newLen);
    for (let i = 0; i < commonLen; i++) {
      patch(oldChildren[i], newChildren[i], container);
    }
    if (newLen > oldLen) {
      for (let i = commonLen; i < newLen; i++) {
        patch(null, newChildren[i], container);
      }
    } else {
      for (let i = commonLen; i < oldLen; i++) {
        unmount(oldChildren[i]);
      }
    }
  };

  /**
   *
   * @param {VNode} vnode
   * @returns
   */
  const unmount = (vnode) => {
    if (vnode.type === Fragment) {
      vnode.children.forEach((c) => unmount(c));
      return;
    }
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
