/**
 * 离线日志上报
 *
 * @file offline.js
 * @author guyunlong(guyunlong@baidu.com)
 */

import {ExData, ScreenShotData, Collection} from '../types/index';
import {Offline, OffLineResult} from '../types/offlineDB'

class OffLineDB implements Offline {
    public db: IDBDatabase | null
    private result: OffLineResult
    private storeNames: Array<string>

    constructor() {
        this.db = null;
        this.result = {};

        // store表名，按照错误类型分类
        this.storeNames = [
            'error', // 存储所有错误信息
            'screenShot' // 缓存所有录屏信息，定时清理
        ]
    }

    // 初始化indexedDB, 获取sentinel数据库
    init() {
        if (window.indexedDB) {
            return new Promise<Offline>((resolve, reject) => {
                if (this.db) {
                    resolve(this);
                }
                const request = window.indexedDB.open('sentinel', 3);
                request.onsuccess = e => {
                    this.db = (e.target as any).result;
                    resolve(this)
                }
                request.onerror = e => {
                    reject(e);
                }

                // 创建数据库以及版本更新时调用
                request.onupgradeneeded = e => {
                    this.db = (e.target as any).result;
                    this.storeNames.forEach(name => {
                        if(!(this.db && this.db.objectStoreNames.contains(name))){
                            // createObjectStore只能在versionChange事件中调用
                            if (name === 'screenShot') {
                                this.db && this.db.createObjectStore(name, {keyPath: 'id'});
                            }
                            else {
                                this.db && this.db.createObjectStore(name, {autoIncrement: true});
                            }
                        }
                    })
                }
            })
        }
        
        return null;
    }

    /**
     * 根据表名获取日志信息
     *
     * @param {string} name 表名 为空时获取全部表日志信息
     */
    public getLogs(name: string): Promise<Collection> {
        return new Promise((resolve, reject) => {
            const storeNames = name ? [name] : this.storeNames;
            this.result = {};
            storeNames.forEach(name => {
                const store = this.getStore(name);
                if (store) {
                    const request = store.openCursor();
                    request.onsuccess = e => {
                        const cursor = (e.target as any).result;
                        if (cursor) {
                            this.result[name] = this.result[name] || [];
                            this.result[name].push(cursor.value)
                            cursor.continue();
                        }else {
                            if (name === storeNames[storeNames.length -1]) {
                                resolve(this.result);
                            }
                        }
                    };

                    request.onerror = e => {
                        reject(e);
                    };
                }
            });
        })
    }

    /**
     * 清除数据库
     *
     * @param {string} name 表名，为空时清除所有表数据
     * @param {int} offlineLogExp 有效日期
     */
    public clearLogs(name: string, offlineLogExp = 0) {
        const storeNames = name ? [name] : this.storeNames;
        storeNames.forEach(name => {
            let store= this.getStore(name);
            if (store) {
                if (!offlineLogExp) {
                    store.clear();
                    return ;
                }
                let range = (Date.now() - offlineLogExp * 24 * 3600 * 1000);
                const request = store.openCursor();
                request.onsuccess = e => {
                    let cursor = (e.target as any).result;
                    if (cursor && (cursor.value.timestamp < range || !cursor.value.timestamp)) {
                        store && store.delete(cursor.primaryKey);
                        cursor.continue();
                    }
                };
            }
            
        })
    }

    /**
     * 添加错误日志到数据库中
     *
     * @param {object} log 错误信息
     * @param {string} name 表名
     */
    public addLog(log: ExData | ScreenShotData, name: string) {
        if (!this.db) {
            return;
        }
        const store = this.getStore(name);
        store && store.add(log);
    }

    /**
     * 更新错误日志到数据库中
     *
     * @param {Object} log 错误信息
     * @param {string} name 表名
     */
    public updateLog(log: ExData | ScreenShotData, name: string) {
        if (!this.db) {
            return;
        }
        const store = this.getStore(name);
        store && store.put(log);
    }

    /**
     * 根据表名获取store
     *
     * @param {string} name 表名
     */
    public getStore(name: string): IDBObjectStore | null {
        if (this.db) {
            const transaction = this.db.transaction(name, 'readwrite');
            return transaction.objectStore(name);
        }

        return null;
        
    }

    /**
     * 关闭数据库
     *
     * @param {int} offlineLogExp 有效日期
     */
    public closeDB() {
        this.db && this.db.close();
    }
}

export default new OffLineDB();
