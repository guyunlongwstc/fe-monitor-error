/**
 * 通用方法
 *
 * @file until.js
 * @author guyunlong(guyunlong@baidu.com)
 */

import {Ex, ParseError} from '../types/utils';

/* global getLocationOrigin*/
const UNKNOWN_FUNCTION: string = '?';

const isError = (value: any): boolean => {
    switch (Object.prototype.toString.call(value)) {
        case '[object Error]':
            return true;
        case '[object Exception]':
            return true;
        case '[object DOMException]':
            return true;
        default:
            return value instanceof Error;
    }
};

// 解析error为想要的格式
const computedStack = (ex: Ex): ParseError | null => {
    if (typeof ex.stack === 'undefined' || !ex.stack) return null;

    let chrome = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|[a-z]:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
    let winjs = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx(?:-web)|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
    // NOTE: blob urls are now supposed to always have an origin, therefore it's format
    // which is `blob:http://url/path/with-some-uuid`, is matched by `blob.*?:\/` as well
    let gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js))(?::(\d+))?(?::(\d+))?\s*$/i;
    // Used to additionally parse URL/line/column from eval frames
    let geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
    let chromeEval = /\((\S*)(?::(\d+))(?::(\d+))\)/;
    let lines = ex.stack.split('\n');
    let stack = [];
    let submatch;
    let parts;
    let element;
    // let reference = /^(.*) is undefined$/.exec(ex.message);

    for (let i = 0, j = lines.length; i < j; ++i) {
        if ((parts = chrome.exec(lines[i]))) {
            let isNative = parts[2] && parts[2].indexOf('native') === 0; // start of line
            let isEval = parts[2] && parts[2].indexOf('eval') === 0; // start of line
            if (isEval && (submatch = chromeEval.exec(parts[2]))) {
                // throw out eval line/column and use top-most line/column number
                parts[2] = submatch[1]; // url
                parts[3] = submatch[2]; // line
                parts[4] = submatch[3]; // column
            }
            element = {
                url: !isNative ? parts[2] : null,
                func: parts[1] || UNKNOWN_FUNCTION,
                args: isNative ? [parts[2]] : [],
                line: parts[3] ? +parts[3] : null,
                column: parts[4] ? +parts[4] : null
            };
        } else if ((parts = winjs.exec(lines[i]))) {
            element = {
                url: parts[2],
                func: parts[1] || UNKNOWN_FUNCTION,
                args: [],
                line: +parts[3],
                column: parts[4] ? +parts[4] : null
            };
        } else if ((parts = gecko.exec(lines[i]))) {
            let isEvaled = parts[3] && parts[3].indexOf(' > eval') > -1;
            if (isEvaled && (submatch = geckoEval.exec(parts[3]))) {
                // throw out eval line/column and use top-most line number
                parts[3] = submatch[1];
                parts[4] = submatch[2];
                parts[5] = ''; // no column when eval
            } else if (i === 0 && !parts[5] && typeof ex.columnNumber !== 'undefined') {
                // FireFox uses this awesome columnNumber property for its top frame
                // Also note, Firefox's column number is 0-based and everything else expects 1-based,
                // so adding 1
                // NOTE: this hack doesn't work if top-most frame is eval
                stack[0].column = ex.columnNumber + 1;
            }
            element = {
                url: parts[3],
                func: parts[1] || UNKNOWN_FUNCTION,
                args: parts[2] ? parts[2].split(',') : [],
                line: parts[4] ? +parts[4] : null,
                column: parts[5] ? +parts[5] : null
            };
        } else {
                continue;
        }

        if (!element.func && element.line) {
            element.func = UNKNOWN_FUNCTION;
        }

        if (element.url && element.url.substr(0, 5) === 'blob:') {
            // Special case for handling JavaScript loaded into a blob.
            // We use a synchronous AJAX request here as a blob is already in
            // memory - it's not making a network request.  This will generate a warning
            // in the browser console, but there has already been an error so that's not
            // that much of an issue.
            let xhr = new XMLHttpRequest();
            xhr.open('GET', element.url, false);
            xhr.send(null);

            // If we failed to download the source, skip this patch
            if (xhr.status === 200) {
            let source = xhr.responseText || '';

            // We trim the source down to the last 300 characters as sourceMappingURL is always at the end of the file.
            // Why 300? To be in line with: https://github.com/getsentry/sentry/blob/4af29e8f2350e20c28a6933354e4f42437b4ba42/src/sentry/lang/javascript/processor.py#L164-L175
            source = source.slice(-300);

            // Now we dig out the source map URL
            let sourceMaps = source.match(/\/\/# sourceMappingURL=(.*)$/);

            // If we don't find a source map comment or we find more than one, continue on to the next element.
            if (sourceMaps) {
                let sourceMapAddress = sourceMaps[1];

                // Now we check to see if it's a relative URL.
                // If it is, convert it to an absolute one.
                if (sourceMapAddress.charAt(0) === '~') {
                sourceMapAddress = getLocationOrigin() + sourceMapAddress.slice(1);
                }

                // Now we strip the '.map' off of the end of the URL and update the
                // element so that Sentry can match the map to the blob.
                element.url = sourceMapAddress.slice(0, -4);
            }
            }
        }

        stack.push(element);
    }

    // if (!stack.length) {
    //     // return null;
    // }

    return {
        type: ex.name,
        message: ex.message,
        // url: getLocationHref(),
        stack: stack
    };
};

