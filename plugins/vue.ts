/**
 * 重写Vue.config.errorHandler, 捕获错误
 *
 * @file vue.js
 * @author guyunlong(guyunlong@baidu.com)
 */

import {SentinelStatic, Capture} from '../types/index';
import {WINDOW} from '../src/config';

function formatComponentName(vm: any) {
    if (vm.$root === vm) {
        
      return 'root instance';
    }
    let name = vm._isVue ? vm.$options.name || vm.$options._componentTag : vm.name;

    return (
      (name ? 'component <' + name + '>' : 'anonymous component') +
      (vm._isVue && vm.$options.__file ? ' at ' + vm.$options.__file : '')
    );
  }
  
function vuePlugin(Sentinel: SentinelStatic, Vue: any) {
    Vue = Vue || WINDOW.Vue;
  
    if (!Vue || !Vue.config) return;
  
    let _oldOnError = Vue.config.errorHandler;

    // 重写errorHandler函数，捕获到错误后调用captureError发送错误
    Vue.config.errorHandler = function VueErrorHandler(error: any, vm: any, info: any) {
        let metaData = {} as any;
    
        if (Object.prototype.toString.call(vm) === '[object Object]') {
            metaData.componentName = formatComponentName(vm);
            metaData.propsData = vm.$options.propsData;
        }
    
        if (typeof info !== 'undefined') {
            metaData.lifecycleHook = info;
        }
    
        Sentinel.captureError(error, {
            extra: metaData
        });
    
        if (typeof _oldOnError === 'function') {
            _oldOnError.call(this, error, vm, info);
        }
    };
}
  
module.exports = vuePlugin;
  