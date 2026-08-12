import React from "react";

/* =============================================================================
   BRAND — single source of truth for the crest and the icon set.
   To swap the logo later, replace ONLY the markup inside <Crest/>.
   No emoji anywhere in the app: every glyph comes from <Icon name=…/>.
   ============================================================================= */

/* --- icon registry: inner SVG markup on a 0 0 24 24 grid, 1.9px stroke --- */
const ICONS = {
  rivers: '<path d="M2 17c2.6-3.4 5.2 1.7 7.8-1.7s5.2 1.7 7.8-1.7 3.5.6 4.4.6"/><path d="M2 10.5c2.6-3.4 5.2 1.7 7.8-1.7"/>',
  news: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M6 9h6M6 12.5h9M6 16h5"/>',
  notes: '<path d="M5.5 3.5h9l4.5 4.5v12h-13.5z"/><path d="M14.5 3.5v4.5H19"/><path d="M8.5 12.5h7M8.5 16h5"/>',
  fly: '<path d="M17 4.5c-4 .6-7.5 3.4-9 7"/><path d="M17 4.5c.7 3.9-1.2 7.6-4.6 9.3"/><path d="M8 11.5 4.5 15a3 3 0 0 0 4.2 4.2L12 15.8"/><path d="M12.4 13.8 8 11.5"/>',
  drive: '<path d="M6 20V8.5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3V20"/><path d="M4.5 20h15"/><circle cx="9" cy="16" r="1.3"/><circle cx="15" cy="16" r="1.3"/><path d="M6 11.5h12"/>',
  walk: '<path d="M13 3.8a1.6 1.6 0 1 0 0 .1"/><path d="M11 21l1.6-5.4-2.6-2.2.9-4.4 3.1 1.6 2.4 2.6"/><path d="M10.9 9l-3.4 1.5-1.2 3.2"/><path d="M12.6 15.6 16 21"/>',
  pin: '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  save: '<path d="m12 3.6 2.6 5.5 6 .9-4.3 4.3 1 6.1-5.3-2.9-5.3 2.9 1-6.1L3.4 10l6-.9z"/>',
  alert: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2.2 6.4-2.2 6.4h16.4S18 14 18 9z"/><path d="M10.3 19a2 2 0 0 0 3.4 0"/>',
  radius: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  account: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  method: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 18.5V5.5"/><path d="M8 8h7M8 11.5h5"/>',
  map: '<path d="M9 3.5 3.5 6v14.5L9 18l6 2.5 5.5-2.5V3.5L15 6z"/><path d="M9 3.5V18M15 6v14.5"/>',
  list: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  like: '<path d="M12 20.5s-7-4.4-7-9.6A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7 3.2c0 5.2-7 9.6-7 9.6z"/>',
  comment: '<path d="M4.5 5.5h15v11h-9l-4 3.2z"/>',
  check: '<path d="m4 12.5 5 5 11-11"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 5v6h-6"/>',
  widen: '<path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
};
export const ICON_NAMES = Object.keys(ICONS);
export function iconPath(name) { return ICONS[name] || ""; }

export function Icon({ name, size = 22, stroke = 1.9, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}
      aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconPath(name) }} />
  );
}

/* --- the crest: realistic salmonid anatomy. Swap this markup to rebrand. --- */
export function Crest({ size = 40 }) {
  // The brand crest is now a raster logo. Rendered as a square PNG with a
  // transparent background so it sits cleanly on any surface; swap the file at
  // icons/crest.png to change it everywhere.
  return (
    <img
      src="icons/crest.png"
      width={size}
      height={size}
      alt="Muddy York crest"
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
