// Tiny DOM helpers shared by the viewer.
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function button(text, className) {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}
