/**
 * sentinel
 *
 * @file index.js
 * @author guyunlong(guyunlong@baidu.com)
 */

import 'core-js/features/promise';
import * as rrweb from 'rrweb';
import Ajax from '../plugins/ajax';
import {
    htmlTreeAsString,
    getLocationHref,
    computedStack,
    isFunction,
    isError,
    getSystem,
} from './utils';
import {
    EVENTTARGETS,
    WINDOW
} from './config';
import offlineDB from './offlineDB';
import {
    WrapedFunction,
    Collection,
    BreadCrumb,
    wrapFunc,
    SentinelStatic,
    SentinelPlugin,
    Capture,
    Config,
    ExData
} from '../types/index';
import {Offline} from '../types/offlineDB';

class Sentinel implements SentinelStatic {
    private wrapedFunctions: Array<WrapedFunction>; // 保存被try catch包裹的函数
    private allErrors: Array<any>; // 保存全部的错误
    private config: Config; // 配置参数
    private isSentinelInstalled: boolean; // sentinel是否安装
    private plugins: Array<any>; // 安装的插件
    private DB: Offline | null; // indexDB实例
    private screenStop: any;
    private screenId: number; // 录屏Id
    private events: Array<any>; // 录屏数据
    private isGlobalErrorInstalled: boolean; // 全局监控是否安装
    private breadcrumbs: Array<BreadCrumb>; // 用户行为等信息
    private maxBreadcrumbs: number; // 用户行为信息最大长度
    private keypressTimer: NodeJS.Timeout | null; // keypress计时器
    private keypressDebounce: number; // keypress事件防抖时间
    private checkoutEveryNms: number; // 全量快照间隔，默认5秒进行一次全量快照
    private observeTimer: NodeJS.Timeout | null;
    private clearScreenTimer: NodeJS.Timeout | null;

    constructor() {
        this.wrapedFunctions = [];
        this.allErrors = [];
        this.config = {
            id: '5d870d087ea72250dc0c5099',
            ignoreErrors: [/^Script error\.?$/], // 忽略的错误
            ignoreApis: [], // 忽略的接口
            url: '', // 上报地址
            delay: 2000, // 延迟上报时间
            random: 1, // 抽样上报，1为全部上报
            screenShot: false, // 是否上传录屏, 默认不上传
            screenShotTime: 20000, // 录屏时间，默认20s
            offlineLog: false, // 是否开启离线日志，默认不开启
            offlineLogExp: 0 // 离线日志过期时间，默认7天
        };
        this.isSentinelInstalled = false;
        this.plugins = [];
        this.DB = null;
        this.screenId = 0;
        this.events = [];
        this.isGlobalErrorInstalled = false;
        this.breadcrumbs = [];
        this.maxBreadcrumbs = 50;
        this.keypressTimer = null;
        this.keypressDebounce = 1000;
        this.checkoutEveryNms = 10000;
        this.clearScreenTimer = null;
        this.observeTimer = null;
    }

    public async install(config: Config) {
        this.config = Object.assign(this.config, config);

        if (!this.isSentinelInstalled) {

            // 初始化indexedDB，开启录屏默认开启indexedDB
            if (this.config.offlineLog || this.config.screenShot) {
                this.DB = await this.initIndexedDB();
            }

            // 初始化录屏
            if (this.config.screenShot) {
                this.initScreenShot();
            }

            // 安装全局错误监控
            this.installGlobalErrorsHandler();

            // 安装ajax请求监控
            Ajax.install.apply(this);

            // 重写全局函数，包裹try catch，捕获错误
            this.rewriteFunctions();

            // 安装promise异常监控
            this.installPromiseRejectHandler();

            // 安装其他监控
            this.installBreadcrumb();

            // 安装插件，后续支持san、vue、react
            this.drainPlugins();

            this.isSentinelInstalled = true;
        }

        return this;
    }

