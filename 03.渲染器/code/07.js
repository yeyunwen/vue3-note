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
};

const createRenderer = (options) => {
  const { createElement, setElementText, insert } = options;

  const hydrate = () => {};
  const render = (vnode, container) => {
    if (vnode) {
      patch(container._vnode, vnode, container);
    } else {
      // 新节点不存在 && 旧节点存在 指向卸载
      if (container._vnode) {
        container.innerHTML = "";
      }
    }
    container._vnode = vnode;
  };
  /**
   *
   * @param {*} n1 旧节点
   * @param {*} n2 新节点
   * @param {*} container 容器
   */
  const patch = (n1, n2, container) => {
    // 如果旧节点不存在，就意味着挂载
    if (!n1) {
      mountElement(n2, container);
    } else {
    }
  };

  const mountElement = (vnode, container) => {
    const el = createElement(vnode.type);
    if (typeof vnode.children === "string") {
      setElementText(el, vnode.children);
    }
    insert(el, container);
  };

  return {
    render,
    hydrate,
  };
};

const vnode = {
  type: "h1",
  children: "hello",
};
const container = { type: "root" };

const renderer = createRenderer(DOM_API);
renderer.render(vnode, container);
