
import { GfxBufferUsage, GfxBindingLayoutDescriptor, GfxBufferFrequencyHint, GfxTexFilterMode, GfxMipFilterMode, GfxPrimitiveTopology, GfxBlendStateDescriptor, GfxDepthStencilStateDescriptor, GfxRasterizationStateDescriptor, GfxSwapChain, GfxPassRenderer, GfxHostUploader, GfxDevice, GfxTextureMipChain, GfxSamplerDescriptor, GfxWrapMode, GfxVertexBufferDescriptor, GfxRenderPipelineDescriptor, GfxBufferBinding, GfxSamplerBinding, GfxProgramReflection, GfxDeviceLimits, GfxVertexAttributeDescriptor, GfxRenderTargetDescriptor, GfxLoadDisposition } from './GfxPlatform';
import { _T, GfxBuffer, GfxTexture, GfxColorAttachment, GfxDepthStencilAttachment, GfxRenderTarget, GfxSampler, GfxProgram, GfxInputLayout, GfxInputState, GfxRenderPipeline, FormatTypeFlags, FormatCompFlags, FormatFlags } from "./GfxPlatformImpl";
import { GfxFormat, getFormatCompByteSize } from "./GfxPlatformImpl";

import { DeviceProgram, ProgramCache } from '../../Program';
import { RenderFlags, CompareMode, FullscreenCopyProgram, applyFlags, RenderFlagsTracker } from '../../render';
import { assert } from '../../util';
import { Color } from '../../Color';

interface GfxBufferP_GL extends GfxBuffer {
    gl_buffer: WebGLBuffer;
    gl_target: GLenum;
    usage: GfxBufferUsage;
}

interface GfxTextureP_GL extends GfxTexture {
    gl_texture: WebGLTexture;
    gl_target: GLenum;
    gl_format: GLenum;
    gl_type: GLenum;
    width: number;
    height: number;
}

interface GfxColorAttachmentP_GL extends GfxColorAttachment {
    gl_renderbuffer: WebGLRenderbuffer;
    width: number;
    height: number;
}

interface GfxDepthStencilAttachmentP_GL extends GfxDepthStencilAttachment {
    gl_renderbuffer: WebGLRenderbuffer;
    width: number;
    height: number;
}

interface GfxSamplerP_GL extends GfxSampler {
    gl_sampler: WebGLSampler;
}

interface GfxProgramP_GL extends GfxProgram {
    gl_program: WebGLProgram;
    deviceProgram: DeviceProgram;
}

interface GfxRenderTargetP_GL extends GfxRenderTarget {
    gl_framebuffer: WebGLFramebuffer;
    colorAttachment: GfxColorAttachmentP_GL;
    depthAttachment: GfxDepthStencilAttachmentP_GL;
    clearBits: GLenum;
    colorClearColor: Color;
    depthClearValue: number;
    stencilClearValue: number;
}

interface GfxInputLayoutP_GL extends GfxInputLayout {
    attributes: GfxVertexAttributeDescriptor[];
    indexBufferFormat: GfxFormat | null;
}

interface GfxInputStateP_GL extends GfxInputState {
    vao: WebGLVertexArrayObject;
    indexBufferType: GLenum;
    indexBufferCompByteSize: number;
    inputLayout: GfxInputLayoutP_GL;
}

interface GfxRenderPipelineP_GL extends GfxRenderPipeline {
    bindingLayout: GfxBindingLayoutDescriptor;
    program: GfxProgramP_GL;
    drawMode: GLenum;
    renderFlags: RenderFlags;
    inputLayout: GfxInputLayoutP_GL;
}

