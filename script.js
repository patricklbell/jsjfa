"use strict";

let canvas, gl;
let jfa_fbos = [{}, {}], quad = {}, line = {}, shaders = {};
let jfa_fbo_i = 0, jfa_step = null, jfa_num_steps = 10.0;

// Run everything inside window load event handler, to make sure
// DOM is fully loaded and styled before trying to manipulate it.
window.addEventListener("load", function setupWebGL (evt) {

    // Cleaning after ourselves. The event handler removes
    // itself, because it only needs to run once.
    window.removeEventListener(evt.type, setupWebGL, false);

    canvas = document.querySelector("canvas");

    // Get WebGLRenderingContext from canvas element.
    let settings = { preserveDrawingBuffer: true };
    gl = canvas.getContext("webgl", settings) || canvas.getContext("experimental-webgl", settings);

    // Report the result.
    if (!(gl && gl instanceof WebGLRenderingContext)) {
        const paragraph = document.createElement("p");
        const node = document.createTextNode("Can't run demo. Your browser or device may not support WebGL.");
        paragraph.appendChild(node);
        const container = document.getElementById("content");
        container.appendChild(paragraph);
    } else {
        window.addEventListener("resize", (event) => {
            resize();
        });
        document.getElementById("step-button").addEventListener("click", increment_jfa);
        document.getElementById("play-button").addEventListener("click", play_jfa);
        resize();

        setup_gameloop();
    }
}, false);

// ---------------------------------- SHADERS ----------------------------------
function compile_shader(vs_src, fs_src) {
    const program = gl.createProgram();

    const vs_shader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs_shader, vs_src);
    gl.compileShader(vs_shader);
    if (!gl.getShaderParameter(vs_shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(vs_shader);
        throw `Could not compile vertex shader. \n\n${info}`;
    }

    const fs_shader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs_shader, fs_src);
    gl.compileShader(fs_shader);
    if (!gl.getShaderParameter(fs_shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(fs_shader);
        throw `Could not compile fragment shader. \n\n${info}`;
    }

    gl.attachShader(program, vs_shader);
    gl.attachShader(program, fs_shader);

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        throw `Could not link program. \n\n${info}`;
    }

    return program;
}

