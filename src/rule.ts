import { JSONPath } from 'jsonpath-plus';
import { cloneDeep, intersection, isNil } from 'lodash';
import { LogLevel } from 'noicejs';

import { YamlParser } from 'src/parser/YamlParser';
import { readFileSync } from 'src/source';
import { Visitor } from 'src/visitor';
import { VisitorContext } from 'src/visitor/context';
import { VisitorResult } from 'src/visitor/result';

export interface RuleData {
  // metadata
  desc: string;
  level: LogLevel;
  name: string;
  tags: Array<string>;
  // data
  check: any;
  filter?: any;
  select: string;
}

export interface RuleSelector {
  excludeLevel: Array<LogLevel>;
  excludeName: Array<string>;
  excludeTag: Array<string>;
  includeLevel: Array<LogLevel>;
  includeName: Array<string>;
  includeTag: Array<string>;
}

export interface RuleSource {
  definitions?: Array<any>;
  name: string;
  rules: Array<RuleData>;
}

export async function loadRules(paths: Array<string>, ajv: any): Promise<Array<Rule>> {
  const parser = new YamlParser();
  const rules = [];

  for (const path of paths) {
    const contents = await readFileSync(path, {
      encoding: 'utf-8',
    });

    const data = parser.parse(contents) as RuleSource;

    if (!isNil(data.definitions)) {
      ajv.addSchema({
        '$id': data.name,
        definitions: data.definitions,
      });
    }

    rules.push(...data.rules.map((data: any) => new Rule(data)));
  }

  return rules;
}

export async function resolveRules(rules: Array<Rule>, selector: RuleSelector): Promise<Array<Rule>> {
  const activeRules = new Set<Rule>();

  for (const r of rules) {
    if (selector.excludeLevel.includes(r.level)) {
      continue;
    }

    if (selector.excludeName.includes(r.name)) {
      continue;
    }

    const excludedTags = intersection(selector.excludeTag, r.tags);
    if (excludedTags.length > 0) {
      continue;
    }

    if (selector.includeLevel.includes(r.level)) {
      activeRules.add(r);
    }

    if (selector.includeName.includes(r.name)) {
      activeRules.add(r);
    }

    const includedTags = intersection(selector.includeTag, r.tags);
    if (includedTags.length > 0) {
      activeRules.add(r);
    }
  }

  return Array.from(activeRules);
}

export interface RuleResult extends VisitorResult {
  rule: Rule;
} 

export class Rule implements RuleData, Visitor<RuleResult> {
  public readonly check: any;
  public readonly desc: string;
  public readonly filter?: any;
  public readonly level: LogLevel;
  public readonly name: string;
  public readonly select: string;
  public readonly tags: string[];

  constructor(data: RuleData) {
    this.desc = data.desc;
    this.level = data.level;
    this.name = data.name;
    this.select = data.select;
    this.tags = Array.from(data.tags);

    // copy schema objects
    this.check = cloneDeep(data.check);
    if (!isNil(data.filter)) {
      this.filter = cloneDeep(data.filter);
    }
  }

  public async pick(ctx: VisitorContext, root: any): Promise<Array<any>> {
    const scopes = JSONPath({
      json: root,
      path: this.select,
    });

    if (isNil(scopes) || scopes.length === 0) {
      ctx.logger.debug('no data selected');
      return [];
    }

    return scopes;
  }

  public async visit(ctx: VisitorContext, node: any): Promise<RuleResult> {
    ctx.logger.debug({ item: node, rule: this}, 'visiting node');

    const check = ctx.ajv.compile(this.check);
    const filter = this.compileFilter(ctx);
    const result: RuleResult = {
      changes: [],
      errors: [],
      rule: this,
    };

    if (filter(node)) {
      ctx.logger.debug({ item: node }, 'checking item')
      if (!check(node)) {
        const errors = Array.from(check.errors);
        ctx.logger.warn({
          errors,
          name: this.name,
          item: node,
          rule: this,
        }, 'rule failed on item');
        result.errors.push(...errors);
      }
    } else {
      ctx.logger.debug({ errors: filter.errors, item: node }, 'skipping item');
    }

    return result;
  }

  protected compileFilter(ctx: VisitorContext): any {
    if (isNil(this.filter)) {
      return () => true;
    } else {
      return ctx.ajv.compile(this.filter);
    }
  }
}
