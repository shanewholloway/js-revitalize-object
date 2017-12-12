require('source-map-support').install()
const testModule = require('../dist')
const {applyJSONEqual} = require('./_utils')

module.exports = exports = function(tap, options={}) ::
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

    ::
      const ans_tip = revitalizeObjects.encode(a)
      applyJSONEqual @ t, ans_tip, @{} Ξrefs: @[]
            @{} 'Ξ': [ 'basics.circular.node', 0 ], next: { 'Ξ': 1 }
          , @{} 'Ξ': [ 'basics.circular.node', 1 ], next: { 'Ξ': 2 }
          , @{} 'Ξ': [ 'basics.circular.node', 2 ], next: { 'Ξ': 0 }

      const res = revitalizeObjects.decode(ans_tip)
      applyTestTriangle(res)

    ::
      const ans_lst = revitalizeObjects.encode([a, b, c])
      applyJSONEqual @ t, ans_lst, @{} Ξrefs: @[]
            @{} 'Ξ': [ '[root]', 0 ]
              , '_': [ { 'Ξ': 1 }, { 'Ξ': 2 }, { 'Ξ': 3 } ]
          , @{} 'Ξ': [ 'basics.circular.node', 1 ], next: { 'Ξ': 2 }
          , @{} 'Ξ': [ 'basics.circular.node', 2 ], next: { 'Ξ': 3 }
          , @{} 'Ξ': [ 'basics.circular.node', 3 ], next: { 'Ξ': 1 }

      const res = revitalizeObjects.decode(ans_lst)
      applyTestTriangle(res[0], res[1], res[2])

    ::
      const ans_obj = revitalizeObjects.encode({a, b, c})
      applyJSONEqual @ t, ans_obj, @{} Ξrefs: @[]
            @{} 'Ξ': [ '{root}', 0 ]
              , 'a': { 'Ξ': 1 }, 'b': { 'Ξ': 2 }, 'c': { 'Ξ': 3 }
          , @{} 'Ξ': [ 'basics.circular.node', 1 ], next: { 'Ξ': 2 }
          , @{} 'Ξ': [ 'basics.circular.node', 2 ], next: { 'Ξ': 3 }
          , @{} 'Ξ': [ 'basics.circular.node', 3 ], next: { 'Ξ': 1 }
      const res = revitalizeObjects.decode(ans_obj)
      applyTestTriangle(res.a, res.b, res.c)

