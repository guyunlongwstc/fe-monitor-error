# fe-monitor-error
前端异常监控采集sdk

# 安装
### npm安装
```
$ npm install fe-monitor-error 
```

### CDN

```
<script src="https://cdn.jsdelivr.net/npm/fe-monitor-error@(version)/lib/sentinel.js"></script>
<!-- 例如 -->
<script src="https://cdn.jsdelivr.net/npm/fe-monitor-error@1.0.0-rc.2/lib/sentinel.js"></script>
```

# 使用方式
```js
import sentinel from 'fe-monitor-error';
sentinel.install({
    url: '/someApi',
    screenShot: true
})

```

# 配置参数
参数名 | 描述 |  类型  | 默认值 |
-|-|-|-|
id | 网站id(创建网站时后端生成) | string | -- |
url | 上报地址 | string | -- |
delay | 上报延迟时间（ms） | int | 2000 |
ignoreErrors | 忽略的错误类型 | array | [] |
random | 抽样上报（0-1） | float | -- | 1 |
screenShot | 是否开启录屏  | bool | false |
screenShotTime | 录屏时间（ms） | number | 10000 |
offlineLog | 是否开启离线日志存储 | bool | false |
offlineLogExp | 离线日志存储时间（单位天） | float | 7 |

# 上报数据格式
```json
    {
        "timestamp": 1566527694723,
        "screenShot": [],
        "breadCrumbs": [],
        "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.87 Safari/537.36",
        "url": "http://localhost.bcetest.baidu.com:8889/cos",
        "title": "百度智能云-管理中心",
        "capture": {
            "function": "setTimeout",
            "type": "onunhandledrejection"
        },
        "system": "Mac",
        "value": {
            "message": "fdsfs is not defined",
            "type": "ReferenceError",
            "stack": [
                {
                    "column": 9,
                    "func": "?",
                    "line": 1704,
                    "url": "http://localhost:8889/demo/bootstrap.js"
                },
                {
                    "column": 22,
                    "func": "cbWrapper",
                    "line": 11780,
                    "url": "http://localhost:8889/demo/bootstrap.js"
                }
            ],
            "url": "http://localhost.bcetest.baidu.com:8889/demo"
        }

    }
```

# 上报参数说明

参数名 | 描述 |  类型 
-|-|-
webId | 上报id | string |
timestamp | 时间戳 | string |
screenShot | 录屏信息 | array |
breadCrumbs | 用户行为信息 | array |
url | 网站地址 | string |
userAgent | userAgent | string |
system | 操作系统 | string |
title | 网站title | string |
capture | 捕获函数相关信息 | object |
--function | 错误的函数 | int |
--type | 捕获错误的类型（"wrapTryCatch", "onerror", "onunhandledrejection", "resourceError", "ajaxError"...） | string |
value | 错误的具体信息 | object |
--message | 错误信息 | string |
--duration | 耗时 | int |
--type | 错误类型（"ReferenceError", "TypeError", "SyntaxError", "RangeError"...） | string |
--stack | 错误堆栈信息 | object |
----column | 错误所在列数 | int |
----line | 错误所在行数 | int |
----url | 错误所在文件 | string |
----func | 错误所在函数 | string |
--currentPage | 当前页面 | string |