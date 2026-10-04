import type { FocusEvent } from "react";

/** Keep keyboard focus above the measured dock after native focus scrolling. */
export function keepFocusAboveDock(event: FocusEvent<HTMLElement>) {
  const main = event.currentTarget;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches(":focus-visible")) return;
  const view = main.ownerDocument.defaultView;
  if (!view) return;

  view.requestAnimationFrame(() => {
    // Focus can move again, or navigation can replace this screen, before the
    // frame runs. Pointer focus must never move a button during its click.
    if (
      !main.isConnected ||
      !target.isConnected ||
      main.ownerDocument.activeElement !== target ||
      !main.contains(target) ||
      !target.matches(":focus-visible")
    )
      return;

    const dock = main.parentElement?.querySelector<HTMLElement>(".journey-dock");
    if (!dock || view.getComputedStyle(dock).position !== "sticky") return;
    const controlRect = target.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const dockTop = Math.max(0, dockRect.top);
    const dockBottom = Math.min(view.innerHeight, dockRect.bottom);
    const ringGap = 8;
    if (
      dockBottom <= dockTop ||
      controlRect.right <= dockRect.left ||
      controlRect.left >= dockRect.right ||
      controlRect.top >= dockBottom ||
      controlRect.bottom + ringGap <= dockTop
    )
      return;

    // Measure the actual overlap, including space for the focus outline. If a
    // control is too tall to fit, limit further upward motion so a currently
    // visible start is not moved above the viewport.
    const distance = Math.min(
      controlRect.bottom - dockTop + ringGap,
      Math.max(0, controlRect.top - ringGap),
    );
    if (distance > 0) view.scrollBy({ top: distance, behavior: "instant" });
  });
}
