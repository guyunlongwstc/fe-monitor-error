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

