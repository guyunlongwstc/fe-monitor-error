/**
 * ts声明文件
 *
 * @file offlineDB.d.ts
 * @author guyunlong(guyunlong@baidu.com)
 */

import {ExData, ScreenShotData, Collection} from '../types/index';

export interface Offline {
    init(): Promise<{}> | null;
    getLogs(name: string): Promise<Collection>;
    clearLogs(name: string, offlineLogExp?: number): void;
    addLog(log: ExData | ScreenShotData, name: string): void;
    updateLog(log: ExData | ScreenShotData, name: string): void;
    getStore(name: string): IDBObjectStore | null;
    closeDB():void;
}

export interface OffLineResult {
    [key: string]: any;
}
