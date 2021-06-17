
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
parseGraph(graph)