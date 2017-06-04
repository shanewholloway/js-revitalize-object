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
      , p0: some_proto
      , p1: Object.create @ some_proto

    root.xyz = root.def

    applyTest(root)

    const ans = revitalizeObjects.encode(root, '  ')

    t.equal @ 'string', typeof ans

    applyJSONEqual @ t, ans, @{}
      "abc": { "a": 1942, "b": 2042, "c": 2142, "Ξ": [ "someOther.scope.Keen", 0 ] },
      "def": { "d": 23, "e": "eeee", "f": "awesome", "Ξ": [ "example.scope.Neato", 1 ] },
      "value": "the answer to life the universe and everything",
      "p0": { "Ξ": [ "some.proto.by.name", 2 ] },
      "p1": { "Ξ": [ "some.proto.by.name", 3 ] },
      "xyz": { "Ξ": 1 },

    const res = revitalizeObjects.decode(ans)
    applyTest(res)


    function applyTest(tip) ::
      t.equal @ tip.value, 'the answer to life the universe and everything'
      t.deepEqual @ tip.abc.soundOff(), ['Keen', tip.abc]
      t.deepEqual @ tip.def.soundOff(), ['Neato', tip.def]
      t.deepEqual @ tip.xyz.soundOff(), ['Neato', tip.def]
      t.deepEqual @ tip.p0.soundOff(), ['some proto', tip.p0]
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
      "abc": { "a": 1942, "b": 2042, "c": 2142, "ξ": [ "alt.scope.Keen", 0 ] },
      "def": { "d": 23, "e": "eeee", "f": "awesome", "ξ": [ "alt.scope.Neato", 1 ] },
      "value": "the answer to life the universe and everything",
      "p1": { "ξ": [ "some.proto.by.alt", 2 ] },
      "xyz": { "ξ": 1 },


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

    const first_expected = @{}
      next: @{}
          next: @{}
              next: { 'Ξ': 0 }
            , 'Ξ': [ 'basics.circular.node', 2 ]
        , 'Ξ': [ 'basics.circular.node', 1 ]
      , 'Ξ': [ 'basics.circular.node', 0 ]

    const ans_tip = revitalizeObjects.encode(a)
    applyJSONEqual @ t, ans_tip, first_expected

    const ans_lst = revitalizeObjects.encode([a, b, c])
    applyJSONEqual @ t, ans_lst, @[]
        first_expected
      , { 'Ξ': 1 }
      , { 'Ξ': 2 }

    const ans_obj = revitalizeObjects.encode({a, b, c})
    applyJSONEqual @ t, ans_obj, @{}
        "a": first_expected
      , "b": { 'Ξ': 1 }
      , "c": { 'Ξ': 2 }


function applyJSONEqual(t, szActualJSON, expected) ::
  const actual = JSON.parse(szActualJSON)

  if t.debug ::
    console.dir @ {actual}, {colors: true, depth: null}
    console.dir @ {expected}, {colors: true, depth: null}

  return t.deepEqual @ actual, expected
