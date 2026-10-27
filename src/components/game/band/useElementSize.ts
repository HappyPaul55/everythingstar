import { useLayoutEffect, useRef, useState } from "react";

export interface Size {
  width: number;
  height: number;
}

/**
 * Observe an element's size.
 *
 * Uses a layout effect so the first measurement lands before paint (no flash),
 * and a ResizeObserver for every change after that. The returned `ref` goes on
 * the element being measured.
 *
 * With `contentBox`, the element's padding is taken off the answer, so the size is
 * the space its **children** have rather than the border box. The stage asks for
 * that: its padding is the play area's gutter plus the device's own safe-area insets
 * (a notch, a status bar, the home indicator), and the layout must be computed on
 * what is left inside it, or a layout that reserves the padding twice overflows by
 * exactly the inset.
 */
export function useElementSize<T extends HTMLElement>(contentBox = false) {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      let width = rect.width;
      let height = rect.height;
      if (contentBox) {
        const style = getComputedStyle(element);
        const px = (value: string) => Number.parseFloat(value) || 0;
        width -= px(style.paddingLeft) + px(style.paddingRight);
        height -= px(style.paddingTop) + px(style.paddingBottom);
      }
      width = Math.max(0, width);
      height = Math.max(0, height);
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [contentBox]);

  return { ref, size } as const;
}
