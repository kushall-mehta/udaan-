"use client";

import { useEffect, useRef } from "react";

const useScrollFlight = () => {
  const artRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const art = artRef.current;
    if (!art) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      const hero = art.closest(".flight-hero");
      const height = hero?.getBoundingClientRect().height || 408;
      const progress = reducedMotion.matches
        ? 0
        : Math.min(1, Math.max(0, window.scrollY / height));

      art.style.setProperty("--plane-x", `${progress * 300}px`);
      art.style.setProperty("--plane-y", `${progress * -210}px`);
      art.style.setProperty("--plane-bank", `${progress * -18}deg`);
      art.style.setProperty("--plane-scale", `${1 - progress * 0.12}`);
      art.style.setProperty("--flight-progress", String(progress));
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    reducedMotion.addEventListener("change", scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      reducedMotion.removeEventListener("change", scheduleUpdate);
    };
  }, []);

  return artRef;
};

export default useScrollFlight;
