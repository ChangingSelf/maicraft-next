/**
 * 模板词法分析器
 *
 * 负责将模板字符串解析为词法单元（Token）
 * 支持变量、条件、循环、包含等语法结构
 */

import { PromptErrorFactory, PromptErrorType } from '../errors/PromptError';

/**
 * 词法单元类型
 */
export enum TokenType {
  TEXT = 'text',
  VARIABLE = 'variable',
  CONDITIONAL_START = 'conditional_start',
  CONDITIONAL_ELSE = 'conditional_else',
  CONDITIONAL_END = 'conditional_end',
  LOOP_START = 'loop_start',
  LOOP_END = 'loop_end',
  INCLUDE = 'include',
  COMMENT = 'comment',
  EOF = 'eof',
}

/**
 * 词法单元接口
 */
export interface Token {
  /** 词法单元类型 */
  type: TokenType;
  /** 词法单元值 */
  value: string;
  /** 起始位置（行号） */
  line: number;
  /** 起始位置（列号） */
  column: number;
  /** 起始位置（偏移量） */
  offset: number;
  /** 结束位置（偏移量） */
  endOffset: number;
}

/**
 * 词法分析器配置
 */
export interface LexerConfig {
  /** 变量开始标记 */
  variableStart: string;
  /** 变量结束标记 */
  variableEnd: string;
  /** 条件开始标记 */
  conditionalStart: string;
  /** 条件结束标记 */
  conditionalEnd: string;
  /** 条件else标记 */
  conditionalElse: string;
  /** 循环开始标记 */
  loopStart: string;
  /** 循环结束标记 */
  loopEnd: string;
  /** 包含标记 */
  include: string;
  /** 注释开始标记 */
  commentStart: string;
  /** 注释结束标记 */
  commentEnd: string;
  /** 是否忽略大小写 */
  ignoreCase: boolean;
}

/**
 * 默认词法分析器配置
 */
export const DEFAULT_LEXER_CONFIG: LexerConfig = {
  variableStart: '${',
  variableEnd: '}',
  conditionalStart: '${#if',
  conditionalEnd: '${/if}',
  conditionalElse: '${else}',
  loopStart: '${#each',
  loopEnd: '${/each}',
  include: '${include',
  commentStart: '${!--',
  commentEnd: '--}',
  ignoreCase: false,
};

/**
 * 模板词法分析器
 */
export class Lexer {
  private config: LexerConfig;
  private input: string = '';
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(config: Partial<LexerConfig> = {}) {
    this.config = { ...DEFAULT_LEXER_CONFIG, ...config };
  }

  /**
   * 分析模板字符串
   */
  tokenize(input: string): Token[] {
    this.input = input;
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];

    while (this.position < this.input.length) {
      const char = this.input[this.position];

      if (this.isAtSequence(this.config.variableStart)) {
        this.tokenizeVariable();
      } else if (this.isAtSequence(this.config.conditionalStart)) {
        this.tokenizeConditionalStart();
      } else if (this.isAtSequence(this.config.conditionalElse)) {
        this.tokenizeConditionalElse();
      } else if (this.isAtSequence(this.config.conditionalEnd)) {
        this.tokenizeConditionalEnd();
      } else if (this.isAtSequence(this.config.loopStart)) {
        this.tokenizeLoopStart();
      } else if (this.isAtSequence(this.config.loopEnd)) {
        this.tokenizeLoopEnd();
      } else if (this.isAtSequence(this.config.include)) {
        this.tokenizeInclude();
      } else if (this.isAtSequence(this.config.commentStart)) {
        this.tokenizeComment();
      } else {
        this.tokenizeText();
      }
    }

