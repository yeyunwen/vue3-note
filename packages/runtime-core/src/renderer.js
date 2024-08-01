// @ts-check
import {
  isArray,
  isObject,
  isString,
  isNumber,
} from "../../shared/src/general.js";
import { Text, Comment, Fragment } from "./vnode.js";
import { effect, reactive } from "../../../packages/reactivity/src/effect.js";
import { queueJob } from "./scheduler.js";

/**
 * @typedef {{
 * state: any,
 * isMounted: boolean,
 * subtree: VNode | null
 * }} Instance
 *
 * @typedef {{
 * type: string | object,
 * props: Record<string, any> | null,
 * children: string | VNode[]| null,
 * el: HTMLElement,
 * key: string | number | null,
 * component: Instance
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

const getSequence = (arr) => {
  const p = arr.slice();
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p[i] = j;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = (u + v) >> 1;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }
  return result;
};

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
          if (!n1) {
            mountComponet(n2, container, anchor);
          } else {
            patchComponet(n1, n2, anchor);
          }
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
    if (isString(vnode.children) || isNumber(vnode.children)) {
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
    if (isString(n2.children) || isNumber(n2.children)) {
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

    // 1.更新相同的前置节点
    let j = 0;
    let oldVNode = oldChildren[j];
    let newVNode = newChildren[j];
    while (oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, container);
      j++;
      oldVNode = oldChildren[j];
      newVNode = newChildren[j];
    }

    // 2.更新相同的后置节点
    let oldEnd = oldChildren.length - 1;
    let newEnd = newChildren.length - 1;
    oldVNode = oldChildren[oldEnd];
    newVNode = newChildren[newEnd];
    while (oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, container);
      oldEnd--;
      newEnd--;
      oldVNode = oldChildren[oldEnd];
      newVNode = newChildren[newEnd];
    }

    // 3.新增节点
    if (j > oldEnd && j <= newEnd) {
      const anchorIndex = newEnd + 1;
      const anchor =
        anchorIndex < newChildren.length ? newChildren[anchorIndex].el : null;
      while (j <= newEnd) {
        patch(null, newChildren[j++], container, anchor);
      }
    }

    // 4.卸载节点
    else if (j > newEnd && j <= oldEnd) {
      while (j <= oldEnd) {
        unmount(oldChildren[j++]);
      }
    }

    // 5.未知序列
    else {
      // 需要移动节点
      // 新的一组节点中未处理的子节点数量
      const toBePatched = newEnd - j + 1;
      // 新节点在老节点中的索引表
      const newIndexToOldIndexMap = new Array(toBePatched).fill(-1);

      const oldStart = j;
      const newStart = j;
      // 标记是否有节点需要移动
      let moved = false;
      let maxNewIndexSoFar = 0;

      // 构建新节点 key 和 index 索引表
      const keyIndex = {};
      for (let i = newStart; i <= newEnd; i++) {
        keyIndex[newChildren[i].key] = i;
      }

      let patched = 0;
      // 遍历老节点中未处理节点，填充 source
      for (let i = oldStart; i <= oldEnd; i++) {
        oldVNode = oldChildren[i];
        if (patched <= toBePatched) {
          const newIndex = keyIndex[oldVNode.key];
          // 老节点在新节点中先打个 patch
          if (newIndex !== undefined) {
            newVNode = newChildren[newIndex];
            patch(oldVNode, newVNode, container);
            patched++;
            newIndexToOldIndexMap[newIndex - newStart] = i;
            if (newIndex < maxNewIndexSoFar) {
              moved = true;
            } else {
              maxNewIndexSoFar = newIndex;
            }
          }
          // 老节点不在心节点中，直接卸载
          else {
            unmount(oldVNode);
          }
        }
        // 新节点全部更新，老节点中还有内容，直接卸载
        else {
          unmount(oldVNode);
        }
      }

      // 如果需要移动 则需要找到最长递增子序列来减少移动次数
      if (moved) {
        const seq = getSequence(newIndexToOldIndexMap);
        // s 指向最长递增子序列的最后一个元素
        let s = seq.length - 1;
        // i 指向新的一组子节点的最后一个元素
        let i = toBePatched - 1;
        for (i; i >= 0; i--) {
          // 如果当前最长递增子序列的最后一个元素不在旧节点中，说明需要新增节点
          if (newIndexToOldIndexMap[i] === -1) {
            // 添加新节点
            const pos = i + newStart;
            const newVNode = newChildren[pos];
            const nextPos = pos + 1;
            const anchor =
              nextPos < newChildren.length ? newChildren[nextPos].el : null;
            patch(null, newVNode, container, anchor);
          }
          // 如果节点的索引不等于 seq[s] 的值，说明需要移动节点
          else if (i !== seq[s]) {
            const pos = i + newStart;
            const newVNode = newChildren[pos];
            // 该节点的下一个节点的位置索引
            const nextPos = pos + 1;
            // 锚点
            const anchor =
              nextPos < newChildren.length ? newChildren[nextPos].el : null;
            // 移动
            insert(newVNode.el, container, anchor);
          }
          // 不需要移动
          else {
            s--;
          }
        }
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
   * @param {VNode} vnode
   * @param {HTMLElement} container
   * @param {HTMLElement} anchor
   */
  const mountComponet = (vnode, container, anchor) => {
    const componentOptions = vnode.type;
    const {
      render,
      data,
      beforeCreate,
      created,
      beforeMount,
      mounted,
      beforeUpdate,
      updated,
    } = componentOptions;

    beforeCreate && beforeCreate();
    const state = reactive(data());

    /**@type {Instance} */
    const instance = {
      state,
      isMounted: false,
      subtree: null,
    };
    vnode.component = instance;
    created && created.call(state);

    effect(
      () => {
        const subTree = render.call(state, state);
        if (!instance.isMounted) {
          beforeMount && beforeMount.call(state);
          patch(null, subTree, container, anchor);
          instance.isMounted = true;
          mounted && mounted.call(state);
        } else {
          beforeUpdate && beforeUpdate.call(state);
          patch(instance.subtree, subTree, container, anchor);
          updated && updated.call(state);
        }
        instance.subtree = subTree;
      },
      {
        scheduler: queueJob,
      }
    );
  };

  const patchComponet = (n1, n2, anchor) => {};

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
    const parent = vnode.el.parentNode;
    if (parent) {
      parent.removeChild(vnode.el);
    }
  };

  return {
    render,
    hydrate,
  };
};