    private async initIndexedDB() {
        let DB: Offline | null;
        try {
            DB = await offlineDB.init();

            // 清除有效日期前的错误日志
            DB && DB.clearLogs('error', this.config.offlineLogExp);

            // 清除所有的录屏日志
            DB && DB.clearLogs('screenShot');

            return DB;
        } catch (e) {
            // indexedDB初始化失败
            this.config.offlineLog = false;
            this.config.screenShot = false;
            return null;
        }
    }

    private initScreenShot() {
        const self = this;
        this.screenStop = rrweb.record({
            emit(event, isCheckout) {
                if (isCheckout) {
                    self.DB!.addLog({
                        id: Date.now(),
                        value: self.events
                    }, 'screenShot');

                    self.events = [];
                }

                self.events.push(event);
            },
            checkoutEveryNms: self.checkoutEveryNms
        });

        // 每隔checkoutEveryNms需要触发mutationObserve回调，进而触发全量快照，否则录屏时间很长，临时处理，后续改进
        this.observeTimer = setInterval(() => {
            document.body.setAttribute('time', Date.now().toString())
        }, this.checkoutEveryNms);

        // 每半小时清理IndexDB
        this.clearScreenTimer = setTimeout(() => {
            this.DB!.clearLogs('screenShot');
        }, 30 * 60 * 1000);
    }

    private installGlobalErrorsHandler() {
        const self = this;

        // 捕获全局错误
        this.rewriteFn(WINDOW, 'onerror', (func: Function) => {
            return function (this: any, message: Event | string, url: string, lineNo: number, colNo: number, e: Error) {
                self.isGlobalErrorInstalled = true;
                const ex = isError(e) ? e : {
                    message,
                    name: 'errorMsg'
                };
                self.captureError(ex, {
                    type: 'globalError'
                });

                if (func && isFunction(func)) {
                    func.apply(this, arguments);
                }
            };
        });

        this.globalErrorHandler = this.globalErrorHandler.bind(this);

        // 静态资源加载错误捕获
        WINDOW.addEventListener('error', this.globalErrorHandler, true);
    }

    private globalErrorHandler(event: ErrorEvent) {
        // 如果window.onerror被覆盖，使用addEventListener捕获全局错误，主要是兼容性考虑
        // 如果window.onerror没被覆盖，使用addEventListener捕获静态资源加载错误
        if (this.isGlobalErrorInstalled) {
            const target = (event.target as any) || event.srcElement;

            // 捕获静态资源加载错误
            const isElementTarget = target instanceof HTMLScriptElement
                || target instanceof HTMLLinkElement
                || target instanceof HTMLImageElement;

            if (!isElementTarget) {
                return false;
            }
            const url = target.src || target.href;
            const err = {
                name: 'sourceError',
                message: url
            };
            this.captureError(err, {
                type: 'globalListenerError'
            });
        }
        else {
            const {error, message} = event;
            const ex = isError(error) ? error : {
                message,
                name: 'errorMsg'
            };
            this.captureError(ex, {
                type: 'globalListenerError'
            });
        }
    }

    private rewriteFunctions() {
        this.rewriteTimeFn = this.rewriteTimeFn.bind(this);
        this.rewriteAmimationFn = this.rewriteAmimationFn.bind(this);

        this.rewriteFn(WINDOW, 'setTimeout', this.rewriteTimeFn);
        this.rewriteFn(WINDOW, 'setInterval', this.rewriteTimeFn);
        this.rewriteFn(WINDOW, 'requestAnimationFrame', this.rewriteAmimationFn)

        // 重写事件监听函数
        this.rewriteEventListener();

        return this;
    }

    /**
     * 保存原回调函数
     *
     * @param {object} obj
     * @param {name} 回调函数名
     * @param {function} rewriteCallback 重写原回调函数的函数
     */
    private rewriteFn(obj: any, name: string, rewriteCallback: Function) {
        let oldFn;
        oldFn = obj[name];
        obj[name] = rewriteCallback(oldFn);
        this.wrapedFunctions.push([obj, name, oldFn])
    }