function translateVertexFormat(fmt: GfxFormat): { size: number, type: GLenum, normalized: boolean } {
    function translateType(flags: FormatTypeFlags): GLenum {
        switch (flags) {
        case FormatTypeFlags.U8:
            return WebGL2RenderingContext.UNSIGNED_BYTE;
        case FormatTypeFlags.U16:
            return WebGL2RenderingContext.UNSIGNED_SHORT;
        case FormatTypeFlags.U32:
            return WebGL2RenderingContext.UNSIGNED_INT;
        case FormatTypeFlags.S8:
            return WebGL2RenderingContext.BYTE;
        case FormatTypeFlags.S16:
            return WebGL2RenderingContext.SHORT;
        case FormatTypeFlags.S32:
            return WebGL2RenderingContext.INT;
        case FormatTypeFlags.F32:
            return WebGL2RenderingContext.FLOAT;
        }
    }

    function translateSize(flags: FormatCompFlags): number {
        switch (flags) {
        case FormatCompFlags.COMP_R:
            return 1;
        case FormatCompFlags.COMP_RG:
            return 2;
        case FormatCompFlags.COMP_RGB:
            return 3;
        case FormatCompFlags.COMP_RGBA:
            return 4;
        }
    }

    const typeFlags: FormatTypeFlags = (fmt >>> 16) & 0xFF;
    const compFlags: FormatCompFlags = (fmt >>>  8) & 0xFF;
    const flags: FormatFlags = fmt & 0xFF;

    const type = translateType(typeFlags);
    const size = translateSize(compFlags);
    const normalized = !!(flags & FormatFlags.NORMALIZED);
    return { size, type, normalized };
}

function translateIndexFormat(format: GfxFormat): GLenum {
    switch (format) {
    case GfxFormat.U16_R:
        return WebGL2RenderingContext.UNSIGNED_SHORT;
    default:
        throw "whoops";
    }
}

function translateBufferHint(hint: GfxBufferFrequencyHint): GLenum {
    switch (hint) {
    case GfxBufferFrequencyHint.STATIC:
        return WebGL2RenderingContext.STATIC_DRAW;
    case GfxBufferFrequencyHint.DYNAMIC:
        return WebGL2RenderingContext.DYNAMIC_DRAW;
    }
}

function translateBufferUsageToTarget(usage: GfxBufferUsage): GLenum {
    switch (usage) {
    case GfxBufferUsage.INDEX:
        return WebGL2RenderingContext.ELEMENT_ARRAY_BUFFER;
    case GfxBufferUsage.VERTEX:
        return WebGL2RenderingContext.ARRAY_BUFFER;
    case GfxBufferUsage.UNIFORM:
        return WebGL2RenderingContext.UNIFORM_BUFFER;
    }
}

function translateTextureInternalFormat(fmt: GfxFormat): GLenum {
    switch (fmt) {
    case GfxFormat.F32_R:
        return WebGL2RenderingContext.R32F;
    case GfxFormat.F32_RG:
        return WebGL2RenderingContext.RG32F;
    case GfxFormat.F32_RGB:
        return WebGL2RenderingContext.RGB32F;
    case GfxFormat.F32_RGBA:
        return WebGL2RenderingContext.RGBA32F;
    case GfxFormat.U16_R:
        return WebGL2RenderingContext.R16UI;
    case GfxFormat.U8_RGBA:
        return WebGL2RenderingContext.RGBA8;
    default:
        throw "whoops";
    }
}

function translateTextureFormat(fmt: GfxFormat): GLenum {
    const compFlags: FormatCompFlags = (fmt >>>  8) & 0xFF;
    switch (compFlags) {
    case FormatCompFlags.COMP_R:
        return WebGL2RenderingContext.RED;
    case FormatCompFlags.COMP_RG:
        return WebGL2RenderingContext.RG;
    case FormatCompFlags.COMP_RGB:
        return WebGL2RenderingContext.RGB;
    case FormatCompFlags.COMP_RGBA:
        return WebGL2RenderingContext.RGBA;
    }
}

function translateTextureType(fmt: GfxFormat): GLenum {
    const typeFlags: FormatTypeFlags = (fmt >>> 16) & 0xFF;
    switch (typeFlags) {
    case FormatTypeFlags.U8:
        return WebGL2RenderingContext.UNSIGNED_BYTE;
    default:
        throw "whoops";
    }
}

