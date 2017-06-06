require('source-map-support').install()
const testModule = require('../dist')
const {applyJSONEqual} = require('./_utils')

module.exports = exports = function(tap, options={}) ::
  tap.test @ 'Alternate revitalize key test ', async t => ::
    const revitalizeObjects = testModule.createRegistry('ξ')

    class Neato ::
      update(...args) :: return Object.assign @ this, ...args
      soundOff() :: return @[] 'Neato', this
      static Ξ = 'example.scope.Neato'
      static ξ = 'alt.scope.Neato'

    revitalizeObjects @ Neato


    class Keen extends Neato ::
      soundOff() :: return @[] 'Keen', this
      static Ξ (rez) :: 
        rez.registerClass('someOther.scope.Keen', this)
      static ξ (rez) ::
        rez.registerClass('alt.scope.Keen', this)

    revitalizeObjects @ Keen


    const some_proto = @{}
        soundOff() :: return @[] 'some proto', this
      , Ξ: 'some.proto.by.name'
      , ξ(rez) :: rez.registerProto('some.proto.by.alt', this)

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
      ξrefs: @[]
        @{} ξ: ['{root}', 0]
          , abc: { ξ: 1 }
          , def: { ξ: 2 }
          , value: 'the answer to life the universe and everything'
          , p1: { ξ: 3 }
          , xyz: { ξ: 2 }
        , { ξ: [ 'alt.scope.Keen', 1 ], a: 1942, b: 2042, c: 2142 }
        , { ξ: [ 'alt.scope.Neato', 2 ], d: 23, e: 'eeee', f: 'awesome' }
        , { ξ: [ 'some.proto.by.alt', 3 ] }


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