function load_shaders() {
    const common = `
    vec3 decode_color(float data) {
        vec3 color;

        color.r = float(floor(10.0*data))/10.0;
        color.g = float(floor(100.0*(data - color.r)))/10.0;
        color.b = float(floor(1000.0*(data - color.r - color.g/10.0)))/10.0;

        return color;
    }
    float encode_color(vec3 color) {
        float f = floor(10.0*color.r)/10.0 + floor(10.0*color.g)/100.0 + floor(10.0*color.b)/1000.0;
        return f;
    }
    `

    const blit_vs = `
    attribute vec4 position;

    varying vec2 texcoord;

    void main() {
        gl_Position = position;
        texcoord = position.xy * .5 + .5;
    }
    `;

    const blit_fs = `
    precision mediump float; 

    varying vec2 texcoord;

    uniform sampler2D screen;

    void main() {
        gl_FragColor = texture2D(screen, texcoord);
    }
    `;

    shaders.blit = {};
    shaders.blit.program = compile_shader(blit_vs, blit_fs);
    // For GLSL ES < 3.0, you can't specify layout in shader
    gl.bindAttribLocation(shaders.blit.program, 0, 'position');

    // Bind texture uniform to constant texture unit
    gl.useProgram(shaders.blit.program);
    gl.uniform1i(gl.getUniformLocation(shaders.blit.program, "screen"), gl.TEXTURE0);

    const blit_jfa_vs = `
    attribute vec4 position;

    varying vec2 texcoord;

    void main() {
        gl_Position = position;
        texcoord = position.xy * .5 + .5;
    }
    `;

    const blit_jfa_fs = `
    precision mediump float; 
    ` + common + `

    varying vec2 texcoord;

    uniform sampler2D screen;

    void main() {
        vec3 col = decode_color(texture2D(screen, texcoord).z);

        gl_FragColor = vec4(col, 1.0);
    }
    `;

    shaders.blit_jfa = {};
    shaders.blit_jfa.program = compile_shader(blit_jfa_vs, blit_jfa_fs);
    // For GLSL ES < 3.0, you can't specify layout in shader
    gl.bindAttribLocation(shaders.blit_jfa.program, 0, 'position');

    // Bind texture uniform to constant texture unit
    gl.useProgram(shaders.blit_jfa.program);
    gl.uniform1i(gl.getUniformLocation(shaders.blit_jfa.program, "screen"), gl.TEXTURE0);

    const line_vs = `
    attribute vec4 position;

    varying vec2 texcoord;

    void main() {
        gl_Position = position;
        texcoord = position.xy * .5 + .5;
    }
    `;

    const line_fs = `
    precision mediump float;
    ` + common + `

    varying vec2 texcoord;
    uniform vec3 color;

    void main() {
      gl_FragColor = vec4(texcoord, encode_color(color), 1.0);
    }
    `;

    shaders.line = {};
    shaders.line.program = compile_shader(line_vs, line_fs);
    // For GLSL ES < 3.0, you can't specify layout in shader
    gl.bindAttribLocation(shaders.line.program, 0, 'position');

    shaders.line.uniforms = {};
    shaders.line.uniforms.color = gl.getUniformLocation(shaders.line.program, "color");

    const jfa_vs = `
    attribute vec4 position;

    void main() {
        gl_Position = position;
    }
    `;

    // how many JFA steps to do.  2^num_steps is max image size on x and y
    const jfa_fs = `
    precision mediump float;
    ` + common + `
    const float num_steps = ` + Math.floor(jfa_num_steps).toString() + `.0;
    uniform sampler2D seed;
    uniform float step;
    uniform vec2 resolution;

    //============================================================
    vec4 step_jfa(in vec2 fragcoord, in float level)
    {
        vec2 texcoord = fragcoord / resolution.xy;

        level = clamp(level - 1.0, 0.0, num_steps);
        float step_width = floor(exp2(num_steps - level)+0.5);
        
        float nearest_distance = 9999.0;
        vec2 nearest_coord = vec2(0.0);
        float nearest_color_encoded = 0.0;
        
        for (int y = -1; y <= 1; ++y) {
            for (int x = -1; x <= 1; ++x) {
                vec2 sampler_coord = texcoord + (vec2(x,y) * step_width) / resolution.xy;
                
                vec4 data = texture2D(seed, sampler_coord);
                vec2 seed_coord = data.xy;

                float dist = length(seed_coord - texcoord);
                if (data.z != 0.0 && dist < nearest_distance)
                {
                    nearest_distance = dist;
                    nearest_coord = seed_coord;
                    nearest_color_encoded = data.z;
                }
            }
        }

        return vec4(nearest_coord.xy, nearest_color_encoded, 1.0);
    }

    vec3 make_distance_transform(in vec2 fragcoord) {
        vec2 texcoord = fragcoord / resolution.xy;

        vec4 data = texture2D(seed, texcoord);
        vec2 seed_coord = data.xy;

        float dist = length(seed_coord - texcoord);        

        // only for visual purposes, add a bit of brightness
        float brightness = 0.15 + 0.85*sqrt(dist / sqrt(2.0));
        return brightness * decode_color(data.z);
    }

    //============================================================
    void main() {
        if(int(step) == int(num_steps) + 1) {
            vec3 color = make_distance_transform(gl_FragCoord.xy);
            gl_FragColor = vec4(color, 1.0);
        } else {
            gl_FragColor = step_jfa(gl_FragCoord.xy, step);
        }
    }
    `

    shaders.jfa = {};
    shaders.jfa.program = compile_shader(jfa_vs,jfa_fs);
    // For GLSL ES < 3.0, you can't specify layout in shader
    gl.bindAttribLocation(shaders.jfa.program, 0, 'position');

    shaders.jfa.uniforms = {};
    shaders.jfa.uniforms.step       = gl.getUniformLocation(shaders.jfa.program, "step");
    shaders.jfa.uniforms.resolution = gl.getUniformLocation(shaders.jfa.program, "resolution");

    // Bind texture uniform to constant texture unit
    gl.useProgram(shaders.jfa.program);
    gl.uniform1i(gl.getUniformLocation(shaders.jfa.program, "seed"), gl.TEXTURE0);
}


// -------------------------------- FRAMEBUFFERS -------------------------------
// Pingpong buffers for performing steps of jfa
function load_jfa_fbos() {
    for (let i = 0; i < 2; i++) {
        if(typeof jfa_fbos[i].fbo === 'undefined') {
            jfa_fbos[i].fbo = gl.createFramebuffer();
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, jfa_fbos[i].fbo);

        if(typeof jfa_fbos[i].texture === 'undefined') {
            jfa_fbos[i].texture = gl.createTexture();
        }
        // @todo copy texture on resize
        gl.bindTexture(gl.TEXTURE_2D, jfa_fbos[i].texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, jfa_fbos[i].texture, 0);

        var result = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (result != gl.FRAMEBUFFER_COMPLETE) {
            console.log("Failed to complete jfa framebuffer " + i.toString());
            return;
        }
    }
}

