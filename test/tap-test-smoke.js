require('source-map-support').install()
const testModule = require('../dist')

module.exports = exports = function(tap, options={}) ::

  tap.test @ 'Module function smoke test', async t => ::
    const revitalizeObjects = testModule
    const src = @{}
      a: 1942, b: {c: 'value', d: [1, 1, 2, 3, 5, 8, 13]}, e: null

    t.equal(revitalizeObjects.token, 'Ξ')
    const sz = await revitalizeObjects.encode(src)
    t.equal(typeof sz, 'string')
    const ans = await revitalizeObjects.decode(sz)
    t.deepEqual(ans, src)


  tap.test @ 'Instance smoke test', async t => ::
    const instance = testModule.createRegistry('Φ')

    const src = @{}
      a: 1942, b: {c: 'value', d: [1, 1, 2, 3, 5, 8, 13]}, e: null

    t.equal(instance.token, 'Φ')
    const sz = await instance.encode(src)
    t.equal(typeof sz, 'string')
    const ans = await instance.decode(sz)
    t.deepEqual(ans, src)

