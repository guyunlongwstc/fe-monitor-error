/**
 * 重写Ajax请求
 *
 * @file ajax.js
 * @author guyunlong(guyunlong@baidu.com)
 */

import {
    getLocationHref,
    isString
} from '../src/utils';
import {
    ProxyXhr,
    ProxyObj,
    XHR,
    SentinelStatic
} from '../types/index';
import {WINDOW} from '../src/config';

// 保存真正的XMLHttpRequest对象
const ProxyXMLHttpRequest = WINDOW.XMLHttpRequest;

/**
 * 重写Ajax
 *
 * @param {obj} proxy 重写函数对象
 */
function _Ajax(proxy: ProxyObj) {
    // 覆盖全局XMLHttpRequest，代理对象
    WINDOW.XMLHttpRequest = function () {
        //创建真正的XMLHttpRequest实例
        this.xhr = new ProxyXMLHttpRequest();
        for (let attr in this.xhr) {
            let type = "";
            try {
                type = typeof this.xhr[attr];
            } catch (e) { }
            if (type === "function") {
                // 代理方法(open、send...)
                this[attr] = hookfun(attr);
            } else {
                // 代理属性(onreadystatechange...)
                Object.defineProperty(this, attr, {
                    get: getFactory(attr),
                    set: setFactory(attr)
                });
            }
        }
    }

    /**
     * xhr对象属性getter
     *
     * @param {string} attr 重写属性
     */
    function getFactory(attr: string) {
        return function (this: ProxyXhr) {
            // 如果没有重写，重写属性
            let v = this.hasOwnProperty(attr + "_") ? this[attr + "_"] : this.xhr[attr];
            let attrGetterHook = (proxy[attr] || {})["getter"];

            return attrGetterHook && attrGetterHook(v, this) || v;
        }
    }

    /**
     * xhr对象属性setter
     *
     * @param {string} attr setter属性
     */
    function setFactory(attr: string) {
        return function (this: ProxyXhr, v: any) {
            let xhr = this.xhr;
            let self = this;
            let hook = proxy[attr];
            if (typeof hook === "function") {
                xhr[attr] = function () {
                    proxy[attr](xhr) || v.apply(xhr, arguments);
                }
            } else {
                let attrSetterHook = (hook || {})["setter"];
                v = attrSetterHook && attrSetterHook(v, self) || v;
                try {
                    xhr[attr] = v;
                } catch (e) {
                    this[attr + "_"] = v;
                }
            }
        }
    }

    function hookfun(fun: string) {
        return function (this: ProxyXhr) {
            let args = [].slice.call(arguments);

            // 如果fun拦截函数存在，则先调用拦截函数
            if (proxy[fun] && proxy[fun].call(this, args, this.xhr)) {
                return;
            }

            // 调用真正的xhr方法
            return this.xhr[fun].apply(this.xhr, args);
        }
    }
};

const Ajax = {
    install: function(this: SentinelStatic) {
        let self = this;
        _Ajax({
            onreadystatechange: function (xhr: XHR) {
                try {   
                    if (xhr.__xhr && xhr.readyState === 4) {
                        // 记录所有发出的ajax请求
                        self.captureBreadcrumb({
                            type: 'XMLHttpRequest',
                            detail: {
                                page: {
                                    url: getLocationHref()
                                },
                                method: xhr.__xhr.method,
                                url: xhr.responseURL,
                                status: xhr.status,
                                statusText: xhr.statusText
                            }
                        });

                        const err = {
                            type: 'ajaxError',
                            status: xhr.status,
                            statusText: xhr.statusText,
                            // message: (res && res.message) || '',
                            requestId: xhr.getResponseHeader('x-bce-request-id'),
                            resHeader: xhr.getAllResponseHeaders(),
                            resData: xhr.response,
                            ...xhr.__xhr
                        };

                        // 状态码不是200时捕获错误
                        if ((xhr.status !== 200) && !xhr.__isAbort) {
                            self.captureError(err, {
                                type: 'statusCodeError'
                            });
                        }

                        // 返回数据为json格式，进行格式检查
                        if (xhr.getResponseHeader('content-type') === 'application/json;charset=UTF-8') {
                            const res = xhr.response && JSON.parse(xhr.response);
                            const {success, code, cancelled, message} = res;


                            if (xhr.status === 200 && ((success === false) || (success === 'false'))) {
                                // 没有message、表单错误、重定向不上报
                                if (!message || message.field || message.redirect) {
                                    return;
                                }
                                // MFA 检查逻辑，ref = bat-ria/serverIO
                                if ((code === 'MFARequired' || code === 'MFACheckedFailed') && !cancelled) {
                                    return;
                                }
                                self.captureError(err, {
                                    type: 'responseError'
                                });
                            }
                        }
                    }
                } catch(e) {
                    // self.captureError(e, {
                    //     type: 'sentinelError',
                    //     function: 'statechangeHandler'
                    // });
                }
            },

            send: function (args: Array<any>, xhr: XHR) {
                if (xhr.addEventListener) {
                    xhr.addEventListener('error', e => {
                        const err = {
                            type: 'ajaxError',
                            status: xhr.status,
                            statusText: xhr.statusText,
                            requestId: xhr.getResponseHeader('x-bce-request-id'),
                            resHeader: xhr.getAllResponseHeaders(),
                            resData: xhr.response,
                            ...(e.target as any).__xhr
                        };
                        self.captureError(err, {
                            type: 'xhrError'
                        });
                    });
    
                    // 主动取消ajax的情况需要标注，否则可能会产生误报
                    xhr.addEventListener('abort', e => {
                        if (e.type === 'abort') { 
                            xhr.__isAbort = true;
                        }
                    });
                }
            },

            open: function (args: Array<any>, xhr: XHR) {
                let method = args[0];
                let url = args[1];
                if (isString(url)) {
                    xhr.__xhr = {
                        method,
                        url
                    }
                }
            }
        })
    },

    uninstall: function() {
        WINDOW.XMLHttpRequest = ProxyXMLHttpRequest;
    }
};

export default Ajax;