function translateWrapMode(wrapMode: GfxWrapMode): GLenum {
    switch (wrapMode) {
    case GfxWrapMode.CLAMP:
        return WebGL2RenderingContext.CLAMP_TO_EDGE;
    case GfxWrapMode.REPEAT:
        return WebGL2RenderingContext.REPEAT;
    case GfxWrapMode.MIRROR:
        return WebGL2RenderingContext.MIRRORED_REPEAT;
    }
}

function translateFilterMode(filter: GfxTexFilterMode, mipFilter: GfxMipFilterMode): GLenum {
    if (mipFilter === GfxMipFilterMode.LINEAR && filter === GfxTexFilterMode.BILINEAR)
        return WebGL2RenderingContext.LINEAR_MIPMAP_LINEAR;
    if (mipFilter === GfxMipFilterMode.LINEAR && filter === GfxTexFilterMode.POINT)
        return WebGL2RenderingContext.NEAREST_MIPMAP_LINEAR;
    if (mipFilter === GfxMipFilterMode.NEAREST && filter === GfxTexFilterMode.BILINEAR)
        return WebGL2RenderingContext.LINEAR_MIPMAP_NEAREST;
    if (mipFilter === GfxMipFilterMode.NEAREST && filter === GfxTexFilterMode.POINT)
        return WebGL2RenderingContext.NEAREST_MIPMAP_NEAREST;
    if (mipFilter === GfxMipFilterMode.NO_MIP && filter === GfxTexFilterMode.BILINEAR)
        return WebGL2RenderingContext.LINEAR;
    if (mipFilter === GfxMipFilterMode.NO_MIP && filter === GfxTexFilterMode.POINT)
        return WebGL2RenderingContext.NEAREST;
    throw new Error(`Unknown texture filter mode`);
}

function translatePrimitiveTopology(topology: GfxPrimitiveTopology): GLenum {
    switch (topology) {
    case GfxPrimitiveTopology.TRIANGLES:
        return WebGL2RenderingContext.TRIANGLES;
    }
}

function translatePipelineStates(blendState: GfxBlendStateDescriptor, depthStencilState: GfxDepthStencilStateDescriptor, rasterizationState: GfxRasterizationStateDescriptor): RenderFlags {
    const renderFlags = new RenderFlags();
    renderFlags.blendMode = blendState.blendMode;
    renderFlags.blendSrc = blendState.srcFactor;
    renderFlags.blendDst = blendState.dstFactor;
    renderFlags.depthTest = depthStencilState.depthCompare !== CompareMode.ALWAYS;
    renderFlags.depthFunc = depthStencilState.depthCompare;
    renderFlags.depthWrite = depthStencilState.depthWrite;
    renderFlags.cullMode = rasterizationState.cullMode;
    renderFlags.frontFace = rasterizationState.frontFace;
    return renderFlags;
}

function getPlatformBuffer(buffer_: GfxBuffer): WebGLBuffer {
    const buffer = buffer_ as GfxBufferP_GL;
    return buffer.gl_buffer;
}

function getPlatformTexture(texture_: GfxTexture): WebGLTexture {
    const texture = texture_ as GfxTextureP_GL;
    return texture.gl_texture;
}

function getPlatformSampler(sampler_: GfxSampler): WebGLSampler {
    const sampler = sampler_ as GfxSamplerP_GL;
    return sampler.gl_sampler;
}

function getPlatformColorAttachment(colorAttachment_: GfxColorAttachment): WebGLRenderbuffer {
    const colorAttachment = colorAttachment_ as GfxColorAttachmentP_GL;
    return colorAttachment.gl_renderbuffer;
}

function getPlatformDepthStencilAttachment(depthStencilAttachment_: GfxDepthStencilAttachment): WebGLRenderbuffer {
    const depthStencilAttachment = depthStencilAttachment_ as GfxDepthStencilAttachmentP_GL;
    return depthStencilAttachment.gl_renderbuffer;
}

