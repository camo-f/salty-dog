import { readFile } from 'fs';
import { DEFAULT_SAFE_SCHEMA, safeLoad, Schema } from 'js-yaml';
import { isNil, isString } from 'lodash';
import { join } from 'path';
import { promisify } from 'util';

import { envType } from 'src/config/type/Env';
import { includeSchema, includeType } from 'src/config/type/Include';
import { regexpType } from 'src/config/type/Regexp';
import { NotFoundError } from 'src/error/NotFoundError';

export const CONFIG_ENV = 'SALTY_HOME';
export const CONFIG_SCHEMA = Schema.create([DEFAULT_SAFE_SCHEMA], [
  envType,
  includeType,
  regexpType,
]);

includeSchema.schema = CONFIG_SCHEMA;

const readFileSync = promisify(readFile);

/**
 * With the given name, generate all potential config paths in their complete, absolute form.
 *
 * This will include the value of `SALTY_HOME`, `HOME`, the current working directory, and any extra paths
 * passed as the final arguments.
 */
export function completePaths(name: string, extras: Array<string>): Array<string> {
  const paths = [];

  const env = process.env[CONFIG_ENV];
  if (isString(env)) {
    paths.push(join(env, name));
  }

  const home = process.env.HOME;
  if (isString(home)) {
    paths.push(join(home, name));
  }

  if (isString(__dirname)) {
    paths.push(join(__dirname, name));
  }

  for (const e of extras) {
    paths.push(join(e, name));
  }

  return paths;
}

export async function loadConfig(name: string, ...extras: Array<string>): Promise<any> {
  const paths = completePaths(name, extras);

  for (const p of paths) {
    const data = await readConfig(p);
    if (!isNil(data)) {
      return safeLoad(data, {
        schema: CONFIG_SCHEMA,
      });
    }
  }

  throw new NotFoundError('unable to load config');
}

export async function readConfig(path: string): Promise<string | undefined> {
  try {
    // need to await this read to catch the error, need to catch the error to check the code
    // tslint:disable-next-line:prefer-immediate-return
    const data = await readFileSync(path, {
      encoding: 'utf-8',
    });
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return;
    }
    throw err;
  }
}
