import '@testing-library/jest-dom';

// jsdom polyfill: IntersectionObserver no esta implementado en jsdom
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

// jsdom polyfill: TextEncoder/TextDecoder (necesario para jspdf/fast-png/iobuffer)
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
