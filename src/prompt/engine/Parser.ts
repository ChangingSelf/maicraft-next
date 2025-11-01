/**
 * 模板语法分析器
 *
 * 负责将词法单元（Token）解析为抽象语法树（AST）
 * 构建模板的语法结构，为后续编译做准备
 */

import { Token, TokenType, Lexer } from './Lexer';
import { TemplateAST } from '../types';
import { PromptErrorFactory, PromptErrorType } from '../errors/PromptError';

/**
 * 语法分析器配置
 */
export interface ParserConfig {
  /** 是否启用严格模式 */
  strict: boolean;
  /** 最大嵌套深度 */
  maxDepth: number;
  /** 是否允许空变量 */
  allowEmptyVariables: boolean;
}

/**
 * 默认语法分析器配置
 */
export const DEFAULT_PARSER_CONFIG: ParserConfig = {
  strict: true,
  maxDepth: 100,
  allowEmptyVariables: false,
};

/**
 * 模板语法分析器
 */
export class Parser {
  private config: ParserConfig;
  private tokens: Token[] = [];
  private current: number = 0;
  private depth: number = 0;

  constructor(config: Partial<ParserConfig> = {}) {
    this.config = { ...DEFAULT_PARSER_CONFIG, ...config };
  }

  /**
   * 解析词法单元为AST
   */
  parse(tokens: Token[]): TemplateAST {
    this.tokens = tokens;
    this.current = 0;
    this.depth = 0;

    const ast = this.parseRoot();

    // 检查是否还有未处理的token
    if (!this.isAtEnd()) {
      const token = this.peek();
      throw PromptErrorFactory.invalidTemplate(`Unexpected token: ${token.type} at line ${token.line}, column ${token.column}`, {
        line: token.line,
        column: token.column,
      });
    }

    return ast;
  }

  /**
   * 解析根节点
   */
  private parseRoot(): TemplateAST {
    const children: TemplateAST[] = [];

    while (!this.isAtEnd() && this.peek().type !== TokenType.EOF) {
      const node = this.parseNode();
      if (node) {
        children.push(node);
      }
    }

    return {
      type: 'root',
      value: '',
      children,
      position: {
        line: 1,
        column: 1,
        offset: 0,
      },
    };
  }

  /**
   * 解析节点
   */
  private parseNode(): TemplateAST | null {
    if (this.depth >= this.config.maxDepth) {
      throw PromptErrorFactory.invalidTemplate(`Maximum nesting depth (${this.config.maxDepth}) exceeded`);
    }

    const token = this.advance();

    switch (token.type) {
      case TokenType.TEXT:
        return this.createTextNode(token);

      case TokenType.VARIABLE:
        return this.createVariableNode(token);

      case TokenType.CONDITIONAL_START:
        return this.parseConditional(token);

      case TokenType.LOOP_START:
        return this.parseLoop(token);

      case TokenType.INCLUDE:
        return this.createIncludeNode(token);

      case TokenType.CONDITIONAL_ELSE:
      case TokenType.CONDITIONAL_END:
      case TokenType.LOOP_END:
      case TokenType.EOF:
        // 这些token不应该在这个层级处理，回退
        this.current--;
        return null;

      default:
        throw PromptErrorFactory.invalidTemplate(`Unexpected token: ${token.type} at line ${token.line}, column ${token.column}`, {
          line: token.line,
          column: token.column,
        });
    }
  }

  /**
   * 创建文本节点
   */
  private createTextNode(token: Token): TemplateAST {
    return {
      type: 'text',
      value: token.value,
      position: {
        line: token.line,
        column: token.column,
        offset: token.offset,
      },
    };
  }

  /**
   * 创建变量节点
   */
  private createVariableNode(token: Token): TemplateAST {
    if (!this.config.allowEmptyVariables && token.value.trim() === '') {
      throw PromptErrorFactory.invalidTemplate(`Empty variable at line ${token.line}, column ${token.column}`, {
        line: token.line,
        column: token.column,
      });
    }

    return {
      type: 'variable',
      value: token.value.trim(),
      position: {
        line: token.line,
        column: token.column,
        offset: token.offset,
      },
    };
  }

  /**
   * 解析条件结构
   */
  private parseConditional(startToken: Token): TemplateAST {
    this.depth++;

    const condition = startToken.value;
    const children: TemplateAST[] = [];
    let elseChildren: TemplateAST[] = [];
    let inElse = false;

    while (!this.isAtEnd() && !this.check(TokenType.CONDITIONAL_END)) {
      if (this.check(TokenType.CONDITIONAL_ELSE)) {
        if (inElse) {
          throw PromptErrorFactory.invalidTemplate(`Multiple else blocks in conditional at line ${startToken.line}, column ${startToken.column}`, {
            line: startToken.line,
            column: startToken.column,
          });
        }
        this.advance(); // 消耗 else token
        inElse = true;
        continue;
      }

      const node = this.parseNode();
      if (node) {
        if (inElse) {
          elseChildren.push(node);
        } else {
          children.push(node);
        }
      }
    }

    if (this.isAtEnd()) {
      throw PromptErrorFactory.invalidTemplate(`Unclosed conditional block starting at line ${startToken.line}, column ${startToken.column}`, {
        line: startToken.line,
        column: startToken.column,
      });
    }

    this.advance(); // 消耗 conditional_end token
    this.depth--;

    return {
      type: 'conditional',
      value: condition,
      children: children.length > 0 ? children : undefined,
      position: {
        line: startToken.line,
        column: startToken.column,
        offset: startToken.offset,
      },
      // 将else分支作为特殊属性存储
      ...(elseChildren.length > 0 && { else: elseChildren }),
    };
  }