    /**
     * 重写setTimeout和setInterval
     *
     * @param {function} func 原setTimeout和setInterval
     * @return {function} 重写之后的setTimeout和setInterval
     */
    private rewriteTimeFn(func: Function) {
        const self = this;

        return function(this: any) {
            // arguments转数组
            let args = Array.prototype.slice.call(arguments);
            let oldFn = args[0];

            // 使用try catch包裹回调函数
            args[0] = self.wrapTryCatch(
                {
                    type: 'tryCatch',
                    function: func.name || 'anonymous'
                },
                oldFn
            );

            // 确保setTimeout和setInterval正常执行
            return func.apply(this, args);
        }
    }


    private rewriteAmimationFn(func: Function) {
        return (fn: wrapFunc) => {
            const cb = this.wrapTryCatch(
                {
                    type: 'tryCatch',
                    function: 'requestAnimationFrame',
                    handler: (fn && fn.name) || '<anonymous>'
                },
                fn
            );
            return func(cb);
        }
    }

    private rewriteEventListener() {
        // 遍历找到addEventlistener
        EVENTTARGETS.forEach(evt => {
            let proto = WINDOW[evt] && WINDOW[evt].prototype;
            if (proto && proto.hasOwnProperty && proto.hasOwnProperty('addEventListener')) {
                this.rewriteAddEventFn = this.rewriteAddEventFn.bind(this);
                this.rewriteRemoveEventFn = this.rewriteRemoveEventFn.bind(this);
                this.rewriteFn(proto, 'addEventListener', this.rewriteAddEventFn);
                this.rewriteFn(proto, 'removeEventListener', this.rewriteRemoveEventFn);
            }
        })
    }

    /**
     * 重写addEventListener
     *
     * @param {function} func 原addEventListener函数
     * @return {function} 重写之后的addEventListener函数
     */
    private rewriteAddEventFn(func: Function) {
        const self = this;

        return function(this: any) {
            let args = Array.prototype.slice.call(arguments);
            let oldFn = args[1];

            // oldFn如果不是函数，是对象的话，使用try catch包裹oldFn.handleEvent函数
            if (oldFn && !isFunction(oldFn) && oldFn.handleEvent) {
                try {
                    oldFn.handleEvent = self.wrapTryCatch(
                        {
                            type: 'tryCatch',
                            function: 'addEventListener',
                            handler: (oldFn.handleEvent && oldFn.handleEvent.name) || 'anonymous'
                        },
                        oldFn.handleEvent
                    );
                } catch(e) {
                    self.captureError(e, {
                        type: 'sentinelError',
                    });
                    throw e;
                }
            }

            // try catch包裹事件的回调函数
            args[1] = self.wrapTryCatch(
                {
                    type: 'tryCatch',
                    function: 'addEventListener',
                    handler: (oldFn && oldFn.name) || 'anonymous'
                },
                oldFn
            );
            func.apply(this, args);
        }
    }

    /**
     * 重写removeEventListener
     *
     * @param {function} func 原removeEventListener函数
     * @return {function} 重写之后的removeEventListener函数
     */
    private rewriteRemoveEventFn(func: Function) {
        const self = this;

        return function(this: any) {
            let args = Array.prototype.slice.call(arguments);
            try {
                let fn = args[1];
                // 获取重写之后的事件回调函数， 然后remove该事件
                args[1] = fn && (fn.__cb_wrapper__ ? fn.__cb_wrapper__  : fn);
            } catch (e) {
                self.captureError(e, {
                    type: 'tryCatch',
                    function: 'removeEventListener'
                })
            }

            return func.apply(this, args);
        };
    }

    private breadcrumbConsole() {
        let self = this;
        ['debug', 'info', 'warn', 'error', 'log'].forEach(level => {
            this.rewriteFn(console, level, (func: Function) => {
                return (...args: any) => {
                    self.captureBreadcrumb({
                        type: 'console',
                        detail: {
                            level,
                            message: args[0],
                            page: {
                                url: getLocationHref(),
                            }
                        }
                    });

                    // IE9 不允许console.log.apply
                    // 参考: https://stackoverflow.com/questions/5472938/does-ie9-support-console-log-and-is-it-a-real-function#answer-5473193
                    Function.prototype.apply.call(func, console, args);
                }
            });
        });
    }

