import reglInstance from './regl-instance';

import vec3 from 'gl-vec3';

import {
    random,
    pluckRandom,
    normedColor,
    normedColorStr
} from './utils';

import sphere from './models/sphere';
import {createCamera} from './models/camera';

import objectList from './dtos/objectList';

import vertShader from './shaders/vert.glsl';
import raytraceShader from './shaders/raytracer.glsl.js';

import 'normalize.css/normalize.css';
import './styles/index.scss';

async function app() {
    const canvas = document.getElementById('regl-canvas');
    const regl = await reglInstance({canvas});

    const camera = createCamera({
        lookFrom: [0.03, 0.9, 2.5],
        lookAt: [-0.2, 0.3, -1.5],
        vUp: [0, 1, 0],
        vfov: 30,
        aperture: 0.1,
        aspect: 2.0
    });

    const objects = new objectList([
        new sphere({
            id: 0,
            center: [0., -301, -5.],
            radius: 300.5,
            material: 'LambertMaterial',
            color: `
                float s = sin(10.*p.x)*sin(10.*p.y)*sin(10.*p.z);

                if(s < 0.) {
                    return vec3(${normedColorStr('#661111')});
                    //return vec3(${normedColorStr('#154535')});
                } else {
                    return vec3(${normedColorStr('#101010')});
                }
            `
        }),
        new sphere({
            center: [-0.2, 0.5, -1.7], // sphere center
            radius: 0.5,
            material: 'FuzzyMetalMaterial',
            color: '#ffffff'
        }),
        new sphere({
            center:[-1.5, 0.1, -1.25],
            radius: 0.5,
            material: 'GlassMaterial',
            color: '#ffffff'
        }),
        new sphere({
            center:[-0.35, -0.27, -1.], // '-0.27 + abs(sin(uTime*3.))*0.4'
            radius: 0.25,
            material: 'ShinyMetalMaterial',
            color: '#eeeeee'
        }),
        new sphere({
            center:[0.8, 0., -1.3],
            radius: 0.5,
            material: 'LambertMaterial',
            color: '#eeeeee'
        }),
        new sphere({
            center:[5.8, 5., -1.3],
            radius: 2.5,
            material: 'LightMaterial',
            color: `
                return vec3(5., 5., 5.);
            `
        }),
        new sphere({
            center:[-2.8, 5., -2.5],
            radius: 2.9,
            material: 'LightMaterial',
            color: `
                return vec3(5., 5., 5.);
            `
        })
    ]);

    // [...Array(3)].forEach((_, i) =>
    //     spheres.add(
    //         new sphere({
    //             id: 7+i,
    //             center:[-4.1 + random()*7.0, -0.2, -5.0 + random()*3.0],
    //             radius: 0.25, // radius
    //             material: 'FuzzyMetalMaterial', //pluckRandom(['LambertMaterial', 'FuzzyMetalMaterial']),
    //             color: '#353535'//'#451010' //'#ffffff'
    //         })
    //     )f
    // );

    let fbo = regl.framebuffer({
        color: [
            regl.texture({
                width: canvas.width,
                height: canvas.height,
                format: 'srgb',
                type: 'float'
            }),
        ],
        stencil: false,
        depth: false
    });

    let accumTexture = regl.texture({
        width: canvas.width,
        height: canvas.height,
        format: 'srgb',
        type: 'float'
    });

    let rayTrace = regl({
        frag: raytraceShader({
            options: {
                glslCamera: false,
                numSamples: 2//300//800//1500
            },
            objectList: objects
        }),
        vert: vertShader,
        attributes: {
            position: [
                -2, 0,
                0, -2,
                2, 2
            ]
        },
        uniforms: {
            ...camera.getUniform(),
            'uBgGradientColors[0]': normedColor('#000000'),
            'uBgGradientColors[1]': normedColor('#111150'),
            'uSeed': regl.prop('seed'),
            'uTime': ({tick}) =>
                0.01 * tick,
            'uResolution': ({viewportWidth, viewportHeight}) =>
                [viewportWidth, viewportHeight]
        },
        depth: {
            enable: false
        },
        count: 3,
        framebuffer: fbo
    });

    let accumulate = regl({
        frag: `
            precision highp float;

            uniform vec2 uResolution;

            uniform sampler2D renderTexture;
            uniform sampler2D accumTexture;

            uniform float uSampleCount;

            varying vec2 uv;

            void main() {
                //vec2 uw = abs(1. - uv); // mirror axes correctly
            	vec2 uw = vec2(uv.x, uv.y);

            	vec4 newSample = texture2D(renderTexture, uw);
                vec4 accumSamples = texture2D(accumTexture, uw);

                // gl_FragColor = (newSample*0.2 + accumSamples*0.8);

                gl_FragColor = accumSamples + newSample/uSampleCount;


                // if(uSampleCount == 0.) {
                //     gl_FragColor = newSample;
                // } else {
                //     gl_FragColor = mix(vec4(0.5), newSample, accumSamples); //vec4(newSample.rgb*0.5 + accumSamples.rgb*0.5, 1.);
                // }
            }
        `,
        vert: vertShader,
        attributes: {
            position: [
                -2, 0,
                0, -2,
                2, 2
            ]
        },
        uniforms: {
            'renderTexture': () => fbo,
            'accumTexture': () => accumTexture,
            'uSampleCount': regl.prop('sampleCount'),
            'uTime': ({tick}) =>
                0.01 * tick,
            'uResolution': ({viewportWidth, viewportHeight}) =>
                [viewportWidth, viewportHeight]
        },
        depth: {
            enable: false
        },
        count: 3,
    });


    // regl.clear({
    //     color: [0, 0, 0, 1]
    // });
    //
    // rayTrace();

    let sampleCount = 1;
    regl.frame(() => {
        // if(sampleCount > 500) {
        //     console.log('done!');
        //     return;
        // }

        regl.clear({
            color: [0, 0, 0, 1]
        });

        rayTrace({
            seed: [random(), random()]
        });

        accumulate({
            sampleCount
        });

        accumTexture({
            copy: true
        });

        ++sampleCount;
    })
};

document.addEventListener('DOMContentLoaded', app);
