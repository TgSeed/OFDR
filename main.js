import { parse as parseHTML } from 'node-html-parser';
import { writeFileSync } from 'fs';
import vm from 'vm';
import parser from '@babel/parser';
import _generator from '@babel/generator';
const generator = _generator.default;
import _traverse from '@babel/traverse';
const traverse = _traverse.default;
import sha1 from 'js-sha1';

async function getPage(url) {
  console.log('Fetching page.');
  const response = await fetch(url);
  if (!response.ok) {
    console.log('Fetch page error', response.status);
  }

  const html = await response.text();
  return html;
}

async function getCode(html, name) {
  console.log('Parsing script tags.');
  const scripts = parseHTML(html).querySelector('head').querySelectorAll('script');
  for (let script of scripts) {
    if (!script.rawAttributes.src) {
      continue;
    }

    const src = script.rawAttributes.src;
    if (src.indexOf(name) < 0) {
      continue;
    }

    console.log('Fetching script.');
    const response = await fetch(src);
    if (!response.ok) {
      console.log('Fetch script error', response.status);
      throw new Error();
    }

    const code = await response.text();
    return code;
  }

  console.log('Script not found.');
  throw new Error();
}

function getProxy(obj, name) {
  return new Proxy(obj, {
    get(obj, prop) {
      const value = obj[prop];
      if (!value) {
        console.log(`NO VALUE: ${name} -> ${prop}`);
      }

      return value;
    },
  });
}

function runCode(code) {
  const context = getProxy(
    {
      self: getProxy({ webpackChunkof_vue: [] }, 'self'),
      window: getProxy(
        {
          'navigator.userAgent': 'browser',
        },
        'window'
      ),
      String: String,
      parseInt: parseInt,
      decodeURIComponent,
      decodeURIComponent,
      Date: Date,
      Math: Math,
      Proxy: Proxy,
      log: [],
      isNaN: isNaN,
    },
    'context'
  );

  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

let shamsg = '';
function runFunction(fun) {
  function importer(mod) {
    if (mod === 89668) {
      // sha
      return function (msg) {
        shamsg = msg;
        return sha1(msg); // the real sha this time
      };
    } else if (mod === 858156) {
      // get property
      return function (obj, path, def) {
        return obj[path] ? obj[path] : def;
      };
    } else if (mod === 944114) {
      // empty object
      return getProxy(
        {
          default: getProxy(
            {
              'getters.auth/authUserId': 123123,
            },
            'default'
          ),
        },
        '944114'
      );
    } else if (mod === 441153) {
      // empty object
      return getProxy(
        {
          A: getProxy(
            {
              'getters.auth/authUserId': 123123,
            },
            'default'
          ),
        },
        '441153'
      );
    } else {
      console.log(`Unknown ${mod} module`);
    }
  }
  importer.n = function (obj) {
    return () => obj;
  };

  const param1 = getProxy({}, 'param1');
  const param2 = getProxy({}, 'param2');
  fun(param1, param2, importer);
  return param2.A;
}

function getMath(ast) {
  let math = null;

  // 3. stop at every indentifier, if it's 'Math' then we've done
  const matchIdentifier = {
    Identifier(path) {
      if (path.node.name === 'Math') {
        math = this.current;
        path.stop();
      }
    },
  };

  // 2. stop at every return statement, traverse subtree
  const matchReturn = {
    ReturnStatement(path) {
      path.scope.traverse(path.node, matchIdentifier, { current: path });
    },
  };

  // 1. traverse full code
  traverse(ast, matchReturn);
  return math;
}

function getNames(ast) {
  const names = new Set();

  // 2. stop at every member expression, except Math itself
  const matchReturn = {
    MemberExpression(path) {
      const name = path.node.object.name;
      if (!name || name === 'Math') {
        return;
      }

      names.add(name);
      // insert prefix
      path.node.object.name = '_' + name;
    },
  };

  // 1. traverse given tree
  ast.traverse(matchReturn);
  return names;
}

function insertProxy(ast, names) {
  const lines = [];
  lines.push(`
        function _add(a, b) {
            log.push(['add', a, b, a + b]);
            return a + b;
        }

        function _sub(a, b) {
            log.push(['sub', a, b, a - b]);
            return a - b;
        }

        function _mod(a, b) {
            // log.push(['mod', a, b, a % b]);
            return a % b;
        }
    `);

  for (let name of names.values()) {
    lines.push(`
            const _${name} = new Proxy({ obj: ${name} }, {
                get(obj, prop) {
                    obj = obj.obj;
                    const value = obj[prop];
                    if (typeof(value) === 'function') {
                        const code = value.toString();
                        if (code.indexOf('+') > -1) {
                            return _add;
                        } else if (code.indexOf('-') > -1) {
                            return _sub;
                        } else if (code.indexOf('%') > -1) {
                            return _mod;
                        } else {
                            '--unknown function';
                        }
                    } else {
                        const index = parseInt(prop);
                        if (!isNaN(index)) {
                            log.push(['get', '_${name}', index, value, value.charCodeAt(0)]);
                        }
                    }

                    return value;
                }
            });
        `);
  }

  const insert = parser.parse(lines.join('')).program;
  ast.insertBefore(insert);
}

function getSign(code, url) {
  const context = runCode(code);
  const fun = context.self.webpackChunkof_vue[0][1][802313];
  const fun2 = runFunction(fun);
  const result = fun2({ url: url });
  context.result = result;
  return context;
}

function parseLog(log) {
  const indexes = [];
  let num = 0;
  let entry = null;
  for (let i = 0; i < log.length; i++) {
    entry = log[i];
    if (entry[0] === 'get') {
      indexes.push(entry[2]);
      entry = log[i + 1];

      if (entry[0] === 'add') {
        num += entry[2];
      } else if (entry[0] === 'sub') {
        num -= entry[2];
      } else {
        console.log('Expected add/sub here');
      }
    }
  }

  indexes.sort((a, b) => a - b);
  return { num: num, indexes: indexes };
}

function parseOperations(ast) {
  const operations = {
    '+': '_add',
    '-': '_sub',
    '%': '_mod',
  };

  ast.traverse({
    BinaryExpression(path) {
      const name = operations[path.node.operator];
      if (!name) {
        console.log('Unknown operation', path.node.operator);
      }

      path.replaceWith({
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: name,
        },
        arguments: [path.node.left, path.node.right],
      });
    },
  });
}

