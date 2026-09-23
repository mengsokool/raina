import "@testing-library/jest-dom/vitest";

// Polyfill ResizeObserver for React Flow
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill structuredClone if not present
if (typeof global.structuredClone === "undefined") {
  global.structuredClone = (val: any) => JSON.parse(JSON.stringify(val));
}

// Polyfill pointer methods for Radix UI in jsdom
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
