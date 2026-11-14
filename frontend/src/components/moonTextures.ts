/**
 * Where the Moon's globe textures live. No three.js here, so a page can preload them without pulling the 3D code into
 * its first bundle.
 */
export const MOON_FULL = { color: '/moon/color-4k.jpg', normal: '/moon/normal-2k.jpg', cap: '/moon/cap-normal-2k.jpg' }

/** Small first-look copies of the maps above (frontend/scripts/moon-previews.py, public/moon/previews.json). */
export const MOON_PREVIEW = {
  color: '/moon/preview/color-2k.jpg',
  normal: '/moon/preview/normal-1k.jpg',
  cap: '/moon/preview/cap-normal-512.jpg',
}
