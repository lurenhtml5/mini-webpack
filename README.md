# webpack浅析

## 一、什么是webpack

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/2bc23b74cff149eeadef5ac09821c0f8~tplv-k3u1fbpfcp-zoom-1.image)

webpack是一个用于现代javascript应用程序的静态模块打包工具，webpack会根据应用的入口(entry)，遍历各个文件的依赖，构建依赖图谱(depsGraph)，依赖图就相当于将各个不同的模块，通过loader处理打包成一个或者多个bundle。

## 二、浏览器端存在问题

以下代码为例：

```javascript
// add.js
exports.default = function (a, b) {
	return a + b;
}
// index.js
var add = require('add.js').default
console.log(add(1,2))
```

<script src="./index.js"></script>

这时候浏览器会报错：require is not defined，因为在浏览器是无法识别这个commonjs的require的；
不采用webpack这种构建工具来解决这个问题的话，可以用type="module"

<script type="module">
    import add from './add.js'
    console.log(add(1,2))
</script>

## 三、模拟require和exports

在上面的栗子中，只要我们解决`require is not defined`这个报错，并且能实现require和exports的功能即可，require的根本作用其实就是读取模块中的代码字符串，这一点fs.readFileSync就能实现，同时，再利用new Functon()或者eval()就能实现代码字符串的执行

```javascript
var exports = {}
var require = e => {
    eval("e.default = function (a, b) { return a + b }")
}
require(exports)
var add = exports.default
console.log(add(1,2))

// 控制台输出：3
```

针对存在多个代码段需要执行的场景

```javascript
var exports = {}
var require = e => {
    eval("e.default = function (a, b) { return a + b }")
}
require(exports)
var add = exports.default

var fileParse = fileList => {
    var require = file => {
        var exports = {}
        (function (e) {
            eval(fileList(file))
        })(exports)
        return exports
    }
    require('./index.js')
}
fileParse({
    "index.js": `
        var add = require('add.js').default
        console.log(add(1 , 2))
    `,
    "add.js": `exports.default = function(a,b){return a + b}`,
})
console.log(add(1,2))
```

以上，其实我们基本解决了在浏览器端使用require和exports带来的问题，那么还有个问题，怎么解决各模块之前的依赖问题，如何建立依赖关系

## 四、模块之间的依赖关系

我们先不用关心如何提取各模块之间的依赖关系，假设有一段依赖关系(dependecies)及其模块代码(code)，我们将如何处理

```javascript
{
  './src/index.js': {
    dependecies: { './add.js': './src/add.js' },
    code: `
      var add = require('add.js').default
      console.log(add(1 , 2))
    `
  },
  './src/add.js': {
    dependecies: {},
    code: `
			exports.default = function(a,b){return a + b}
		`
  }
}
```

上面这段数据结构，表示index.js依赖于add.js，而add.js就不依赖于其他模块了，那么我们开始着手改造上一part中的代码

```javascript
const graph = {
    './src/index.js': {
        dependecies: { './add.js': './src/add.js' },
        code: `
            var add = require('./add.js').default
            console.log(add(1 , 2))
        `
    },
    './add.js': {
        dependecies: {},
        code: `
                exports.default = function(a,b){return a + b}
            `
    }
}
const parseGraph = function (graph) {
    // 重写require函数
    const require = moduleId => {
        var exports = {};
        (function (require, exports, code) {
            eval(code)
        })(require, exports, graph[moduleId].code)
        return exports
    }
    require('./src/index.js') // 相当于webpack中的entry
}
parseGraph(graph)
// 控制台：3 
```

这么写虽然能正确输出，但是有个问题，就是dependecies没有利用起来，graph的key没有用绝对路径来建立映射，导致`require('./add.js')`这段代码中的引用路径和graph['./add.js']进行了强关联，不够灵活；继续改造，根据dependecies，去建立各chunk的关联

```javascript
const graph = {
    './src/index.js': {
        dependecies: { './add.js': './src/add.js' },
        code: `
            var add = require('./add.js').default
            console.log(add(1 , 2))
        `
    },
    './src/add.js': {
        dependecies: {},
        code: `
                exports.default = function(a,b){return a + b}
            `
    }
}
const parseGraph = function (graph) {
    // 重写require函数
    const require = moduleId => {
        var exports = {};
      	// 重新定义require，针对require('./add.js')这种相对路径的引入，需要通过dependecies，查找到绝对路径；再根据绝对路径					 去查找到code并执行
        function absPathRequire(relativePath) {
            return require(graph[moduleId].dependecies[relativePath])
        }
        (function (require, exports, code) {
            eval(code)
        })(absPathRequire, exports, graph[moduleId].code)
        return exports
    }
    require('./src/index.js') // 相当于webpack中的entry
}
// 解析依赖关系
parseGraph(graph)
```

以上我们完成了针对依赖关系的代码解析过程，那么我们是如何收集依赖关系的呢？

## 依赖收集

```javascript
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
  const body = fs.readFileSync(file, "utf-8");
  // code转化成AST抽象语法树
  const ast = parser.parse(body, {
    sourceType: "module", //表示我们要解析的是ES模块
  });

  const deps = {};
  // 遍历ast，进行依赖收集
  traverse(ast, {
    // 类型为 ImportDeclaration 的 AST 节点 (即为import 语句)
    ImportDeclaration({ node }) {
      const dirname = path.dirname(file);
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
 * @param {*} file 
 * @returns 
 */
function bundle(file) {
  const depsGraph = JSON.stringify(parseModules(file));
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
        require('${file}')
    })(${depsGraph})`;
}
const content = bundle("./index.js");

!fs.existsSync("./dist") && fs.mkdirSync("./dist");
fs.writeFileSync("./dist/bundle.js", content);
```

初步实现了webpack的依赖分析、打包过程