function getLocationOrigin() {
    if (typeof document === 'undefined' || document.location == null) return '';
  
    if (!document.location.origin) {
        return (
            document.location.protocol +
            '//' +
            document.location.hostname +
            (document.location.port ? ':' + document.location.port : '')
        );
    }
  
    return document.location.origin;
};

/**
 * 获取uuid
 *
 * @param {int} len id长度
 * @param {int} radix 2/10/16进制
 * @return {string} uuid
 */
const getUuid = (len: number, radix: number): string => {
    let chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
    let uuid = [];
    let i;
    radix = radix || chars.length;

    if (len) {
        for (i = 0; i < len; i++) uuid[i] = chars[0 | Math.random() * radix];
    } else {
        let r;
    
        uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
        uuid[14] = '4';
    
        for (i = 0; i < 36; i++) {
            if (!uuid[i]) {
                r = 0 | Math.random() * 16;
                uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r];
            }
        }
    }
    return uuid.join('');
};

const getLocationHref = (): string => {
    if (typeof document === 'undefined' || document.location == null) return '';
    return document.location.href;
};

const isFunction = (value: any): boolean => {
    return typeof value === 'function'
};

const isString = (value: any): boolean => {
    return Object.prototype.toString.call(value) === '[object String]';
};


/**
 * 解析element
 *
 * @param {EventTarget} elem 解析的元素
 * @return {string} 元素标签、classname、id...
 */
const htmlTreeAsString = (elem: EventTarget | null): string => {
    let MAX_TRAVERSE_HEIGHT = 5,
        MAX_OUTPUT_LEN = 80,
        out = [],
        height = 0,
        len = 0,
        separator = ' > ',
        sepLength = separator.length,
        nextStr;
    
    while (elem && height++ < MAX_TRAVERSE_HEIGHT) {
        nextStr = htmlElementAsString(elem);

        if (
            nextStr === 'html' ||
            (height > 1 && len + out.length * sepLength + nextStr.length >= MAX_OUTPUT_LEN)
        ) {
            break;
        }
    
        out.push(nextStr);
    
        len += nextStr.length;
        elem = (elem as any).parentNode;
    }
  
    return out.reverse().join(separator);
};
  
/**
 * 解析element
 *
 * @param {EventTarget} elem 解析的元素
 * @return {string} 元素标签、classname、id...
 */
const htmlElementAsString = (elem: EventTarget | null): string => {
    let out = [],
        className,
        classes,
        key,
        attr,
        i;
  
    if (!elem || !(elem as any).tagName) {
        return '';
    }
  
    out.push((elem as any).tagName.toLowerCase());
    if ((elem as any).id) {
        out.push('#' + (elem as any).id);
    }
  
    className = (elem as any).className;
    if (className && isString(className)) {
        classes = className.split(/\s+/);
        for (i = 0; i < classes.length; i++) {
            out.push('.' + classes[i]);
        }
    }
    let attrWhitelist = ['type', 'name', 'title', 'alt'];
    for (i = 0; i < attrWhitelist.length; i++) {
        key = attrWhitelist[i];
        attr = (elem as any).getAttribute(key);
        if (attr) {
            out.push('[' + key + '="' + attr + '"]');
        }
    }

    return out.join('');
};

/**
 * 获取系统版本
 *
 * @return {string} 系统版本
 */
const getSystem = (): string => {
    let sUserAgent = navigator.userAgent;
    let isWin = (navigator.platform == "Win32") || (navigator.platform == "Windows");
    let isMac = (navigator.platform == "Mac68K") || (navigator.platform == "MacPPC") || (navigator.platform == "Macintosh") || (navigator.platform == "MacIntel");
    if (isMac) return "Mac";
    let isUnix = (navigator.platform == "X11") && !isWin && !isMac;
    if (isUnix) return "Unix";
    let isLinux = (String(navigator.platform).indexOf("Linux") > -1);
    if (isLinux) return "Linux";
    if (isWin) {
        let isWin2K = sUserAgent.indexOf("Windows NT 5.0") > -1 || sUserAgent.indexOf("Windows 2000") > -1;
        if (isWin2K) return "Win2000";
        let isWinXP = sUserAgent.indexOf("Windows NT 5.1") > -1 || sUserAgent.indexOf("Windows XP") > -1;
        if (isWinXP) return "WinXP";
        let isWin2003 = sUserAgent.indexOf("Windows NT 5.2") > -1 || sUserAgent.indexOf("Windows 2003") > -1;
        if (isWin2003) return "Win2003";
        let isWinVista= sUserAgent.indexOf("Windows NT 6.0") > -1 || sUserAgent.indexOf("Windows Vista") > -1;
        if (isWinVista) return "WinVista";
        let isWin7 = sUserAgent.indexOf("Windows NT 6.1") > -1 || sUserAgent.indexOf("Windows 7") > -1;
        if (isWin7) return "Win7";
        let isWin10 = sUserAgent.indexOf("Windows NT 10") > -1 || sUserAgent.indexOf("Windows 10") > -1;
        if (isWin10) return "Win10";
    }
    return "other";
};

export {
    isError,
    computedStack,
    getLocationHref,
    getUuid,
    isFunction,
    isString,
    htmlTreeAsString,
    getSystem
};