    this.addToken(TokenType.EOF, '', this.position, this.position);
    return this.tokens;
  }

  /**
   * 分析文本
   */
  private tokenizeText(): void {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    while (this.position < this.input.length) {
      // 检查是否到达特殊标记的开始
      if (
        this.isAtSequence(this.config.variableStart) ||
        this.isAtSequence(this.config.conditionalStart) ||
        this.isAtSequence(this.config.conditionalElse) ||
        this.isAtSequence(this.config.conditionalEnd) ||
        this.isAtSequence(this.config.loopStart) ||
        this.isAtSequence(this.config.loopEnd) ||
        this.isAtSequence(this.config.include) ||
        this.isAtSequence(this.config.commentStart)
      ) {
        break;
      }

      const char = this.input[this.position];
      if (char === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }

    const text = this.input.slice(start, this.position);
    if (text.length > 0) {
      this.addToken(TokenType.TEXT, text, start, this.position - 1, startLine, startColumn);
    }
  }

  /**
   * 分析变量
   */
  private tokenizeVariable(): void {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    this.position += this.config.variableStart.length;
    this.column += this.config.variableStart.length;

    const value = this.extractUntil(this.config.variableEnd);

    if (value === null) {
      throw PromptErrorFactory.invalidTemplate(`Unclosed variable, expected '${this.config.variableEnd}'`, { line: startLine, column: startColumn });
    }

    this.addToken(TokenType.VARIABLE, value.trim(), start, this.position - 1, startLine, startColumn);
  }

  /**
   * 分析条件开始
   */
  private tokenizeConditionalStart(): void {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    this.position += this.config.conditionalStart.length;
    this.column += this.config.conditionalStart.length;

    const value = this.extractUntil(this.config.variableEnd);

    if (value === null) {
      throw PromptErrorFactory.invalidTemplate(`Unclosed conditional start, expected '${this.config.variableEnd}'`, {
        line: startLine,
        column: startColumn,
      });
    }

    this.addToken(TokenType.CONDITIONAL_START, value.trim(), start, this.position - 1, startLine, startColumn);
  }

  /**
   * 分析条件else
   */
  private tokenizeConditionalElse(): void {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    this.position += this.config.conditionalElse.length;
    this.column += this.config.conditionalElse.length;

    this.addToken(TokenType.CONDITIONAL_ELSE, '', start, this.position - 1, startLine, startColumn);
  }

  /**
   * 分析条件结束
   */
  private tokenizeConditionalEnd(): void {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    this.position += this.config.conditionalEnd.length;
    this.column += this.config.conditionalEnd.length;

    this.addToken(TokenType.CONDITIONAL_END, '', start, this.position - 1, startLine, startColumn);
  }

  /**
   * 分析循环开始
   */
  private tokenizeLoopStart(): void {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    this.position += this.config.loopStart.length;
    this.column += this.config.loopStart.length;

    const value = this.extractUntil(this.config.variableEnd);

    if (value === null) {
      throw PromptErrorFactory.invalidTemplate(`Unclosed loop start, expected '${this.config.variableEnd}'`, {
        line: startLine,
        column: startColumn,
      });
    }

    this.addToken(TokenType.LOOP_START, value.trim(), start, this.position - 1, startLine, startColumn);
  }

  /**
   * 分析循环结束
   */
  private tokenizeLoopEnd(): void {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    this.position += this.config.loopEnd.length;
    this.column += this.config.loopEnd.length;

    this.addToken(TokenType.LOOP_END, '', start, this.position - 1, startLine, startColumn);
  }

  /**
   * 分析包含
   */
  private tokenizeInclude(): void {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    this.position += this.config.include.length;
    this.column += this.config.include.length;

    const value = this.extractUntil(this.config.variableEnd);

    if (value === null) {
      throw PromptErrorFactory.invalidTemplate(`Unclosed include, expected '${this.config.variableEnd}'`, { line: startLine, column: startColumn });
    }

    this.addToken(TokenType.INCLUDE, value.trim(), start, this.position - 1, startLine, startColumn);
  }

  /**
   * 分析注释
   */
  private tokenizeComment(): void {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;

    this.position += this.config.commentStart.length;
    this.column += this.config.commentStart.length;

    // 跳过注释内容，直到注释结束标记
    while (!this.isAtSequence(this.config.commentEnd) && this.position < this.input.length) {
      const char = this.input[this.position];
      if (char === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }

    if (this.position >= this.input.length) {
      throw PromptErrorFactory.invalidTemplate(`Unclosed comment, expected '${this.config.commentEnd}'`, { line: startLine, column: startColumn });
    }

    this.position += this.config.commentEnd.length;
    this.column += this.config.commentEnd.length;

    // 注释内容不添加到token列表中
  }

  /**
   * 检查当前位置是否在指定序列的开始
   */
  private isAtSequence(sequence: string): boolean {
    if (this.position + sequence.length > this.input.length) {
      return false;
    }

    const currentSequence = this.input.slice(this.position, this.position + sequence.length);
    return this.config.ignoreCase ? currentSequence.toLowerCase() === sequence.toLowerCase() : currentSequence === sequence;
  }

  /**
   * 提取直到指定序列的内容
   */
  private extractUntil(endSequence: string): string | null {
    const start = this.position;

    while (this.position < this.input.length) {
      if (this.isAtSequence(endSequence)) {
        const value = this.input.slice(start, this.position);
        this.position += endSequence.length;
        this.column += endSequence.length;
        return value;
      }

      const char = this.input[this.position];
      if (char === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }

    return null;
  }

  /**
   * 添加词法单元
   */
  private addToken(type: TokenType, value: string, start: number, end: number, line?: number, column?: number): void {
    this.tokens.push({
      type,
      value,
      line: line || this.line,
      column: column || this.column,
      offset: start,
      endOffset: end,
    });
  }

  /**
   * 获取词法分析统计信息
   */
  getStatistics(): {
    totalTokens: number;
    tokenCounts: Record<TokenType, number>;
  } {
    const counts: Record<TokenType, number> = {} as any;
    this.tokens.forEach(token => {
      counts[token.type] = (counts[token.type] || 0) + 1;
    });

    return {
      totalTokens: this.tokens.length,
      tokenCounts: counts,
    };
  }

  /**
   * 验证词法单元序列
   */
  validate(tokens: Token[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    let conditionalDepth = 0;
    let loopDepth = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      switch (token.type) {
        case TokenType.CONDITIONAL_START:
          conditionalDepth++;
          break;
        case TokenType.CONDITIONAL_END:
          conditionalDepth--;
          if (conditionalDepth < 0) {
            errors.push(`Unmatched conditional end at line ${token.line}, column ${token.column}`);
          }
          break;
        case TokenType.LOOP_START:
          loopDepth++;
          break;
        case TokenType.LOOP_END:
          loopDepth--;
          if (loopDepth < 0) {
            errors.push(`Unmatched loop end at line ${token.line}, column ${token.column}`);
          }
          break;
      }
    }

    if (conditionalDepth > 0) {
      errors.push(`Unclosed conditional blocks: ${conditionalDepth}`);
    }

    if (loopDepth > 0) {
      errors.push(`Unclosed loop blocks: ${loopDepth}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
