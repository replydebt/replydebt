// 24px solid glyph icons and SVG marks built exclusively via createElementNS (zero innerHTML).
import { BRAND_COLOR } from '../config.js';

const P = {
  home: 'M23 9v2h-2v7a3 3 0 01-3 3h-4v-6h-4v6H6a3 3 0 01-3-3v-7H1V9l11-7z',
  briefcase: 'M17 6V5a3 3 0 00-3-3h-4a3 3 0 00-3 3v1H2v4a3 3 0 003 3h14a3 3 0 003-3V6zM9 5a1 1 0 011-1h4a1 1 0 011 1v1H9zm10 9a4 4 0 003-1.38V17a3 3 0 01-3 3H5a3 3 0 01-3-3v-4.38A4 4 0 005 14z',
  message: 'M16 4H8a7 7 0 000 14h4v4l8.16-5.39A6.78 6.78 0 0023 11a7 7 0 00-7-7zm-8 8.25A1.25 1.25 0 119.25 11 1.25 1.25 0 018 12.25zm4 0A1.25 1.25 0 1113.25 11 1.25 1.25 0 0112 12.25zm4 0A1.25 1.25 0 1117.25 11 1.25 1.25 0 0116 12.25z',
  people: 'M12 16v6H3v-6a3 3 0 013-3h3a3 3 0 013 3zm5.5-3A3.5 3.5 0 1014 9.5a3.5 3.5 0 003.5 3.5zm1 2h-2a2.5 2.5 0 00-2.5 2.5V22h7v-4.5a2.5 2.5 0 00-2.5-2.5zM7.5 2A4.5 4.5 0 1012 6.5 4.49 4.49 0 007.5 2z',
  building: 'M4 2v20h7v-4h2v4h7V2zm5 15H7v-2h2zm0-4H7v-2h2zm0-4H7V7h2zm4 4h-2v-2h2zm0-4h-2V7h2zm4 8h-2v-2h2zm0-4h-2v-2h2zm0-4h-2V7h2z',
  search: 'M21.41 18.59l-5.27-5.28A6.83 6.83 0 0017 10a7 7 0 10-7 7 6.85 6.85 0 003.31-.86l5.28 5.27a2 2 0 002.82-2.82zM5 10a5 5 0 115 5 5 5 0 01-5-5z',
  caretDown: 'M12 15.5L6 9h12z',
  close: 'M13.42 12L20 18.58 18.58 20 12 13.42 5.42 20 4 18.58 10.58 12 4 5.42 5.42 4 12 10.58 18.58 4 20 5.42z',
  chevronDown: 'M12 16.4L4.3 8.7l1.4-1.4 6.3 6.3 6.3-6.3 1.4 1.4z',
  chevronUp: 'M12 7.6l7.7 7.7-1.4 1.4-6.3-6.3-6.3 6.3-1.4-1.4z',
  chevronRight: 'M16.4 12l-7.7 7.7-1.4-1.4 6.3-6.3-6.3-6.3 1.4-1.4z',
  more: 'M14 12a2 2 0 11-2-2 2 2 0 012 2zM4 10a2 2 0 102 2 2 2 0 00-2-2zm16 0a2 2 0 102 2 2 2 0 00-2-2z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  checkCircle: 'M12 2a10 10 0 1010 10A10 10 0 0012 2zm-1.5 14.5L6 12l1.4-1.4 3.1 3.1 6.1-6.1L18 9z',
  lock: 'M18 10V7A6 6 0 006 7v3H4v12h16V10zM8 7a4 4 0 018 0v3H8zm5 9.73V19h-2v-2.27a2 2 0 112 0z',
  upload: 'M19 17v3H5v-3H3v5h18v-5zM11 6.83V16h2V6.83l3.59 3.58L18 9l-6-6-6 6 1.41 1.41z',
  download: 'M19 17v3H5v-3H3v5h18v-5zm-6-2.83V3h-2v11.17l-3.59-3.58L6 12l6 6 6-6-1.41-1.41z',
  folder: 'M10 4H2v16h20V6H12z',
  folderEye: 'M10 4H2v16h20V6H12zm2 13c-3 0-5-3-5-3s2-3 5-3 5 3 5 3-2 3-5 3zm0-4.5a1.5 1.5 0 101.5 1.5 1.5 1.5 0 00-1.5-1.5z',
  bell: 'M22 19h-8.28a2 2 0 11-3.44 0H2v-1a4.52 4.52 0 011.17-2.83l1-1.17h15.7l1 1.17A4.42 4.42 0 0122 18zM18.21 7.44A6.27 6.27 0 0012 2a6.27 6.27 0 00-6.21 5.44L5 13h14z',
  calendar: 'M19 3h-2V1h-2v2H9V1H7v2H5a3 3 0 00-3 3v13a3 3 0 003 3h14a3 3 0 003-3V6a3 3 0 00-3-3zm1 16a1 1 0 01-1 1H5a1 1 0 01-1-1V9h16zM6 11h4v4H6z',
  external: 'M15 1v2h4.59l-8.3 8.29 1.42 1.42L21 4.41V9h2V1zM19 21H3V5h8V3H1v20h20V13h-2z',
  copy: 'M16 1H5a2 2 0 00-2 2v14h2V3h11zm3 4H9a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H9V7h10z',
  info: 'M12 2a10 10 0 1010 10A10 10 0 0012 2zm1 15h-2v-6h2zm0-8h-2V7h2z',
  arrowRight: 'M12.55 3l-1.41 1.41L17.73 11H2v2h15.73l-6.59 6.59L12.55 21l9-9z',
  eyeOff: 'M2.7 3.3L1.3 4.7l3.1 3.1A13.4 13.4 0 001 12s4 7 11 7a10.6 10.6 0 004.6-1l2.7 2.7 1.4-1.4zM12 16a4 4 0 01-4-4 3.9 3.9 0 01.4-1.8l5.4 5.4A3.9 3.9 0 0112 16zm0-11a10.6 10.6 0 00-3.4.6l2 2A4 4 0 0116 12a3.4 3.4 0 01-.1.9l3.3 3.3A13.2 13.2 0 0023 12s-4-7-11-7z',
  moon: 'M20.1 15.5A8.5 8.5 0 018.5 3.9a8.5 8.5 0 1011.6 11.6z',
  sun: 'M12 7a5 5 0 105 5 5 5 0 00-5-5zm-1-6h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1l1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z',
  trash: 'M15 2H9a1 1 0 00-1 1v1H4v2h16V4h-4V3a1 1 0 00-1-1zM5 8l1 13a1 1 0 001 1h10a1 1 0 001-1l1-13z',
  help: 'M12 2a10 10 0 1010 10A10 10 0 0012 2zm1 16h-2v-2h2zm1.6-6.6l-.9.9A2.5 2.5 0 0013 14h-2v-.5a3.5 3.5 0 011-2.5l1.2-1.2a1.5 1.5 0 10-2.6-1H8.7a3.5 3.5 0 117 .7 3 3 0 01-1.1 1.9z',
  send: 'M21 3L0 10l7.66 4.26L16 8l-6.26 8.34L14 24l7-21z',
  share: 'M23 12l-9-8v5C7 9 3 13 2 20c2.5-3.5 6-5.1 12-5.1V20z',
  clock: 'M12 2a10 10 0 1010 10A10 10 0 0012 2zm4.5 14.5L11 13V6h2v5.9l4.5 2.8z',
  user: 'M12 12a5 5 0 10-5-5 5 5 0 005 5zm0 2c-4.4 0-8 2.7-8 6v2h16v-2c0-3.3-3.6-6-8-6z',
  laptop: 'M20 16V5a2 2 0 00-2-2H6a2 2 0 00-2 2v11H1v2a2 2 0 002 2h18a2 2 0 002-2v-2zM6 5h12v11H6z',
  link: 'M10.6 13.4a1 1 0 001.4 1.4l4.6-4.6a3.5 3.5 0 00-5-5L9.2 7.6l1.4 1.4 2.4-2.4a1.5 1.5 0 012.2 2.2zm2.8-2.8a1 1 0 00-1.4-1.4l-4.6 4.6a3.5 3.5 0 005 5l2.4-2.4-1.4-1.4-2.4 2.4a1.5 1.5 0 01-2.2-2.2z',
  shield: 'M12 1L3 5v6c0 5.6 3.8 10.7 9 12 5.2-1.3 9-6.4 9-12V5zm-1.5 15.5L6 12l1.4-1.4 3.1 3.1 6.1-6.1L18 9z',
  chart: 'M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8zM3 20h18v2H3z',
};

