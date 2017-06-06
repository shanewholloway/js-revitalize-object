require('source-map-support').install()
const testModule = require('../dist')
const {applyJSONEqual} = require('./_utils')

module.exports = exports = function(tap, options={}) ::

  tap.test @ 'Revive without registered function throws exception', async t => ::
    const revitalizeObjects = testModule.createRegistry()
    t.throws @ () => ::
      revitalizeObjects.decode @
        JSON.stringify @: 
            Ξrefs: @[]
              @{} Ξ: ['this-reviver-not-registered', 99], a: 1942


  tap.test @ 'Date with toJSON', async t => ::
    const revitalizeObjects = testModule

    const ts = new Date('2017-01-01')
    const src = @{} ts

    const sz = await revitalizeObjects.encode(src)
    t.equal(typeof sz, 'string')

    const ans = await revitalizeObjects.decode(sz)
    t.equal @ ans.ts, ts.toISOString()

    applyJSONEqual @ t, sz, @{} 'Ξrefs': @[]
      @{} 'Ξ': [ '{root}', 0 ]
        , ts: '2017-01-01T00:00:00.000Z'


  tap.test @ 'Object behavior test ', async t => ::
    const revitalizeObjects = testModule.createRegistry()

    class Neato ::
      update(...args) :: return Object.assign @ this, ...args
      soundOff() :: return @[] 'Neato', this
      static Ξ = 'example.scope.Neato'

    revitalizeObjects @ Neato


    class Keen extends Neato ::
      soundOff() :: return @[] 'Keen', this
      static Ξ (rez) :: 
        rez.registerClass('someOther.scope.Keen', this)

    revitalizeObjects @ Keen


    const some_proto = @{}
        soundOff() :: return @[] 'some proto', this
      , Ξ: 'some.proto.by.name'

    revitalizeObjects @ some_proto


    const root = @{}
        abc: new Keen().update @: a: 1942, b: 2042, c: 2142
      , def: new Neato().update @: d:23, e:'eeee', f: 'awesome'
      , value: 'the answer to life the universe and everything'
      , p1: Object.create @ some_proto

    root.xyz = root.def

    applyTest(root)

    const ans = await revitalizeObjects.encode(root, '  ')

    t.equal @ 'string', typeof ans

    applyJSONEqual @ t, ans, @{}
        Ξrefs: @[]
            @{} Ξ: [ '{root}', 0 ]
              , abc: { Ξ: 1 }
              , def: { Ξ: 2 }
              , value: 'the answer to life the universe and everything'
              , p1: { Ξ: 3 }
              , xyz: { Ξ: 2 }
          , { Ξ: [ 'someOther.scope.Keen', 1 ], a: 1942, b: 2042, c: 2142 }
          , { Ξ: [ 'example.scope.Neato', 2 ], d: 23, e: 'eeee', f: 'awesome' }
          , { Ξ: [ 'some.proto.by.name', 3 ] }

    const res = await revitalizeObjects.decode(ans)
    applyTest(res)


    function applyTest(tip) ::
      t.equal @ tip.value, 'the answer to life the universe and everything'
      t.deepEqual @ tip.abc.soundOff(), ['Keen', tip.abc]
      t.deepEqual @ tip.def.soundOff(), ['Neato', tip.def]
      t.deepEqual @ tip.xyz.soundOff(), ['Neato', tip.def]
      t.deepEqual @ tip.p1.soundOff(), ['some proto', tip.p1]

      t.deepEqual @ tip.abc, {"a":1942,"b":2042,"c":2142}
      t.deepEqual @ tip.def, {"d":23,"e":"eeee","f":"awesome"}

      t.strictEqual @ tip.def, tip.xyz
      t.notStrictEqual @ tip.p0, tip.p1


