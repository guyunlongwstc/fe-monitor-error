/**
 * ts声明文件
 *
 * @file utils.d.ts
 * @author guyunlong(guyunlong@baidu.com)
 */

export interface Ex extends Error {
    name: string;
    message: string;
    [key: string]: any;
}

export interface Stack {
    url: string | null;
    func?: string;
    args?: string[];
    line?: number | null;
    column?: number | null;
}

export interface ParseError {
    type: string;
    message: string;
    url?: string;
    stack: Array<Stack>;
    [key: string]: any;
}
