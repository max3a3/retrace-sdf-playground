import PicoGL from 'picogl';
import {vec3, vec2} from 'gl-matrix';
import spector from 'spectorjs';
import queryString from 'query-string';

import {createCamera} from './camera';
import scene from './scenes/test-scene';

import vertShader from './shaders/vert.glsl';
import rayTraceShader from './shaders/raytracer.glsl.js';
import renderShader from './shaders/render.glsl';

import {
    definedNotNull,
    random,
    normedColor,
    normedColorStr,
    animationFrame
} from './utils';

import 'normalize.css/normalize.css';
import './styles/index.scss';

const defaultMaxSampleCount = 10;

function app() {
    const params = queryString.parse(location.search);
    const canvas = document.getElementById('regl-canvas');
    const gl = canvas.getContext('webgl2');

    const maxSampleCount = definedNotNull(params.sampleCount)
        ? params.sampleCount
        : defaultMaxSampleCount;

    const shaderSampleCount = params.realTime
        ? params.sampleCount || 1
        : 1;

    if(params.debug) {
        let spectorGlDebug = new spector.Spector();
        spectorGlDebug.displayUI();
    }

    const app = PicoGL.createApp(canvas)
        .disable(PicoGL.DEPTH_TEST)
        .disable(PicoGL.STENCIL_TEST)
        .disable(PicoGL.SCISSOR_TEST)
        .clearColor(0, 0, 0, 1);

    const camera = createCamera({
        lookFrom: [3.1, 0.8, 1.9],
        lookAt: [-0.25, 0.1, -1.5],
        vUp: [0, 1, 0],
        vfov: 32,
        aperture: 0.1,
        aspect: canvas.width/canvas.height
    });

    // raytrace framebuffer
    let traceFboColorTarget = app.createTexture2D(app.width, app.height, {
        type: gl.FLOAT,
        interalFormat: gl.R32F,
        // format: gl.SRGBA
    });

    let traceFbo = app.createFramebuffer()
        .colorTarget(0, traceFboColorTarget)

    // framebuffer for accumulating samples
    let accumFboColorTarget = app.createTexture2D(app.width, app.height, {
        type: gl.FLOAT,
        interalFormat: gl.R32F,
        // format: gl.SRGBA
    });

    let accumFbo = app.createFramebuffer()
        .colorTarget(0, accumFboColorTarget);

    /*
     * raytrace draw call
     */

    const rayTraceGlProgram = app.createProgram(vertShader, rayTraceShader({
        options: {
            realTime: params.realTime,
            glslCamera: false,
            numSamples: shaderSampleCount
        },
        objectList: scene
    }));

    // full screen quad
    const positions = app.createVertexBuffer(PicoGL.FLOAT, 2,
        new Float32Array([
            -2, 0,
            0, -2,
            2, 2
        ]
    ));

    const fullScreenQuadVertArray = app
        .createVertexArray()
        .vertexAttributeBuffer(0, positions)

    const rayTraceDrawCall = app
        .createDrawCall(rayTraceGlProgram, fullScreenQuadVertArray)
        .uniform('uBgGradientColors[0]', new Float32Array([
            ...normedColor('#000000'),
            ...normedColor('#111111')
        ]))
        .uniform('uResolution', vec2.fromValues(app.width, app.height))
        .uniform('uSeed', vec2.fromValues(random(), random()))
      //  .uniform('uTime', 0);

    if(!params.realTime) {
        rayTraceDrawCall
            .texture('accumTexture', accumFbo.colorAttachments[0])
            .uniform('uOneOverSampleCount', 1/maxSampleCount);
    }

    const cameraUniform = camera.getUniform();
    Object.keys(cameraUniform)
        .forEach(uniformName =>
            rayTraceDrawCall.uniform(uniformName, cameraUniform[uniformName])
        );

    /*
     * render draw call
     */

    const renderGlProgram = app.createProgram(vertShader, renderShader);
    const renderDrawCall = app
        .createDrawCall(renderGlProgram, fullScreenQuadVertArray)
        .texture('traceTexture', traceFbo.colorAttachments[0]);


    // debug info
    let debugEl = document.getElementById('debug');

    const staticRender = () => {
        const frame = animationFrame(({time, frameCount}) => {
            console.log(frameCount);
            let sampleCount = frameCount;

            debugEl.innerHTML =
                `samples: ${sampleCount} / ${maxSampleCount},
                 render time: ${(time*0.001).toFixed(1)}s`;

            if(sampleCount == maxSampleCount) {
                frame.cancel();
            }

            // draw new rendered sample blended with accumulated
            // samples in accumFbo to traceFbo frambuffer

            app.drawFramebuffer(traceFbo)
                .clear();

            rayTraceDrawCall
            //    .uniform('uTime', time * 0.01)
                .uniform('uSeed', vec2.fromValues(random(), random()))
                .draw();

            // copy rendered result in traceFbo to accumFbo frambuffer
            // for blending in the next raytrace draw call

            app.readFramebuffer(traceFbo)
                .drawFramebuffer(accumFbo)
                .clear()
                .blitFramebuffer(PicoGL.COLOR_BUFFER_BIT);

            // draw rendered result in traceFbo to screen

            app.defaultDrawFramebuffer()
                .clear();

            renderDrawCall
                .draw();
        });
    }

    const realTimeRender = () => {
        let then = 0;
        const frame = animationFrame(({time}) => {
            app.clear();

            rayTraceDrawCall
           //     .uniform('uTime', time * 0.01)
                .uniform('uSeed', vec2.fromValues(random(), random()))
                .draw();

            const now = time;
            const deltaTime = time - then;
            then = time;
            const fps = (1000 / deltaTime).toFixed(3);

            debugEl.innerHTML =
                `samples per frame: ${shaderSampleCount}, fps: ${fps}`;
        });
    }


    if(!params.realTime) {
        staticRender();
    } else {
        realTimeRender();
    }
}

document.addEventListener('DOMContentLoaded', app);
