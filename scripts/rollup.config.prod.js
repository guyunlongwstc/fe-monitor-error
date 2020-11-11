/**
 * 用于构建
 *
 * @file rollup.config.prod.js
 * @author guyunlong
 */

import babel from 'rollup-plugin-babel';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import json from 'rollup-plugin-json';
import eslint from 'rollup-plugin-eslint';
import typescript from 'rollup-plugin-typescript';
import {terser} from 'rollup-plugin-terser';

export default {
    input: './src/index.ts',

    output: {
        file: './output/sentinel.js',
        format: 'umd',
        name: 'sentinel'
    },

    plugins: [
        resolve({
            jsnext: true,
            main: true, 
            browser: true
        }),

        typescript({}),

        commonjs(),

        json(),

        babel({
          exclude: 'node_modules/**'
        }),

        terser({
            output: {
              ascii_only: true
            },
            compress: {
              pure_funcs: ['console.log']
            }
        }),

        eslint({
            include: ['./src/**/*.js']
        })
    ],
    
    external:['lodash']
}