function getPlatformRenderTarget(renderTarget_: GfxRenderTarget): WebGLFramebuffer {
    const renderTarget = renderTarget_ as GfxRenderTargetP_GL;
    return renderTarget.gl_framebuffer;
}

function calcMipLevels(w: number, h: number): number {
    let m = Math.min(w, h);
    let i = 0;
    while (m > 0) {
        m /= 2;
        i++;
    }
    return i;
}

class GfxImplP_GL implements GfxSwapChain, GfxDevice, GfxPassRenderer, GfxHostUploader {
    private _fullscreenCopyFlags = new RenderFlags();
    private _fullscreenCopyProgram: GfxProgramP_GL;

    constructor(public gl: WebGL2RenderingContext) {
        this._programCache = new ProgramCache(gl);
        this._fullscreenCopyProgram = this.createProgram(new FullscreenCopyProgram()) as GfxProgramP_GL;
        this._fullscreenCopyFlags.depthTest = false;
    }

    //#region GfxSwapChain
    private _scWidth: number = 0;
    private _scHeight: number = 0;
    private _scTexture: GfxTexture | null = null;
    public configureSwapChain(width: number, height: number): void {
        if (this._scWidth !== width || this._scHeight !== height) {
            const gl = this.gl;

            this._scWidth = width;
            this._scHeight = height;

            if (this._scTexture !== null)
                this.destroyTexture(this._scTexture);

            this._scTexture = this.createTexture(GfxFormat.U8_RGBA, this._scWidth, this._scHeight, false, 1);
            gl.bindTexture(gl.TEXTURE_2D, getPlatformTexture(this._scTexture));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
    }

    public getDevice(): GfxDevice {
        return this;
    }

    public getOnscreenTexture(): GfxTexture {
        return this._scTexture;
    }

    public present(): void {
        this.blitFullscreenTexture(this._scTexture);
    }

    private blitFullscreenTexture(texture: GfxTexture): void {
        const gl = this.gl;
        this._applyFlags(this._fullscreenCopyFlags);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, getPlatformTexture(texture));
        gl.useProgram(this._fullscreenCopyProgram.gl_program);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    //#endregion

    //#region GfxDevice
    public createBuffer(wordCount: number, usage: GfxBufferUsage, hint: GfxBufferFrequencyHint): GfxBuffer {
        const byteSize = wordCount * 4;
        const gl = this.gl;
        const gl_buffer = gl.createBuffer();
        const gl_target = translateBufferUsageToTarget(usage);
        const gl_hint = translateBufferHint(hint);
        gl.bindBuffer(gl_target, gl_buffer);
        gl.bufferData(gl_target, byteSize, gl_hint);
        const buffer: GfxBufferP_GL = { _T: _T.Buffer, gl_buffer, gl_target, usage };
        return buffer;
    }

    public createTexture(format: GfxFormat, width: number, height: number, mipmapped: boolean, numSamples: number): GfxTexture {
        const gl = this.gl;
        const gl_texture = gl.createTexture();
        const gl_target = gl.TEXTURE_2D;
        const numLevels = mipmapped ? calcMipLevels(width, height) : 1;
        gl.bindTexture(gl_target, gl_texture);
        const internalformat = translateTextureInternalFormat(format);
        const gl_format = translateTextureFormat(format);
        const gl_type = translateTextureType(format);
        gl.texParameteri(gl_target, gl.TEXTURE_MAX_LEVEL, numLevels);
        gl.texStorage2D(gl_target, numLevels, internalformat, width, height);
        const texture: GfxTextureP_GL = { _T: _T.Texture, gl_texture, gl_target, gl_format, gl_type, width, height };
        return texture;
    }

    public createSampler(descriptor: GfxSamplerDescriptor): GfxSampler {
        const gl = this.gl;
        const gl_sampler = gl.createSampler();
        gl.samplerParameteri(gl_sampler, gl.TEXTURE_WRAP_S, translateWrapMode(descriptor.wrapS));
        gl.samplerParameteri(gl_sampler, gl.TEXTURE_WRAP_T, translateWrapMode(descriptor.wrapT));
        gl.samplerParameteri(gl_sampler, gl.TEXTURE_MIN_FILTER, translateFilterMode(descriptor.minFilter, descriptor.mipFilter));
        gl.samplerParameteri(gl_sampler, gl.TEXTURE_MAG_FILTER, translateFilterMode(descriptor.magFilter, GfxMipFilterMode.NO_MIP));
        gl.samplerParameterf(gl_sampler, gl.TEXTURE_MIN_LOD, descriptor.minLOD);
        gl.samplerParameterf(gl_sampler, gl.TEXTURE_MAX_LOD, descriptor.maxLOD);
        const sampler: GfxSamplerP_GL = { _T: _T.Sampler, gl_sampler };
        return sampler;
    }

    public createColorAttachment(width: number, height: number, numSamples: number): GfxColorAttachment {
        const gl = this.gl;
        const gl_renderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, gl_renderbuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, numSamples, gl.RGBA8, width, height);
        const colorAttachment: GfxColorAttachmentP_GL = { _T: _T.ColorAttachment, gl_renderbuffer, width, height };
        return colorAttachment;
    }

