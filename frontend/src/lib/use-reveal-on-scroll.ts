import { useEffect, type RefObject } from 'react';

/**
 * Holds the entrance animation of every `[data-reveal]` element inside `root`
 * until it scrolls into view (the pause itself is in motion.css). Elements
 * rendered later — a list that appears when its query resolves — are picked up
 * as they mount.
 *
 * `data-reveal="stagger"` gives each element revealed in the same frame an
 * `--i` in the order it entered, so a screenful of rows steps in one after
 * another but a row scrolled to on its own does not wait behind the ones
 * before it.
 */
export function useRevealOnScroll(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = root.current;
    if (!container) return;

    const reveal = (element: Element, order: number) => {
      if (element instanceof HTMLElement && element.dataset.reveal === 'stagger') {
        element.style.setProperty('--i', String(order));
      }
      element.setAttribute('data-revealed', '');
    };

    const pending = () => container.querySelectorAll('[data-reveal]:not([data-revealed])');

    if (!('IntersectionObserver' in window)) {
      const showAll = () => pending().forEach((element) => reveal(element, 0));
      showAll();
      const mutations = new MutationObserver(showAll);
      mutations.observe(container, { childList: true, subtree: true });
      return () => mutations.disconnect();
    }

    const intersections = new IntersectionObserver(
      (entries) => {
        let order = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target, order++);
          intersections.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );

    const watch = () => pending().forEach((element) => intersections.observe(element));
    watch();
    const mutations = new MutationObserver(watch);
    mutations.observe(container, { childList: true, subtree: true });

    return () => {
      intersections.disconnect();
      mutations.disconnect();
    };
  }, [root]);
}
