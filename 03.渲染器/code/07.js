import { isObject, isString, normalizeClass } from "../../shared";

const DOM_API = {
  createElement(tag) {
    console.log(`createElement ${tag}`);
    return document.createElement(tag);
  },
  setElementText(container, text) {
    console.log(`setElementText ${text}`);
    container.textContent = text;
  },
  insert(child, parent, anchor = null) {
    console.log(`insert ${child} ${parent} ${anchor}`);
    parent.children = child;
  },

  patchProps(el, key, prevValue, nextValue) {
    const shouldSetAsProps = (el, key, value) => {
      if (key === "form" && el.tagName === "INPUT") return false;
      return key in el;
    };

    if (key === "class") {
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
    const { type } = n2;
    switch (type) {
      case isString(type): {
        // 如果旧节点不存在，就意味着挂载
        if (!n1) {
          mountElement(n2, container);
        } else {
          // 更新
          patchElement(n1, n2);
        }
      }
      case isObject(type): {
        // 组件
      }
    }
  };

  const mountElement = (vnode, container) => {
    const el = (vnode.el = createElement(vnode.type));

    // 处理children
    if (typeof vnode.children === "string") {
      setElementText(el, vnode.children);
    } else if (Array.isArray(vnode.children)) {
      vnode.children.forEach((child) => {
        patch(null, vnode, el);
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

const vnode = {
  type: "div",
  props: {
    id: "foo",
    class: normalizeClass([
      "foo bar",
      {
        baz: true,
        zsh: false,
      },
    ]),
  },
  children: [
    {
      type: "p",
      children: "12323",
    },
  ],
};

const container = { type: "root" };

const renderer = createRenderer(DOM_API);
renderer.render(vnode, container);