// --------------------------------- RENDERING ---------------------------------
function load_primitives() {
    quad.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]), gl.STATIC_DRAW);

    line.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, line.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        -1,  1,
         1, -1,
         1, -1,
        -1,  1,
         1,  1,
    ]), gl.DYNAMIC_DRAW);
}
function draw_line() {
    gl.enableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, line.buf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function draw_quad() {
    gl.enableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad.buf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function draw_jfa_step(step) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, jfa_fbos[(jfa_fbo_i + 1) % 2].fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.useProgram(shaders.jfa.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, jfa_fbos[jfa_fbo_i].texture);

    gl.uniform1f(shaders.jfa.uniforms.step, step);
    gl.uniform2fv(shaders.jfa.uniforms.resolution, new Float32Array([canvas.width, canvas.height]));

    draw_quad();

    jfa_fbo_i = (jfa_fbo_i + 1) % 2;
}

function draw_jfa_framebuffer() {
    gl.useProgram(shaders.blit_jfa.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, jfa_fbos[jfa_fbo_i].texture);
    draw_quad();
}

function draw_jfa_distance_framebuffer() {
    gl.useProgram(shaders.blit.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, jfa_fbos[jfa_fbo_i].texture);
    draw_quad();
}

let is_left_mouse, left_mouse_pos = null, left_mouse_normal = null;
let mouse_color = random_color();
function draw_mouse_line(evt) {
    if(!is_left_mouse) {
        return;
    }

    let p = new vec2(evt.pageX - evt.target.offsetLeft, gl.drawingBufferHeight - (evt.pageY - evt.target.offsetTop));

    let resolution = new vec2(canvas.width, canvas.height);
    p = p.divide(resolution).scalar_multiply(2.0).scalar_subtract(1.0);

    const brush_size = new vec2(10);
    const b = brush_size.divide(resolution);

    let t = new vec2(b.x,0);
    let pn = new vec2(0,b.y);
    let pp = p;
    let update_n = false;
    if(left_mouse_pos != null) {
        let real_t = p.subtract(left_mouse_pos);
        if(real_t.length() > t.length()) {
            t = real_t;
            update_n = true;
        } else if (real_t.length() > 0.01) {
            t = t.multiply(real_t.normalize());
        }
        pn = left_mouse_normal;
        pp = left_mouse_pos;
    } else {
        update_n = true;
    }

    let n = new vec2(t.y, -t.x);
    n = n.normalize().multiply(b);
    if(left_mouse_pos == null) {
        pn = n;
        pp = p.subtract(t);
        p = p.add(t);
    }

    let tr = p.add      (n);
    let tl = p.subtract (n);
    let br = pp.add     (pn);
    let bl = pp.subtract(pn);

    gl.bindFramebuffer(gl.FRAMEBUFFER, jfa_fbos[jfa_fbo_i].fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.useProgram(shaders.line.program);

    gl.uniform3fv(shaders.line.uniforms.color, new Float32Array([mouse_color.x, mouse_color.y, mouse_color.z]));

    gl.bindBuffer(gl.ARRAY_BUFFER, line.buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        bl.x, bl.y,
        tl.x, tl.y,
        br.x, br.y,
        br.x, br.y,
        tl.x, tl.y,
        tr.x, tr.y,
    ]), gl.DYNAMIC_DRAW);
    draw_line();

    if(update_n) {
        left_mouse_normal = n;
        left_mouse_pos = p;
    }
}

// -----------------------------------------------------------------------------

function increment_jfa() {
    if (jfa_step > jfa_num_steps + 1) {
        jfa_step = null;
        resize();
        document.getElementById("step-button").textContent = "Start";
        return;
    }

    if(jfa_step == null) {
        document.getElementById("step-button").textContent = "Step";
        jfa_step = 1;
    } else if(jfa_step == jfa_num_steps) {
        document.getElementById("step-button").textContent = "Calculate Distance Transform";
    } else if (jfa_step == jfa_num_steps + 1) {
        document.getElementById("step-button").textContent = "Reset";
    } 
    draw_jfa_step(jfa_step);

    jfa_step++;
}

let jfa_playing = false, jfa_playing_time = 1000;
let play_jfa_timeout_func = () => {
    increment_jfa();
    if(jfa_step <= jfa_num_steps) {
        window.setTimeout(play_jfa_timeout_func, jfa_playing_time / jfa_num_steps);
    } else if(jfa_playing) {
        jfa_playing = false;
        document.getElementById("play-button").textContent = "Play";
    }
}
function play_jfa() {
    if(!jfa_playing) {
        jfa_playing = true;
        document.getElementById("play-button").textContent = "Pause";

        window.setTimeout(play_jfa_timeout_func, jfa_playing_time / jfa_num_steps);
    } else {
        jfa_playing = false;
        document.getElementById("play-button").textContent = "Play";
    }
}

function resize() {
    let window_size = get_window_size();
    canvas.width = window_size.width;
    canvas.height = window_size.height;

    load_jfa_fbos();
}

var prev_time
function setup_gameloop() {
    load_shaders();
    load_primitives();

    canvas.addEventListener("mousedown", (evt) => {
        is_left_mouse = true; 
        if(jfa_step === null) {
            mouse_color = random_color();
            draw_mouse_line(evt);
        }
    });
    canvas.addEventListener("mouseup",   (evt) => {is_left_mouse = false; left_mouse_pos = null;});
    canvas.addEventListener("mousemove", (evt) => {if(jfa_step === null) {draw_mouse_line(evt);}}, false);

    prev_time = Date.now();
    requestAnimationFrame(gameloop);
}

// Browser specific gameloop code
var vendors = ['webkit', 'moz'];
for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
  window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
  window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
}
function gameloop (time) {
    let id = window.requestAnimationFrame(gameloop);

    let dt = (time - prev_time);
    prev_time = time;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if(jfa_step === jfa_num_steps + 2) {
        draw_jfa_distance_framebuffer();
    } else {
        draw_jfa_framebuffer();
    }

    //let gl_error = gl.getError();
    //if(gl_error !== 0) {
    //    console.log(gl_error);
    //}
}