    public createDepthStencilAttachment(width: number, height: number, numSamples: number): GfxDepthStencilAttachment {
        const gl = this.gl;
        const gl_renderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, gl_renderbuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, numSamples, gl.DEPTH24_STENCIL8, width, height);
        const depthStencilAttachment: GfxDepthStencilAttachmentP_GL = { _T: _T.DepthStencilAttachment, gl_renderbuffer, width, height };
        return depthStencilAttachment;
    }

    public createRenderTarget(descriptor: GfxRenderTargetDescriptor): GfxRenderTarget {
        const gl = this.gl;
        const gl_framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, gl_framebuffer);
        gl.framebufferRenderbuffer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, getPlatformColorAttachment(descriptor.colorAttachment));
        gl.framebufferRenderbuffer(gl.DRAW_FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, getPlatformDepthStencilAttachment(descriptor.depthStencilAttachment));
        const colorAttachment = descriptor.colorAttachment as GfxColorAttachmentP_GL;
        const depthAttachment = descriptor.depthStencilAttachment as GfxDepthStencilAttachmentP_GL;
        const shouldClearColor = descriptor.colorLoadDisposition === GfxLoadDisposition.CLEAR;
        const shouldClearDepth = descriptor.depthLoadDisposition === GfxLoadDisposition.CLEAR;
        const shouldClearStencil = descriptor.stencilLoadDisposition === GfxLoadDisposition.CLEAR;

        let clearBits = 0;
        if (shouldClearColor)
            clearBits |= WebGL2RenderingContext.COLOR_BUFFER_BIT;
        if (shouldClearDepth)
            clearBits |= WebGL2RenderingContext.DEPTH_BUFFER_BIT;
        if (shouldClearStencil)
            clearBits |= WebGL2RenderingContext.STENCIL_BUFFER_BIT;

        const { colorClearColor, depthClearValue, stencilClearValue } = descriptor;
        const renderTarget: GfxRenderTargetP_GL = { _T: _T.RenderTarget, gl_framebuffer, colorAttachment, depthAttachment, clearBits, colorClearColor, depthClearValue, stencilClearValue };
        return renderTarget;
    }

    private _programCache: ProgramCache;
    public createProgram(deviceProgram: DeviceProgram): GfxProgram {
        const gl = this.gl;
        const gl_program = deviceProgram.compile(gl, this._programCache);
        const program: GfxProgramP_GL = { _T: _T.Program, gl_program, deviceProgram };
        return program;
    }

    public createInputLayout(attributes: GfxVertexAttributeDescriptor[], indexBufferFormat: GfxFormat | null): GfxInputLayout {
        const inputLayout: GfxInputLayoutP_GL = { _T: _T.InputLayout, attributes, indexBufferFormat };
        return inputLayout;
    }

    public createInputState(inputLayout_: GfxInputLayout, vertexBuffers: GfxVertexBufferDescriptor[], indexBuffer: GfxBuffer | null): GfxInputState {
        const inputLayout = inputLayout_ as GfxInputLayoutP_GL;

        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        for (let i = 0; i < inputLayout.attributes.length; i++) {
            const attr = inputLayout.attributes[i];
            const { size, type, normalized } = translateVertexFormat(attr.format);
            const vertexBuffer = vertexBuffers[attr.bufferIndex];
            const buffer = vertexBuffer.buffer as GfxBufferP_GL;
            assert(buffer.usage === GfxBufferUsage.VERTEX);
            gl.bindBuffer(gl.ARRAY_BUFFER, getPlatformBuffer(vertexBuffer.buffer));
            gl.vertexAttribPointer(attr.location, size, type, normalized, vertexBuffer.stride, vertexBuffer.offset + attr.bufferOffset);
            gl.enableVertexAttribArray(attr.location);
        }

        let indexBufferType: GLenum | null = null;
        let indexBufferCompByteSize: number | null = null;
        if (indexBuffer !== null) {
            const buffer = indexBuffer as GfxBufferP_GL;
            assert(buffer.usage === GfxBufferUsage.INDEX);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, getPlatformBuffer(indexBuffer));
            indexBufferType = translateIndexFormat(inputLayout.indexBufferFormat);
            indexBufferCompByteSize = getFormatCompByteSize(inputLayout.indexBufferFormat);
        }

        gl.bindVertexArray(null);

        const inputState: GfxInputStateP_GL = { _T: _T.InputState, vao, indexBufferType, indexBufferCompByteSize, inputLayout };
        return inputState;
    }

    public createRenderPipeline(descriptor: GfxRenderPipelineDescriptor): GfxRenderPipeline {
        const bindingLayout = descriptor.bindingLayout;
        const drawMode = translatePrimitiveTopology(descriptor.topology);
        const program = descriptor.program as GfxProgramP_GL;
        assert(program.deviceProgram.uniformBufferLayouts.length === bindingLayout.numUniformBuffers);
        // const renderFlags = translatePipelineStates(descriptor.blendState, descriptor.depthStencilState, descriptor.rasterizationState);
        const renderFlags = descriptor.renderFlags;
        const inputLayout = descriptor.inputLayout as GfxInputLayoutP_GL;
        const pipeline: GfxRenderPipelineP_GL = { _T: _T.RenderPipeline, bindingLayout, drawMode, program, renderFlags, inputLayout };
        return pipeline;
    }

    public createHostUploader(): GfxHostUploader {
        return this;
    }

    private _currentRenderTarget: GfxRenderTargetP_GL;
    private _setRenderTarget(renderTarget: GfxRenderTarget): void {
        const gl = this.gl;
        this._currentRenderTarget = renderTarget as GfxRenderTargetP_GL;
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this._currentRenderTarget.gl_framebuffer);
        const clearBits = this._currentRenderTarget.clearBits;
        if (clearBits & WebGL2RenderingContext.COLOR_BUFFER_BIT) {
            const c = this._currentRenderTarget.colorClearColor;
            gl.clearColor(c.r, c.b, c.g, c.a);
        }
        if (clearBits & WebGL2RenderingContext.DEPTH_BUFFER_BIT)
            gl.clearDepth(this._currentRenderTarget.depthClearValue);
        if (clearBits & WebGL2RenderingContext.STENCIL_BUFFER_BIT)
            gl.clearStencil(this._currentRenderTarget.stencilClearValue);
        gl.clear(clearBits);
    }

    public createPassRenderer(renderTarget: GfxRenderTarget): GfxPassRenderer {
        this._setRenderTarget(renderTarget);
        return this;
    }

    public destroyBuffer(o: GfxBuffer): void {
        this.gl.deleteBuffer(getPlatformBuffer(o));
    }

    public destroyTexture(o: GfxTexture): void {
        this.gl.deleteTexture(getPlatformTexture(o));
    }

    public destroySampler(o: GfxSampler): void {
        this.gl.deleteSampler(getPlatformSampler(o));
    }

    public destroyColorAttachment(o: GfxColorAttachment): void {
        this.gl.deleteRenderbuffer(getPlatformColorAttachment(o));
    }

    public destroyDepthStencilAttachment(o: GfxDepthStencilAttachment): void {
        this.gl.deleteRenderbuffer(getPlatformDepthStencilAttachment(o));
    }

    public destroyRenderTarget(o: GfxRenderTarget): void {
        this.gl.deleteFramebuffer(getPlatformRenderTarget(o));
    }

    public destroyProgram(o: GfxProgram): void {
        // Nothing.
    }

    public destroyInputLayout(o: GfxInputLayout): void {
        // Nothing.
    }

    public destroyInputState(o: GfxInputState): void {
        const inputState = o as GfxInputStateP_GL;
        this.gl.deleteVertexArray(inputState.vao);
    }

    public destroyRenderPipeline(o: GfxRenderPipeline): void {
        // Nothing.
    }

    public destroyHostUploader(o: GfxHostUploader): void {
        // Nothing.
    }

    public destroyPassRenderer(o: GfxPassRenderer): void {
        // Nothing.
    }

    public queryLimits(): GfxDeviceLimits {
        const gl = this.gl;
        return {
            uniformBufferWordAlignment: gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT) / 4,
        };
    }

    public queryProgram(program_: GfxProgram): GfxProgramReflection {
        const program = program_ as GfxProgramP_GL;
        const deviceProgram = program.deviceProgram;
        return { uniformBuffers: deviceProgram.uniformBufferLayouts };
    }
    //#endregion

    //#region GfxPassRenderer
    private _currentPipeline: GfxRenderPipelineP_GL;
    private _currentInputState: GfxInputStateP_GL;
    private _currentRenderFlags = new RenderFlagsTracker();

    public setBindings(unchangedUniformBuffers: number, uniformBuffers: GfxBufferBinding[], unchangedSamplers: number, samplers: GfxSamplerBinding[]): void {
        const gl = this.gl;

        assert(unchangedUniformBuffers + uniformBuffers.length === this._currentPipeline.bindingLayout.numUniformBuffers);
        assert(unchangedSamplers + samplers.length === this._currentPipeline.bindingLayout.numSamplers);

        for (let i = 0; i < uniformBuffers.length; i++) {
            const binding = uniformBuffers[i];
            const buffer = binding.buffer as GfxBufferP_GL;
            assert(buffer.usage === GfxBufferUsage.UNIFORM);
            const byteOffset = binding.wordOffset * 4;
            const byteSize = binding.wordCount * 4;
            gl.bindBufferRange(gl.UNIFORM_BUFFER, unchangedUniformBuffers + i, getPlatformBuffer(binding.buffer), byteOffset, byteSize);
        }

        for (let i = 0; i < samplers.length; i++) {
            const binding = samplers[i];
            const samplerIndex = unchangedSamplers + i;
            gl.activeTexture(gl.TEXTURE0 + samplerIndex);
            gl.bindSampler(samplerIndex, getPlatformSampler(binding.sampler));
            const { gl_texture, gl_target } = (binding.texture as GfxTextureP_GL);
            gl.bindTexture(gl_target, gl_texture);
        }
    }

    public setViewport(w: number, h: number): void {
        const gl = this.gl;
        gl.viewport(0, 0, w, h);
    }

    private _applyFlags(flags: RenderFlags): void {
        applyFlags(this.gl, this._currentRenderFlags, flags, { forceDisableCulling: false });
    }

    public setPipeline(pipeline: GfxRenderPipeline): void {
        const gl = this.gl;
        this._currentPipeline = pipeline as GfxRenderPipelineP_GL;
        this._applyFlags(this._currentPipeline.renderFlags);
        gl.useProgram(this._currentPipeline.program.gl_program);
    }

    public setInputState(inputState_: GfxInputState): void {
        const gl = this.gl;
        const inputState = inputState_ as GfxInputStateP_GL;
        assert(inputState.inputLayout === this._currentPipeline.inputLayout);
        this._currentInputState = inputState;
        gl.bindVertexArray(this._currentInputState.vao);
    }

    public draw(count: number, firstVertex: number): void {
        const gl = this.gl;
        const pipeline = this._currentPipeline;
        gl.drawArrays(pipeline.drawMode, firstVertex, count);
    }

    public drawIndexed(count: number, firstIndex: number): void {
        const gl = this.gl;
        const pipeline = this._currentPipeline;
        const inputState = this._currentInputState;
        gl.drawElements(pipeline.drawMode, count, inputState.indexBufferType, firstIndex * inputState.indexBufferCompByteSize);
    }

    private _passReadFramebuffer: WebGLFramebuffer | null = null;
    private _passDrawFramebuffer: WebGLFramebuffer | null = null;

    public endPass(resolveColorTo_: GfxTexture | null): void {
        if (resolveColorTo_ !== null) {
            const gl = this.gl;

            if (this._passReadFramebuffer === null) {
                this._passReadFramebuffer = gl.createFramebuffer();
                this._passDrawFramebuffer = gl.createFramebuffer();
            }

            const resolveColorTo = resolveColorTo_ as GfxTextureP_GL;
            const resolveColorFrom = this._currentRenderTarget.colorAttachment;

            assert(resolveColorFrom.width === resolveColorTo.width && resolveColorFrom.height === resolveColorTo.height);

            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this._passReadFramebuffer);
            gl.framebufferRenderbuffer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, resolveColorFrom.gl_renderbuffer);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this._passDrawFramebuffer);
            gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resolveColorTo.gl_texture, 0);
            gl.blitFramebuffer(0, 0, resolveColorFrom.width, resolveColorFrom.height, 0, 0, resolveColorTo.width, resolveColorTo.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);

            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        }
    }
    //#endregion

    //#region GfxHostUploader
    public uploadBufferData(buffer: GfxBuffer, dstWordOffset: number, data: ArrayBufferView): void {
        const gl = this.gl;
        const dstByteOffset = dstWordOffset * 4;
        const { gl_buffer, gl_target } = buffer as GfxBufferP_GL;
        gl.bindBuffer(gl_target, gl_buffer);
        gl.bufferSubData(gl_target, dstByteOffset, data);
    }

    public uploadTextureData(texture: GfxTexture, data: GfxTextureMipChain): void {
        const gl = this.gl;
        const { gl_texture, gl_target, gl_format, gl_type, width, height } = texture as GfxTextureP_GL;
        gl.bindTexture(gl_target, gl_texture);
        let w = width, h = height;
        for (let i = 0; i < data.mipLevels.length; i++) {
            gl.texSubImage2D(gl_target, i, 0, 0, w, h, gl_format, gl_type, data.mipLevels[i]);
            w = Math.max((w / 2) | 0, 1);
            h = Math.max((h / 2) | 0, 1);
        }
    }
    //#endregion

    // Debugging.
    public getBufferData(buffer: GfxBuffer, dstBuffer: ArrayBufferView): void {
        const gl = this.gl;
        const { gl_buffer, gl_target } = buffer as GfxBufferP_GL;
        gl.bindBuffer(gl_target, gl_buffer);
        gl.getBufferSubData(gl_target, 0, dstBuffer);
    }
}

export function createSwapChainForWebGL2(gl: WebGL2RenderingContext): GfxSwapChain {
    return new GfxImplP_GL(gl);
}

// Debugging.
export function gfxPassRendererGetImpl(gfxPassRenderer: GfxPassRenderer): GfxImplP_GL {
    return gfxPassRenderer as GfxImplP_GL;
}

export function gfxDeviceGetImpl(gfxDevice: GfxDevice): GfxImplP_GL {
    return gfxDevice as GfxImplP_GL;
}