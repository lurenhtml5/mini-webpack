
var exports = {}
var require = e => {
    eval("e.default = function (a, b) { return a + b }")
}
require(exports)
var add = exports.default

console.log(add(1,2))