function createRules(log, sign) {
  const signParts = sign.split(':');
  const result = parseLog(log);
  const shamsgParts = shamsg.split('\n');

  const rules = {
    'app-token': '33d57ade8c02dbc5a333db99ff9ae26a',
    static_param: shamsgParts[0],
    prefix: signParts[0],
    suffix: signParts[3],
    checksum_constant: result.num,
    checksum_indexes: result.indexes,
  };

  return rules;
}

function createHeaders(path, rules) {
  const time = Date.now().toString();
  const hash = sha1([rules['static_param'], time, path, rules['user-id']].join('\n'));
  const checksum =
    rules['checksum_indexes'].reduce((total, current) => (total += hash[current].charCodeAt(0)), 0) +
    rules['checksum_constant'];
  const sign = [rules['prefix'], hash, checksum.toString(16), rules['suffix']].join(':');
  return {
    accept: 'application/json, text/plain, */*',
    'app-token': rules['app-token'],
    cookie: rules['cookie'],
    sign: sign,
    time: time,
    'user-id': rules['user-id'],
    'user-agent': rules['user-agent'],
    'x-bc': rules['x-bc'],
  };
}

async function testAPI(path, rules) {
  rules = {
    ...rules,
    ...{
      'user-id': '0',
      'x-bc': '',
      cookie: '',
      'user-agent': '',
    },
  };

  const headers = createHeaders(path, rules);
  const response = await fetch(`https://onlyfans.com${path}`, { headers: headers });

  return await response.json();
}

async function main() {
  // get the code
  const html = await getPage('https://onlyfans.com');
  const code = await getCode(html, '2313.js');
  // parse ast
  const ast = parser.parse(code);
  const math = getMath(ast);
  const names = getNames(math);
  // change code
  insertProxy(math, names);
  parseOperations(math);
  const newCode = generator(ast).code;
  // create rules
  const context = getSign(newCode, 'not important for analysis');
  const rules = createRules(context.log, context.result.sign);
  // dump rules
  const json = JSON.stringify(
    rules,
    function (k, v) {
      if (v instanceof Array) {
        return JSON.stringify(v);
      } else {
        return v;
      }
    },
    2
  )
    .replace(/\"\[/g, '[')
    .replace(/\]\"/g, ']');

  writeFileSync('rules.json', json);
  console.log('Done');

  // test if it works
  //const path = '/api2/v2/users/me';
  //const msg = await testAPI(path, rules);
  //console.log(msg);
}

main();
