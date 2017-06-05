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
            @{} Ξ: [ null, 0 ]
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
        @{} ξ: [null, 0]
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


  tap.test @ 'Revive without registered function throws exception', async t => ::
    const revitalizeObjects = testModule.createRegistry()
    t.throws @ () => ::
      revitalizeObjects.decode @
        JSON.stringify @: 
            Ξrefs: @[]
              @{} Ξ: ['this-reviver-not-registered', 99], a: 1942

  tap.test @ 'Circular test', async t => ::
    const revitalizeObjects = testModule.createRegistry()

    class TriangleTrade ::
      static Ξ = 'basics.circular.node'
      isTriangleTrade() :: return true

    revitalizeObjects @ TriangleTrade

    const a = new TriangleTrade()
    const b = new TriangleTrade()
    const c = new TriangleTrade()
    a.next = b
    b.next = c
    c.next = a

    function applyTestTriangle(...args) ::
      for const node of args ::
        t.strictEqual @ node.next.next.next, node


    applyTestTriangle(a, b, c)

    ::
      const ans_tip = await revitalizeObjects.encode(a)
      applyJSONEqual @ t, ans_tip, @{} Ξrefs: @[]
            @{} 'Ξ': [ 'basics.circular.node', 0 ], next: { 'Ξ': 1 }
          , @{} 'Ξ': [ 'basics.circular.node', 1 ], next: { 'Ξ': 2 }
          , @{} 'Ξ': [ 'basics.circular.node', 2 ], next: { 'Ξ': 0 }

      const res = await revitalizeObjects.decode(ans_tip)
      applyTestTriangle(res)

    ::
      const ans_lst = await revitalizeObjects.encode([a, b, c])
      applyJSONEqual @ t, ans_lst, @{} Ξrefs: @[]
            @{} 'Ξ': [ false, 0 ], '0': { 'Ξ': 1 }, '1': { 'Ξ': 2 }, '2': { 'Ξ': 3 }
          , @{} 'Ξ': [ 'basics.circular.node', 1 ], next: { 'Ξ': 2 }
          , @{} 'Ξ': [ 'basics.circular.node', 2 ], next: { 'Ξ': 3 }
          , @{} 'Ξ': [ 'basics.circular.node', 3 ], next: { 'Ξ': 1 }

      const res = await revitalizeObjects.decode(ans_lst)
      applyTestTriangle(res[0], res[1], res[2])

    ::
      const ans_obj = await revitalizeObjects.encode({a, b, c})
      applyJSONEqual @ t, ans_obj, @{} Ξrefs: @[]
            @{} 'Ξ': [ null, 0 ], a: { 'Ξ': 1 }, b: { 'Ξ': 2 }, c: { 'Ξ': 3 }
          , @{} 'Ξ': [ 'basics.circular.node', 1 ], next: { 'Ξ': 2 }
          , @{} 'Ξ': [ 'basics.circular.node', 2 ], next: { 'Ξ': 3 }
          , @{} 'Ξ': [ 'basics.circular.node', 3 ], next: { 'Ξ': 1 }
      const res = await revitalizeObjects.decode(ans_obj)
      applyTestTriangle(res.a, res.b, res.c)


function applyJSONEqual(t, szActualJSON, expected) ::
  const actual = JSON.parse(szActualJSON)

  if t.debug ::
    console.dir @ {actual}, {colors: true, depth: null}
    console.dir @ {expected}, {colors: true, depth: null}

  try ::
    return t.deepEqual @ actual, expected
  catch err ::
    console.dir @ {actual}, {colors: true, depth: null}
    console.dir @ {expected}, {colors: true, depth: null}
    //throw err
