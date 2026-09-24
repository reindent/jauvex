import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { VoicePhase } from './voice';

/**
 * The voice entity, Jauvex's own: the two strands of the mark, alive. A double helix seen from the side inside a dark
 * glass disc, periwinkle and off-white, turning slowly. Where the mark shows one crossing, this shows it travelling.
 * One three.js quad, all the look is in the fragment shader. The strands swell with the voice level (yours while you
 * talk, the voice's while it talks) and the helix turns faster while the main thread is thinking.
 */
const FRAG = /* glsl */ `
precision highp float;
uniform float uTime; uniform float uLevel; uniform float uEnergy; uniform float uMute; uniform float uSilent; uniform vec2 uRes;
const float W = 0.62;                                     // half length of the strands
// one strand: a = coverage, g = glow, z = depth (-1 behind, +1 in front)
vec3 strand(vec2 uv, float phase, float amp, float width){
  float k = 3.14159265 / (2.0 * W);                       // half a turn across the width: at rest, the mark's single crossing
  float x = clamp(uv.x, -W, W);                           // past the ends the nearest point is the end itself: round caps
  float y = amp * cos(x * k + phase); float slope = -amp * k * sin(x * k + phase);
  float z = sin(x * k + phase);
  float d = length(vec2(uv.x - x, (uv.y - y) / sqrt(1.0 + slope * slope))); // distance to the curve, not just the vertical gap
  float w = width * (0.80 + 0.20 * z);
  return vec3(1.0 - smoothstep(w - 0.012, w + 0.012, d), exp(-d * d / (w * w * 7.0)), z);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) * 2.0;
  float r = length(uv); float R = 0.93;
  float t = uTime * (0.35 + 1.25 * uEnergy);
  float amp = 0.27 + 0.13 * uLevel; float width = 0.064 + 0.030 * uLevel;
  vec3 a = strand(uv, t, amp, width); vec3 b = strand(uv, t + 3.14159265, amp, width);
  vec3 peri = vec3(0.592, 0.616, 1.0), bone = vec3(0.925, 0.918, 0.89);
  // the disc: deep blue glass (the accent, darkened), lighter and bluer at the top, a thin ring that brightens with the voice
  vec3 col = mix(vec3(0.075, 0.085, 0.20), vec3(0.16, 0.18, 0.36), smoothstep(-0.9, 0.9, uv.y));
  col += peri * (0.10 + 0.22 * uLevel) * (a.y + b.y) * 0.55;                       // glow under the strands
  float ring = smoothstep(0.05, 0.0, abs(r - (R - 0.03))); col += peri * ring * (0.16 + 0.55 * uLevel);
  col = mix(col, vec3(dot(col, vec3(0.333))) * 0.70, uMute);                         // microphone muted: the disc, the ears, goes gray; the strands keep their colour
  // back strand first, then the front one over it, with a dark gap where they cross (over and under, like the mark)
  bool aFront = a.z >= b.z;
  vec3 backC = aFront ? bone : peri; vec3 frontC = aFront ? peri : bone; vec3 back = aFront ? b : a; vec3 front = aFront ? a : b;
  backC = mix(backC, vec3(dot(backC, vec3(0.333))) * 0.72, uSilent); frontC = mix(frontC, vec3(dot(frontC, vec3(0.333))) * 0.72, uSilent); // speaker off: the strands, the voice, go gray
  float halo = smoothstep(0.0, 1.0, front.y * 1.35);                                 // the back strand fades out next to the front one
  // shading follows depth alone, so nothing jumps where the two swap places (they are level there, and far apart)
  col = mix(col, backC * (0.70 + 0.28 * back.z), back.x * (1.0 - halo * 0.85));
  col = mix(col, frontC * (0.70 + 0.28 * front.z), front.x);
  float alpha = 1.0 - smoothstep(R - 0.012, R, r);
  gl_FragColor = vec4(col, alpha);
}`;
const VERT = /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const ENERGY: Record<VoicePhase, number> = { off: 0.0, listening: 0.12, hearing: 0.45, transcribing: 0.7, thinking: 1.0, wording: 0.85, speaking: 0.55 };

/** mute: the microphone is off (the disc goes gray). silent: the speaker is off (the strands go gray). dim: both. */
export function Orb({ size, level, phase, dim = false, mute = false, silent = false }: { size: number; level: React.RefObject<number>; phase: VoicePhase; dim?: boolean; mute?: boolean; silent?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ phase, mute: mute || dim, silent: silent || dim }); live.current = { phase, mute: mute || dim, silent: silent || dim };
  useEffect(() => {
    const el = host.current; if (!el) return;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(size, size); renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const uniforms = { uTime: { value: 0 }, uLevel: { value: 0 }, uEnergy: { value: 0.12 }, uMute: { value: 0 }, uSilent: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } };
    renderer.getDrawingBufferSize(uniforms.uRes.value);
    const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false }));
    scene.add(mesh);
    let raf = 0, last = performance.now(), smooth = 0, energy = 0.12, muted = 0, silenced = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const target = Math.min(1, Math.max(0, (level.current ?? 0) * 7)); smooth += (target - smooth) * (target > smooth ? 0.35 : 0.08); // fast attack, slow release
      energy += (ENERGY[live.current.phase] - energy) * 0.04; muted += ((live.current.mute ? 1 : 0) - muted) * 0.1; silenced += ((live.current.silent ? 1 : 0) - silenced) * 0.1;
      uniforms.uTime.value += dt * (1 + energy * 1.5); uniforms.uLevel.value = smooth; uniforms.uEnergy.value = energy; uniforms.uMute.value = muted; uniforms.uSilent.value = silenced;
      renderer.render(scene, camera); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, [size, level]);
  return <div ref={host} className="orb-canvas" style={{ width: size, height: size }} />;
}