export const ICON_NAMES = Object.freeze(Object.keys(P));

const NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child) el.appendChild(child);
  }
  return el;
}

export function icon(name, size = 24, extraClass = '') {
  return svgEl(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      'aria-hidden': 'true',
      focusable: 'false',
      class: `icon ${extraClass}`.trim(),
    },
    svgEl('path', { d: P[name] || P.info, fill: 'currentColor' }),
  );
}

export function logo(size = 34) {
  const wrap = document.createElement('span');
  wrap.className = 'logo-mark';
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;
  const svg = svgEl(
    'svg',
    { viewBox: '0 0 34 34', width: size, height: size, 'aria-hidden': 'true' },
    svgEl('rect', { width: 34, height: 34, rx: 5, fill: BRAND_COLOR }),
    svgEl('path', { d: 'M11 22.5L17 11.5L23 22.5Z', fill: 'none', stroke: '#fff', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
    svgEl(
      'g',
      { fill: '#fff' },
      svgEl('circle', { cx: 17, cy: 11.5, r: 3.6 }),
      svgEl('circle', { cx: 11, cy: 22.5, r: 3.6 }),
      svgEl('circle', { cx: 23, cy: 22.5, r: 3.6 }),
    ),
  );
  wrap.appendChild(svg);
  return wrap;
}

/** Default person avatar placeholder. */
export function ghostAvatar(size = 48) {
  return svgEl(
    'svg',
    { viewBox: '0 0 48 48', width: size, height: size, 'aria-hidden': 'true', class: 'ghost' },
    svgEl('rect', { width: 48, height: 48, class: 'ghost__bg' }),
    svgEl('circle', { cx: 24, cy: 19, r: 8.5, class: 'ghost__fg' }),
    svgEl('path', { d: 'M7 48c0-10 7.6-16.5 17-16.5S41 38 41 48z', class: 'ghost__fg' }),
  );
}

/** Default company logo placeholder. */
export function ghostCompany(size = 48) {
  return svgEl(
    'svg',
    { viewBox: '0 0 48 48', width: size, height: size, 'aria-hidden': 'true', class: 'ghost-co' },
    svgEl('rect', { width: 48, height: 48, class: 'ghost__bg' }),
    svgEl('path', {
      class: 'ghost__fg',
      d: 'M14 12h14v26h-4v-6h-6v6h-4zm4 4v3h2v-3zm4 0v3h2v-3zm-4 6v3h2v-3zm4 0v3h2v-3zm8 2h6v14h-6z',
    }),
  );
}
