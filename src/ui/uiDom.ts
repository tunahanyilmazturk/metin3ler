export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export function setText(el: HTMLElement, text: string) {
  if ((el as any)._t !== text) { (el as any)._t = text; el.textContent = text; }
}
export function setWidth(el: HTMLElement, frac: number) {
  const w = `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%`;
  if ((el as any)._w !== w) { (el as any)._w = w; el.style.width = w; }
}
