/**
 * 元素筛选配置管理模块
 * 用于管理网页内容提取时的元素筛选规则
 */

import { syncStorageAdapter } from './storage-adapter.js';

// 存储键
const ELEMENT_FILTER_CONFIG_KEY = 'elementFilterConfig';

// 支持的选择器类型
export const SELECTOR_TYPES = {
    CSS_SELECTOR: 'css_selector',
    ELEMENT_ID: 'element_id',
    CLASS_NAME: 'class_name',
    XPATH: 'xpath',
    JS_PATH: 'js_path'
};

// 选择器类型的显示名称（由 i18n 处理）
export const SELECTOR_TYPE_LABELS = {
    [SELECTOR_TYPES.CSS_SELECTOR]: 'selector_type_css',
    [SELECTOR_TYPES.ELEMENT_ID]: 'selector_type_id',
    [SELECTOR_TYPES.CLASS_NAME]: 'selector_type_class',
    [SELECTOR_TYPES.XPATH]: 'selector_type_xpath',
    [SELECTOR_TYPES.JS_PATH]: 'selector_type_js_path'
};

/**
 * @typedef {Object} FilterRule
 * @property {string} id - 规则唯一ID
 * @property {string} type - 选择器类型
 * @property {string} value - 选择器值
 * @property {number} createdAt - 创建时间戳
 */

/**
 * @typedef {Object} ElementFilterConfig
 * @property {boolean} enabled - 是否启用元素筛选
 * @property {FilterRule[]} rules - 筛选规则列表
 */

/**
 * 生成唯一ID
 * @returns {string}
 */
function generateRuleId() {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取默认配置
 * @returns {ElementFilterConfig}
 */
function getDefaultConfig() {
    return {
        enabled: false,
        rules: []
    };
}

/**
 * 获取元素筛选配置
 * @returns {Promise<ElementFilterConfig>}
 */
export async function getElementFilterConfig() {
    try {
        const result = await syncStorageAdapter.get(ELEMENT_FILTER_CONFIG_KEY);
        const config = result?.[ELEMENT_FILTER_CONFIG_KEY];
        if (!config) {
            return getDefaultConfig();
        }
        // 确保配置结构完整
        return {
            enabled: typeof config.enabled === 'boolean' ? config.enabled : false,
            rules: Array.isArray(config.rules) ? config.rules : []
        };
    } catch (error) {
        console.error('获取元素筛选配置失败:', error);
        return getDefaultConfig();
    }
}

/**
 * 保存元素筛选配置
 * @param {ElementFilterConfig} config
 * @returns {Promise<void>}
 */
export async function setElementFilterConfig(config) {
    try {
        await syncStorageAdapter.set({
            [ELEMENT_FILTER_CONFIG_KEY]: {
                enabled: config.enabled,
                rules: config.rules
            }
        });
    } catch (error) {
        console.error('保存元素筛选配置失败:', error);
        throw error;
    }
}

/**
 * 设置启用状态
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export async function setElementFilterEnabled(enabled) {
    const config = await getElementFilterConfig();
    config.enabled = enabled;
    await setElementFilterConfig(config);
}

/**
 * 添加筛选规则
 * @param {string} type - 选择器类型
 * @param {string} value - 选择器值
 * @returns {Promise<FilterRule>}
 */
export async function addFilterRule(type, value) {
    const config = await getElementFilterConfig();
    const rule = {
        id: generateRuleId(),
        type,
        value,
        createdAt: Date.now()
    };
    config.rules.push(rule);
    await setElementFilterConfig(config);
    return rule;
}

/**
 * 更新筛选规则
 * @param {string} ruleId - 规则ID
 * @param {Object} updates - 更新内容 { type?, value? }
 * @returns {Promise<void>}
 */
export async function updateFilterRule(ruleId, updates) {
    const config = await getElementFilterConfig();
    const ruleIndex = config.rules.findIndex(r => r.id === ruleId);
    if (ruleIndex === -1) {
        throw new Error(`规则不存在: ${ruleId}`);
    }
    config.rules[ruleIndex] = {
        ...config.rules[ruleIndex],
        ...updates
    };
    await setElementFilterConfig(config);
}

/**
 * 删除筛选规则
 * @param {string} ruleId - 规则ID
 * @returns {Promise<void>}
 */
export async function removeFilterRule(ruleId) {
    const config = await getElementFilterConfig();
    config.rules = config.rules.filter(r => r.id !== ruleId);
    await setElementFilterConfig(config);
}

/**
 * 根据选择器类型和值获取目标元素
 * @param {Document} doc - 文档对象
 * @param {string} type - 选择器类型
 * @param {string} value - 选择器值
 * @returns {Element|null}
 */
function queryElementBySelector(doc, type, value) {
    if (!value || typeof value !== 'string') return null;
    
    try {
        switch (type) {
            case SELECTOR_TYPES.CSS_SELECTOR:
                return doc.querySelector(value);
            
            case SELECTOR_TYPES.ELEMENT_ID:
                // ID选择器：移除可能的前缀 #
                const id = value.replace(/^#/, '');
                return doc.getElementById(id);
            
            case SELECTOR_TYPES.CLASS_NAME:
                // 类名选择器：移除可能的前缀 .
                const className = value.replace(/^\./, '');
                return doc.querySelector(`.${CSS.escape(className)}`);
            
            case SELECTOR_TYPES.XPATH: {
                // XPath 求值
                const result = doc.evaluate(
                    value,
                    doc,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                );
                return result.singleNodeValue;
            }
            
            case SELECTOR_TYPES.JS_PATH:
                // JS Path 是 Chrome DevTools 使用的路径格式
                // 例如: document.querySelector("#content")
                // 我们尝试提取其中的选择器
                const match = value.match(/querySelector\(['"](.+?)['"]\)/);
                if (match && match[1]) {
                    return doc.querySelector(match[1]);
                }
                // 如果是直接的元素访问，如 document.getElementById('xxx')
                const idMatch = value.match(/getElementById\(['"](.+?)['"]\)/);
                if (idMatch && idMatch[1]) {
                    return doc.getElementById(idMatch[1]);
                }
                // 尝试直接执行（有安全风险，但用户自己输入）
                try {
                    const el = eval(value);
                    if (el instanceof Element) return el;
                } catch {
                    // 忽略执行错误
                }
                return null;
            
            default:
                return null;
        }
    } catch (error) {
        console.warn(`选择器执行失败 [${type}: ${value}]:`, error);
        return null;
    }
}

/**
 * 根据筛选规则获取所有匹配的元素
 * @param {Document} doc - 文档对象
 * @param {FilterRule[]} rules - 筛选规则列表
 * @returns {Element[]}
 */
export function getFilteredElements(doc, rules) {
    const elements = [];
    const seen = new Set();
    
    for (const rule of rules) {
        const el = queryElementBySelector(doc, rule.type, rule.value);
        if (el && el instanceof Element && !seen.has(el)) {
            elements.push(el);
            seen.add(el);
        }
    }
    
    return elements;
}

/**
 * 检查元素筛选是否启用且有规则
 * @returns {Promise<boolean>}
 */
export async function isElementFilterActive() {
    const config = await getElementFilterConfig();
    return config.enabled && config.rules.length > 0;
}