  /**
   * 解析循环结构
   */
  private parseLoop(startToken: Token): TemplateAST {
    this.depth++;

    // 解析循环表达式，支持 "item in items" 或 "items" 格式
    const loopExpr = startToken.value.trim();
    let variable: string;
    let collection: string;

    if (loopExpr.includes(' in ')) {
      const parts = loopExpr.split(' in ');
      if (parts.length !== 2) {
        throw PromptErrorFactory.invalidTemplate(`Invalid loop expression: '${loopExpr}' at line ${startToken.line}, column ${startToken.column}`, {
          line: startToken.line,
          column: startToken.column,
        });
      }
      variable = parts[0].trim();
      collection = parts[1].trim();
    } else {
      variable = 'item';
      collection = loopExpr;
    }

    const children: TemplateAST[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.LOOP_END)) {
      const node = this.parseNode();
      if (node) {
        children.push(node);
      }
    }

    if (this.isAtEnd()) {
      throw PromptErrorFactory.invalidTemplate(`Unclosed loop block starting at line ${startToken.line}, column ${startToken.column}`, {
        line: startToken.line,
        column: startToken.column,
      });
    }

    this.advance(); // 消耗 loop_end token
    this.depth--;

    return {
      type: 'loop',
      value: JSON.stringify({ variable, collection }),
      children: children.length > 0 ? children : undefined,
      position: {
        line: startToken.line,
        column: startToken.column,
        offset: startToken.offset,
      },
    };
  }

  /**
   * 创建包含节点
   */
  private createIncludeNode(token: Token): TemplateAST {
    const templateName = token.value.trim();

    if (!templateName) {
      throw PromptErrorFactory.invalidTemplate(`Empty include directive at line ${token.line}, column ${token.column}`, {
        line: token.line,
        column: token.column,
      });
    }

    return {
      type: 'include',
      value: templateName,
      position: {
        line: token.line,
        column: token.column,
        offset: token.offset,
      },
    };
  }

  /**
   * 检查当前token类型
   */
  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  /**
   * 前进到下一个token
   */
  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  /**
   * 查看当前token
   */
  private peek(): Token {
    return this.tokens[this.current];
  }

  /**
   * 查看前一个token
   */
  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  /**
   * 检查是否到达末尾
   */
  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF || this.current >= this.tokens.length;
  }

  /**
   * 验证AST结构
   */
  static validate(ast: TemplateAST): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const validateNode = (node: TemplateAST, depth: number = 0): void => {
      if (depth > 50) {
        // 防止无限递归
        errors.push('AST nesting depth too deep');
        return;
      }

      if (!node.type) {
        errors.push(`Node missing type at position ${JSON.stringify(node.position)}`);
        return;
      }

      // 验证条件结构
      if (node.type === 'conditional') {
        if (!node.value || node.value.trim() === '') {
          errors.push(`Conditional node missing condition at position ${JSON.stringify(node.position)}`);
        }
      }

      // 验证循环结构
      if (node.type === 'loop') {
        try {
          const loopConfig = JSON.parse(node.value);
          if (!loopConfig.collection || loopConfig.collection.trim() === '') {
            errors.push(`Loop node missing collection at position ${JSON.stringify(node.position)}`);
          }
        } catch (e) {
          errors.push(`Invalid loop configuration at position ${JSON.stringify(node.position)}`);
        }
      }

      // 验证包含结构
      if (node.type === 'include') {
        if (!node.value || node.value.trim() === '') {
          errors.push(`Include node missing template name at position ${JSON.stringify(node.position)}`);
        }
      }

      // 递归验证子节点
      if (node.children) {
        node.children.forEach(child => validateNode(child, depth + 1));
      }
    };

    validateNode(ast);
    return { valid: errors.length === 0, errors };
  }

  /**
   * 获取AST统计信息
   */
  static getStatistics(ast: TemplateAST): {
    totalNodes: number;
    nodeCounts: Record<string, number>;
    maxDepth: number;
  } {
    const counts: Record<string, number> = {};
    let maxDepth = 0;

    const analyzeNode = (node: TemplateAST, depth: number = 0): void => {
      maxDepth = Math.max(maxDepth, depth);
      counts[node.type] = (counts[node.type] || 0) + 1;

      if (node.children) {
        node.children.forEach(child => analyzeNode(child, depth + 1));
      }
    };

    analyzeNode(ast);

    return {
      totalNodes: Object.values(counts).reduce((sum, count) => sum + count, 0),
      nodeCounts: counts,
      maxDepth,
    };
  }
}
