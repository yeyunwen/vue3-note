// @ts-check
import {
  isArray,
  isObject,
  isString,
  isNumber,
  isFunction,
} from "../../shared/src/general.js";
import { Text, Comment, Fragment } from "./vnode.js";
import {
  effect,
  reactive,
  shallowReactive,
  shallowReadonly,
} from "../../../packages/reactivity/src/effect.js";
import { queueJob } from "./scheduler.js";

/**
 * @typedef {{
 * state: any,
 * isMounted: boolean,
 * subtree: VNode | null,
 * props: Record<string | symbol, any>,
 * mounted: (() => void)[]
 * }} Instance
 *
 * @typedef {{
 * type: string | object,
 * props: Record<string, any> | null,
 * children: string | VNode[]| null,
 * el: HTMLElement,
 * key: string | number | null,
 * component: Instance,
 * setup: () => Function | Record<any, any>
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

let currentInstance = null;
const setCurrentInstance = (instance) => (currentInstance = instance);

export const onMounted = (fn) => {
  if (currentInstance) {
    currentInstance.mounted.push(fn);
  } else {
    console.error("onMounted 当前没有实例");
  }
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
            mountComponent(n2, container, anchor);
          } else {
            patchComponent(n1, n2, anchor);
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
  const mountComponent = (vnode, container, anchor) => {
    const componentOptions = vnode.type;
    const {
      data,
      props: propsOptions,
      setup,
      beforeCreate,
      created,
      beforeMount,
      mounted,
      beforeUpdate,
      updated,
    } = componentOptions;
    let render = componentOptions.render;

    beforeCreate && beforeCreate();
    const state = data ? reactive(data()) : null;
    const [props, attrs] = resolveProps(propsOptions, vnode.props);

    /**@type {Instance} */
    const instance = {
      state,
      props: shallowReactive(props),
      isMounted: false,
      subtree: null,
      mounted: [],
    };
    /**
     *
     * @param {string} event
     * @param  {...any} playload
     */
    const emit = (event, ...playload) => {
      const eventName = `on${event[0].toUpperCase() + event.slice(1)}`;
      const handler = props[eventName];
      if (handler) {
        handler(...playload);
      }
    };

    const setupContext = { attrs, emit };
    setCurrentInstance(instance);
    const setupResult = setup(shallowReadonly(instance.props), setupContext);
    setCurrentInstance(null);
    let setupState = null;
    if (isFunction(setupResult)) {
      render = setupResult;
    } else {
      setupState = setupResult;
    }
    vnode.component = instance;
    const renderContext = new Proxy(instance, {
      get(target, key, receiver) {
        const { state, props } = target;
        if (state && key in state) {
          return state[key];
        } else if (props && key in props) {
          return props[key];
        } else if (setupState && key in setupState) {
          return setupState[key];
        } else {
          console.error("不存在");
        }
      },
      set(target, key, newValue, reactive) {
        const { state, props } = target;
        if (state && key in state) {
          return (state[key] = newValue);
        } else if (props && key in props) {
          return (props[key] = newValue);
        } else if (setupState && key in setupState) {
          return (setupState[key] = newValue);
        } else {
          console.error("不存在");
        }
      },
    });
    created && created.call(renderContext);

    /**
     * 将组件属性和虚拟节点属性合并为 props 和 attrs 对象
     * 如果 vnodeProps 中的属性在 compProps 中存在，则将其值赋予 props 对象中的同名属性
     * 如果 vnodeProps 中的属性在 compProps 中不存在，则将其值赋予 attrs 对象中的同名属性
     * 返回一个包含 props 和 attrs 对象的数组
     * @param {Object} compProps - 组件属性对象
     * @param {Object} vnodeProps - 虚拟节点属性对象
     * @return {Array} - 一个包含 props 和 attrs 对象的数组
     */

    effect(
      () => {
        const subTree = render.call(renderContext);
        if (!instance.isMounted) {
          beforeMount && beforeMount.call(renderContext);
          patch(null, subTree, container, anchor);
          instance.isMounted = true;
          mounted && mounted.call(renderContext);
          instance.mounted.forEach((fn) => fn.call(renderContext));
        } else {
          beforeUpdate && beforeUpdate.call(renderContext);
          patch(instance.subtree, subTree, container, anchor);
          updated && updated.call(renderContext);
        }
        instance.subtree = subTree;
      },
      {
        scheduler: queueJob,
      }
    );
  };

  /**
   *
   * @param {VNode} n1
   * @param {VNode} n2
   * @param {HTMLElement | null} anchor
   */
  const patchComponent = (n1, n2, anchor) => {
    const instance = (n2.component = n1.component);
    const { props } = instance;
    if (hasPropsChanged(n1.props, n2.props)) {
      const [nextProps] = resolveProps(n2.type.props, n2.props);
      // 更新 props
      for (const k in nextProps) {
        props[k] = nextProps[k];
      }
      // 删除不存在的 props
      for (const k in props) {
        if (!(k in nextProps)) delete props[k];
      }
    }
  };
  const resolveProps = (compProps, vnodeProps) => {
    const props = {};
    const attrs = {};
    for (const key in vnodeProps) {
      if (key in compProps || key.startsWith("on")) {
        props[key] = vnodeProps[key];
      } else {
        attrs[key] = vnodeProps[key];
      }
    }
    return [props, attrs];
  };

  /**
   * 检查对象的属性是否发生了变化
   * 通过遍历旧属性对象和新属性对象来实现
   * 只要有一个属性值在新旧对象之间不匹配，就返回 true，表示属性发生了变化
   * 最后，如果两个遍历都结束了且没有发现变化，则返回 false
   *
   * @param {Object} oldProps - 旧的属性对象
   * @param {Object} newProps - 新的属性对象
   * @return {boolean} - 属性是否发生变化的指示
   */
  const hasPropsChanged = (oldProps, newProps) => {
    const newKeys = Object.keys(newProps);
    if (newKeys.length !== Object.keys(oldProps).length) {
      return true;
    }
    for (const key of newKeys) {
      if (oldProps[key] !== newProps[key]) {
        return true;
      }
    }
    return false;
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
