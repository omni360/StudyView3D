define([
    '../Constants/Global',
], function(Global) {
    'use strict';
        
    var addLineNumbers = function (string) {

        var lines = string.split('\n');

        for (var i = 0; i < lines.length; i++) {

            lines[i] = (i + 1) + ': ' + lines[i];

        }

        return lines.join('\n');

    };

    return function (gl, type, string) {

        var shader = gl.createShader(type);

        gl.shaderSource(shader, string);
        gl.compileShader(shader);

        if (Global.DEBUG_SHADERS) {

            if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === false) {

                THREE.error('THREE.WebGLShader: Shader couldn\'t compile.');

            }

            if (gl.getShaderInfoLog(shader) !== '') {

                THREE.warn('THREE.WebGLShader: gl.getShaderInfoLog()', gl.getShaderInfoLog(shader), addLineNumbers(string));

            }

        }

        // --enable-privileged-webgl-extension
        // avp.logger.log( type, gl.getExtension( 'WEBGL_debug_shaders' ).getTranslatedShaderSource( shader ) );

        return shader;

    };
        
});