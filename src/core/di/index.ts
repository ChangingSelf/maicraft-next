/**
 * 依赖注入模块导出
 */

export { Container, Lifetime } from './Container';
export type { ServiceKey, Factory } from './Container';
export { ServiceKeys } from './ServiceKeys';
export type { ServiceTypeMap } from './ServiceKeys';
export { configureServices } from './bootstrap';
export { globalContainer } from './Container';