    private installPromiseRejectHandler() {
        this.promiseRejectHandler = this.promiseRejectHandler.bind(this);
        WINDOW.addEventListener &&
            WINDOW.addEventListener('unhandledrejection', this.promiseRejectHandler);

        return this;
    }

    private promiseRejectHandler(e: PromiseRejectionEvent) {
        this.captureError(e.reason || '', {
            type: 'promiseError'
        });
    }

    private installBreadcrumb() {
        // 记录点击事件
        WINDOW.addEventListener('click', this.breadcrumbEventHandler('click'), false);

        // 记录keydown事件
        WINDOW.addEventListener('keypress', this.keypressEventHandler(), false);

        // 记录页面切换事件
        WINDOW.addEventListener('hashchange', e => {
            this.captureBreadcrumb({
                type: 'navigation',
                detail: {
                    page: {
                        from: e.oldURL,
                        to: e.newURL
                    }
                }
            });
        });

        // 记录console信息
        // this.breadcrumbConsole();
        return this;
    }

    private breadcrumbEventHandler(evtName: string): any {
        return (evt: MouseEvent) => {
            let target;
            try {
                target = htmlTreeAsString(evt.target);
            } catch (e) {
                target = '<unknown>';
            }

            this.captureBreadcrumb({
                type: evtName,
                detail: {
                    target,
                    page: {
                        url: getLocationHref(),
                    },
                    outerText: (evt.target as any).outerText,
                    outerHTML: (evt.target as any).outerHTML,
                    value: (evt.target as any).value,
                }
            });
        };
    }

    private keypressEventHandler() {
        return (evt: KeyboardEvent) => {
            if (!this.keypressTimer){
                this.breadcrumbEventHandler('input')(evt)
            }
            else {
                clearTimeout(this.keypressTimer)
            }

            this.keypressTimer = setTimeout(() => {
                this.keypressTimer = null;
            }, this.keypressDebounce)
        }
    }

    public captureBreadcrumb(value: BreadCrumb) {
        const breadCrumb = {
            ...value,
            time: Date.now()
        };
        this.breadcrumbs.push(breadCrumb);
        if (this.breadcrumbs.length > this.maxBreadcrumbs) {
            this.breadcrumbs.shift();
        }
    }

    public addPlugin(plugin: SentinelPlugin, ...args: Array<any>) {
        // 如果没有执行install，先保存插件，install的时候执行插件
        this.plugins.push([plugin, args]);
        if (this.isSentinelInstalled) {
            this.drainPlugins();
        }

        return this;
    }

    private drainPlugins() {
        this.plugins.forEach(plugin => {
            const installer = plugin[0];
            const params = plugin[1];

            // 执行插件函数
            installer.apply(this, [this].concat(params));
        });
    }

    /**
     * 将回调函数用try catch包裹，捕获错误
     *
     * @param {object} options 捕获函数相关信息
     * @param {function} fun try catch包裹的回调函数
     * @param {function} handler 回调函数执行时，handler函数也执行，相当于回调函数功能扩展
     */
    private wrapTryCatch(options: Capture, func: wrapFunc, handler?: Function) {
        const self = this;
        if (!isFunction(func)) {
            return func;
        }
        if (func.__is_wrappped__) {
            return func;
        }
        if (func.__cb_wrapper__) {
            return func.__cb_wrapper__;
        }
        
        function cbWrapper(this: any) {
            if (handler && isFunction(handler)) {
                handler.apply(null, arguments);
            }
            let args = Array.prototype.slice.call(arguments);
            try {
                func.apply(this, args);
            } catch(e) {
                self.captureError(e, options);
                throw e
            }
        }
        // 标记已经被try catch包裹
        cbWrapper.__is_wrappped__ = true;

        // 保存重写后的函数
        func.__cb_wrapper__ = cbWrapper;

        return cbWrapper;
    }

