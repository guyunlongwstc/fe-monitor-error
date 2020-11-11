/**
 * ts声明文件
 *
 * @file index.d.ts
 * @author guyunlong(guyunlong@baidu.com)
 */

declare namespace Sentinel {
    interface Win extends Window {
        [key: string]: any;
    }  
    
    interface Capture {
        type?: string;
        function?: string;
        handler?: string;
        extra?: any;
    }
    
    interface ExData {
        webId: string | number;
        requestId?: string | null;
        timestamp: number;
        capture: Capture;
        value: any;
        screenShot?: Array<any>;
    }
    
    interface ScreenShotData {
        id: number;
        value: Array<any>;
    }
    
    interface WrapedFunction {
        [index: number]: any;
    }
    
    interface Config {
        id: string;
        ignoreErrors?: Array<RegExp>;
        ignoreApis?: Array<string>;
        url: string;
        delay?: number;
        random?: number;
        screenShot?: boolean;
        screenShotTime?: number;
        offlineLog?: boolean;
        offlineLogExp?: number;
    }
    
    interface wrapFunc extends Function {
        __is_wrappped__: boolean;
        __cb_wrapper__: Function;
    }
    
    interface Collection {
        error?: Array<ExData>;
        screenShot?: Array<any>;
    }
    
    interface BreadCrumbDetail {
        method?: string;
        target?: string;
        level?: string;
        message?: string;
        url?: string;
        status?: number;
        statusText?: string;
        page: {
            url?: string;
            from?: string;
            to?: string;
        };
        outerText?: string;
        outerHTML?: string;
        value?: any;
    }
    
    interface BreadCrumb {
        type: string;
        detail?: BreadCrumbDetail;
    }
    
    interface XHR extends XMLHttpRequest {
        __xhr: {
            method: string;
            url: string;
        };
        __isAbort: boolean;
        [key: string]: any;
    }
    
    interface ProxyXhr extends XMLHttpRequest {
        xhr: XHR;
        [key: string]: any;
    }
    
    interface ProxyObj {
        onreadystatechange: ((xhr: XHR) => any) | null;
        open(args: Array<any>, xhr: XHR): void;
        send(args: Array<any>, xhr: XHR): void;
        [key: string]: any;
    }
    
    interface SentinelPlugin {
        (raven: SentinelStatic, ...args: any[]): SentinelStatic;
    }
    
    class SentinelStatic {
        install(config: Config): Promise<this>;
        captureError(e: any, options: Capture): void;
        captureBreadcrumb(value: BreadCrumb): void;
        addPlugin(plugin: SentinelPlugin, ...pluginArgs: any[]): this;
        sendOfflineLog(): any; 
        uninstall(): this;
    }
}

export = Sentinel;

