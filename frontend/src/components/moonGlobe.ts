import * as THREE from 'three'
import { MOON_FULL as FULL, MOON_PREVIEW } from '~/components/moonTextures'

// Every globe loads the same few maps. Kept in memory, a second globe (Explore's true-scale scene beside the page's
// Moon) gets them at once instead of fetching and decoding a 4k image again.
THREE.Cache.enabled = true

/**
 * Loads a texture: sRGB for colour maps, linear for data maps; `done` runs once it has arrived, `failed` if it cannot
 * be loaded.
 */
export type TextureLoad = (url: string, srgb?: boolean, done?: () => void, failed?: () => void) => THREE.Texture

/**
 * The Moon's surface, shared by the space scene and the landing page: NASA SVS CGI Moon Kit colour and relief; south
 * of 75°S the shading switches to true-scale LOLA 240 m relief baked as object-space normals (ds/pipeline/globe.py).
 * `capRot` must hold the Moon mesh's world rotation, so the baked normals turn with it.
 *
 * `progressive`: show the small first-look copies first (about a third of the bytes), then swap in each full map as it
 * arrives, so the Moon appears early on a slow connection. `onColour` runs once, with the first colour map shown. If a
 * first-look copy cannot be loaded, the full maps load straight away.
 */
export function moonMaterial(tex: TextureLoad, onColour?: () => void, progressive = false) {
  const capMap: { value: THREE.Texture | null } = { value: null }
  const capRot = { value: new THREE.Matrix3() }
  const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 })
  if (!progressive) {
    capMap.value = tex(FULL.cap, false)
    material.map = tex(FULL.color, true, onColour)
    material.normalMap = tex(FULL.normal, false)
  } else {
    let coloured = false
    const colourIn = () => {
      if (coloured) return
      coloured = true
      onColour?.()
    }
    let upgraded = false
    // The full maps load once the first look is complete, so they never slow it down, and replace it one by one.
    const upgrade = () => {
      if (upgraded) return
      upgraded = true
      const color = tex(FULL.color, true, () => {
        material.map?.dispose()
        material.map = color
        colourIn()
      })
      const normal = tex(FULL.normal, false, () => {
        material.normalMap?.dispose()
        material.normalMap = normal
      })
      const cap = tex(FULL.cap, false, () => {
        capMap.value?.dispose()
        capMap.value = cap
      })
    }
    let pending = 3
    const settle = () => {
      pending -= 1
      if (pending === 0) upgrade()
    }
    material.map = tex(
      MOON_PREVIEW.color,
      true,
      () => {
        colourIn()
        settle()
      },
      upgrade,
    )
    material.normalMap = tex(MOON_PREVIEW.normal, false, settle, upgrade)
    capMap.value = tex(MOON_PREVIEW.cap, false, settle, upgrade)
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.capMap = capMap
    shader.uniforms.capS = { value: Math.cos((75 * Math.PI) / 180) }
    shader.uniforms.capRot = capRot
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = normalize(position);')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vObj;\nuniform sampler2D capMap;\nuniform float capS;\nuniform mat3 capRot;',
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
          float rr = length(vObj.xz);
          float capK = (1.0 - smoothstep(capS - 0.012, capS, rr)) * step(vObj.y, 0.0);
          if (capK > 0.0) {
            vec3 cn = texture2D(capMap, vObj.xz / capS * 0.5 + 0.5).xyz * 2.0 - 1.0;
            normal = normalize(mix(normal, normalize((viewMatrix * vec4(capRot * cn, 0.0)).xyz), capK));
          }`,
      )
  }
  return { material, capRot }
}

/**
 * A soft glow outside a limb, from the height of each view ray's closest approach above the surface. `strength` scales
 * it, for crossfading two glows.
 */
export function halo(
  r: number,
  thick: number,
  color: [number, number, number],
  gain: number,
  k: number,
  sunDir: { value: THREE.Vector3 },
  strength: { value: number } = { value: 1 },
) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(r * (1 + thick), 128, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: { sunDir, strength },
      vertexShader: `varying vec3 vW; varying vec3 vC;
        void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vC = (modelMatrix*vec4(0.,0.,0.,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 sunDir; uniform float strength; varying vec3 vW; varying vec3 vC;
        void main(){
          vec3 d = normalize(vW - cameraPosition); vec3 p = cameraPosition + d * dot(vC - cameraPosition, d);
          float h = (length(p - vC) / ${r.toFixed(4)} - 1.0) / ${thick.toFixed(4)}; if (h < 0.0) discard;
          float lit = smoothstep(-0.25, 0.6, dot(normalize(p - vC), sunDir));
          gl_FragColor = vec4(vec3(${color.join(',')}) * exp(-h * ${k.toFixed(1)}) * (1.0 - h) * lit * ${gain.toFixed(2)} * strength, 1.0); }`,
    }),
  )
}

/** ME frame lat/lon (deg, °E) to the Moon's body axes: lon 0 at +x, north at +y, east toward -z. */
export function toVec(lat: number, lon: number, r = 1) {
  const la = (lat * Math.PI) / 180
  const lo = (lon * Math.PI) / 180
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).multiplyScalar(r)
}
