let patchFileName = "20180410_20180411.patch"
let newDir = patchFileName.split(/[\.\/\\]/).slice[-2]
console.log(newDir)