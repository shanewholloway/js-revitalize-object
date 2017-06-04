const testModule = require('../dist')

module.exports = exports = function(tap, options={}) ::

  tap.test @ 'Module function smoke test', t => ::
    const revitalizeObjects = testModule
    const src = @{}
      a: 1942, b: {c: 'value', d: [1, 1, 2, 3, 5, 8, 13]}, e: null

    t.equal(revitalizeObjects.token, 'Ξ')
    ::
      const sz = revitalizeObjects.stringify(src)
      t.equal(typeof sz, 'string')
      const ans = revitalizeObjects.parse(sz)
      t.deepEqual(ans, src)

    ::
      const sz = revitalizeObjects.encode(src)
      t.equal(typeof sz, 'string')
      const ans = revitalizeObjects.decode(sz)
      t.deepEqual(ans, src)


  tap.test @ 'Instance smoke test', t => ::
    const instance = testModule.createRegistry('Φ')

    const src = @{}
      a: 1942, b: {c: 'value', d: [1, 1, 2, 3, 5, 8, 13]}, e: null

    t.equal(instance.token, 'Φ')
    ::
      const sz = instance.stringify(src)
      t.equal(typeof sz, 'string')
      const ans = instance.parse(sz)
      t.deepEqual(ans, src)

    ::
      const sz = instance.encode(src)
      t.equal(typeof sz, 'string')
      const ans = instance.decode(sz)
      t.deepEqual(ans, src)



  tap.test @ 'Object behavior test ', t => ::
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

    const ans = revitalizeObjects.encode(root, '  ')

    t.equal @ 'string', typeof ans

    applyJSONEqual @ t, ans, @{}
        refs: @[]
            { Ξ: [ 'someOther.scope.Keen', 0 ], a: 1942, b: 2042, c: 2142 }
          , { Ξ: [ 'example.scope.Neato', 1 ], d: 23, e: 'eeee', f: 'awesome' }
          , { Ξ: [ 'some.proto.by.name', 2 ] }
      , root: @{}
            abc: { Ξ: 0 }
          , def: { Ξ: 1 }
          , value: 'the answer to life the universe and everything'
          , p1: { Ξ: 2 }
          , xyz: { Ξ: 1 }

    const res = revitalizeObjects.decode(ans)
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


  tap.test @ 'Alternate revitalize key test ', t => ::
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

    const ans = revitalizeObjects.encode(root, '  ')

    t.equal @ 'string', typeof ans

    applyJSONEqual @ t, ans, @{}
       refs: @[]
          { ξ: [ 'alt.scope.Keen', 0 ], a: 1942, b: 2042, c: 2142 }
        , { ξ: [ 'alt.scope.Neato', 1 ], d: 23, e: 'eeee', f: 'awesome' }
        , { ξ: [ 'some.proto.by.alt', 2 ] }
     , root: @{}
          abc: { ξ: 0 }
        , def: { ξ: 1 }
        , value: 'the answer to life the universe and everything'
        , p1: { ξ: 2 }
        , xyz: { ξ: 1 }


    const res = revitalizeObjects.decode(ans)
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


  tap.test @ 'Revive without registered function throws exception', t => ::
    const revitalizeObjects = testModule.createRegistry()
    t.throws @ () => ::
      revitalizeObjects.decode @
        JSON.stringify @: 
            refs: @[]
              @{} Ξ: ['this-reviver-not-registered', 99], a: 1942
          , root: { Ξ: 99 }

  tap.test @ 'Circular test', t => ::
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

    const refs = @[]
        @{} 'Ξ': [ 'basics.circular.node', 0 ], next: { 'Ξ': 1 }
      , @{} 'Ξ': [ 'basics.circular.node', 1 ], next: { 'Ξ': 2 }
      , @{} 'Ξ': [ 'basics.circular.node', 2 ], next: { 'Ξ': 0 }


    ::
      const ans_tip = revitalizeObjects.encode(a)
      applyJSONEqual @ t, ans_tip, @{}
        refs, root: { Ξ: 0 }

      const res = revitalizeObjects.decode(ans_tip)
      applyTestTriangle(res)

    ::
      const ans_lst = revitalizeObjects.encode([a, b, c])
      applyJSONEqual @ t, ans_lst, @{}
        refs, root: @[] { Ξ: 0 }, { Ξ: 1 }, { Ξ: 2 }

      const res = revitalizeObjects.decode(ans_lst)
      applyTestTriangle(res[0], res[1], res[2])

    ::
      const ans_obj = revitalizeObjects.encode({a, b, c})
      applyJSONEqual @ t, ans_obj, @{}
        refs, root: @{}
              "a": { 'Ξ': 0 }
            , "b": { 'Ξ': 1 }
            , "c": { 'Ξ': 2 }

      const res = revitalizeObjects.decode(ans_obj)
      applyTestTriangle(res.a, res.b, res.c)


function applyJSONEqual(t, szActualJSON, expected) ::
  const actual = JSON.parse(szActualJSON)

  if t.debug ::
    console.dir @ {actual}, {colors: true, depth: null}
    console.dir @ {expected}, {colors: true, depth: null}

  return t.deepEqual @ actual, expected
