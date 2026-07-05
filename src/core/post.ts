import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * Post-processing stack: bloom + a single grade pass doing color grading,
 * vignette, and film grain. One composer serves whichever scene/camera the
 * main loop points it at.
 */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    saturation: { value: 1.18 },
    contrast: { value: 1.08 },
    warmth: { value: 0.035 },
    vignette: { value: 0.42 },
    grain: { value: 0.028 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, saturation, contrast, warmth, vignette, grain;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + time * 43.0) * 43758.5453);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // contrast around mid grey
      c = (c - 0.5) * contrast + 0.5;
      // warm sun-bleached tint
      c.r += warmth; c.b -= warmth * 0.6;
      // cinematic split-tone: teal shadows, golden highlights
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      float shadowW = 1.0 - smoothstep(0.0, 0.45, lum);
      float highW = smoothstep(0.55, 1.0, lum);
      c += vec3(-0.03, 0.015, 0.035) * shadowW;   // shadows toward teal
      c += vec3(0.045, 0.025, -0.02) * highW;     // highlights toward gold
      // saturation
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation);
      // vignette
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * dot(d, d) * 2.4;
      // grain
      c += (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export interface PostStack {
  render(scene: THREE.Scene, camera: THREE.Camera, dt: number): void;
  setSize(w: number, h: number): void;
  composer: EffectComposer;
}

export function createPostStack(renderer: THREE.WebGLRenderer): PostStack {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(size.clone(), 0.38, 0.65, 0.82);
  composer.addPass(bloom);
  // tone mapping + linear->sRGB conversion, then grade in display space
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  let t = 0;
  return {
    composer,
    render(scene, camera, dt) {
      t += dt;
      renderPass.scene = scene;
      renderPass.camera = camera;
      grade.uniforms.time.value = t % 100;
      composer.render();
    },
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
  };
}
