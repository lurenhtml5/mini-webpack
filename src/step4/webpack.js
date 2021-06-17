const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");
/**
 * 分析模块
 * @param {*} file
 * @returns
 */
function getModuleInfo(filePath) {
  // 读取文件
  const body = fs.readFileSync(filePath, "utf-8");
  // code转化成AST抽象语法树
  const ast = parser.parse(body, {
    sourceType: "module", //表示我们要解析的是ES模块
  });

  const deps = {};
  // 遍历ast，进行依赖收集
  traverse(ast, {
    // 类型为 ImportDeclaration 的 AST 节点 (即为import 语句)
    ImportDeclaration({ node }) {
      const dirname = path.dirname(filePath);
      // 保存依赖模块的绝对路径，如'./src/add.js'
      const abspath = "./" + path.join(dirname, node.source.value);
      deps[node.source.value] = abspath;
    },
  });
  // ES6转成ES5
  const { code } = babel.transformFromAst(ast, null, {
    presets: ["@babel/preset-env"],
  });
  const moduleInfo = { filePath, deps, code };
  return moduleInfo;
}

/**
 * 获取依赖
 * @param {*} temp 
 * @param {*} param1 
 */
function getDeps(temp, { deps }) {
  Object.keys(deps).forEach((filePath) => {
    const child = getModuleInfo(deps[filePath]);
    temp.push(child);
    getDeps(temp, child); // 递归收集依赖，将依赖对应的path,code，deps,存入temp
  });
}

/**
 * 模块解析
 * @param {*} filePath 
 * @returns 
 */
function parseModules(filePath) {
  const entry = getModuleInfo(filePath);
  const temp = [entry]; // 从入口文件开始
  const depsGraph = {};

  getDeps(temp, entry);
	// 遍历temp，以path为key, { deps, code }为value, 放入depsGraph
  temp.forEach((moduleInfo) => {
    depsGraph[moduleInfo.filePath] = {
      deps: moduleInfo.deps,
      code: moduleInfo.code,
    };
  });
  return depsGraph;
}
/**
 * 生成bundle文件
 * @param {*} filePath 
 * @returns 
 */
function bundle(filePath) {
    const depsGraph = JSON.stringify(parseModules(filePath));
    console.log(depsGraph, 'depsGraph')
  return `(function (graph) {
        function require(file) {
            function absRequire(relPath) {
                return require(graph[file].deps[relPath])
            }
            var exports = {};
            (function (require,exports,code) {
                eval(code)
            })(absRequire,exports,graph[file].code)
            return exports
        }
        require('${filePath}')
    })(${depsGraph})`;
}
const content = bundle("./index.js");

!fs.existsSync("./dist") && fs.mkdirSync("./dist");
fs.writeFileSync("./dist/bundle.js", content);