    // 主动捕获错误
    public async captureError(e: any, options: Capture) {

        // 处理错误信息的格式
        let stack = isError(e) ? computedStack(e) : e;

        // 忽略的api不上报
        if (stack && stack.type === 'ajaxError') {
            const isIgnoreApi = this.config.ignoreApis!.some(api => {
                return stack.url.indexOf(api) > -1;
            });
            if (isIgnoreApi) {
                return;
            }
        }

        // 忽略的错误不上报
        const isIgnoreError = this.config.ignoreErrors!.some(error => {
            return error.test && error.test(stack && stack.message);
        });

        if (isIgnoreError) {
            return;
        }

        const data = {
            webId: this.config.id,
            timestamp: Date.now(),
            breadCrumbs: this.breadcrumbs,
            capture: options,
            value: stack,
            userAgent: WINDOW.navigator && WINDOW.navigator.userAgent,
            system: getSystem(),
            url: getLocationHref(),
            title: document && document.title
        };

        // 如果开启了indexedDB,使用indexedDB存储错误信息
        if (this.config.offlineLog || this.config.screenShot) {
            let result: Collection = await this.DB!.getLogs('error');
            const isRepeat = result['error'] && result['error'].some(err =>
                JSON.stringify(err.value) === JSON.stringify(stack)
            );
            if (isRepeat) {
                return;
            }
        }
        else {
             // 相同的错误只发送一次
            let allErrors = this.allErrors;
            if (allErrors.indexOf(JSON.stringify(stack)) > -1) {
                return;
            }
        }

        // 抽样上报
        if (Math.random() >= this.config.random!) {
            return;
        }

        setTimeout(() => {
            this.send(data);
        }, this.config.delay);
    }

    // 发送请求
    private async send(data: ExData) {
        // 只在接口报错时上报录屏
        if (this.config.screenShot && (data.value.type === 'ajaxError')) {
            let store: Collection = await this.DB!.getLogs('screenShot');
            let length = Math.round(this.config.screenShotTime! / this.checkoutEveryNms) - 1;
            let result = store.screenShot && store.screenShot.slice(-length) || [];
            let screenShot: Array<any> = [];
            result.forEach(item => {
                screenShot = screenShot.concat(item.value);
            });
            data.screenShot = screenShot.concat(this.events);
        }
        if (data.value.type === 'ajaxError') {
            data.requestId = data.value.requestId;
        }
        if (this.config.offlineLog || this.config.screenShot) {
            this.DB!.addLog(data, 'error');
        }
        else {
            this.allErrors.push(JSON.stringify(data.value));
        }
        if (window.fetch) {
            fetch(this.config.url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({extraInfo: data})
            });
        }
    }

    public uninstall() {
        // 卸载全局异常监控
        this.uninstallGlobalErrorsHandler();

        // 卸载promise异常监控
        this.uninstallPromiseRejectHandler();

        // 还原重写的函数
        this.restoreFunctions();

        // 卸载ajax监听
        Ajax.uninstall();

        if (this.config.screenShot) {
            this.screenStop && this.screenStop();
        }

        this.isSentinelInstalled = false;

        clearTimeout(this.clearScreenTimer as NodeJS.Timeout);
        clearTimeout(this.observeTimer as NodeJS.Timeout);

        return this;
    }

    private uninstallGlobalErrorsHandler() {
        WINDOW.removeEventListener
            && WINDOW.removeEventListener('error', this.globalErrorHandler, true);

        return this;
    }

    private uninstallPromiseRejectHandler() {
        WINDOW.removeEventListener
            && WINDOW.removeEventListener('unhandledrejection', this.promiseRejectHandler);

        return this;
    }

    private restoreFunctions() {
        let wrapedFunctions = this.wrapedFunctions;
        wrapedFunctions.forEach(item => {
            let obj = item[0];
            let name = item[1];
            let fn = item[2];
            obj[name] = fn;
        });

        return this;
    }

    public async sendOfflineLog() {
        if (this.config.offlineLog) {
            const data: Collection = await this.DB!.getLogs('error');
            // this.send(data);
        }
    }
}

const sentinel = new Sentinel();

export default sentinel;