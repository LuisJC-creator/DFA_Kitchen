// Thin wrappers over the DOM APIs this app reaches for constantly.

/** First element matching `selector`, or null. */
export const $ = selector => document.querySelector(selector);

/** Every element matching `selector`, as a real array. */
export const $$ = selector => [...document.querySelectorAll(selector)];

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Builds an SVG element with the given attributes and optional text content. */
export function svgElement(name, attributes = {}, text) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, value);
  }
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Builds an HTML element and assigns the given properties (textContent, value, ...). */
export function htmlElement(name, properties = {}) {
  return Object.assign(document.createElement(name), properties);
}

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

/** Renders a state number with subscript digits, so state 12 reads as q₁₂. */
export const subscript = value =>
  String(value).replace(/\d/g, digit => SUBSCRIPT_DIGITS[Number(digit)]);
