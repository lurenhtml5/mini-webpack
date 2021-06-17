
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