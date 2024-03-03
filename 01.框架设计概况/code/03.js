function renderer(vnode, container) {
  const { tag, props, children } = vnode;

  const el = document.createElement(tag);

  for (const prop in props) {
    if (prop.startsWith("on")) {
      el.addEventListener(prop.slice(2).toLowerCase(), props[prop]);
    }
  }

  if (typeof children === "string") {
    el.appendChild(document.createTextNode(children));
  } else if (Array.isArray(children)) {
    children.forEach((child) => renderer(child, el));
  }

  container.appendChild(el);
}

const vnode = {
  tag: "div",
  props: {
    onClick: () => alert("Hello 渲染器"),
  },
  children: "click me",
};

renderer(vnode, document.body);
