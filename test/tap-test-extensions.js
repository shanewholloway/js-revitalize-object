require('source-map-support').install()
const testModule = require('../dist')
const {applyJSONEqual} = require('./_utils')

module.exports = exports = function(tap, options={}) ::

  tap.test @ 'Object with toJSON ', async t => ::
    const revitalize = testModule.createRegistry()
    let callCount = 0

    class SomeExampleObject ::
      static Ξ = 'example.scope.something'

      constructor(prefix) ::
        if 'string' !== typeof prefix ::
          throw TypeError @ `prefix as a string, please`
        this.prefix = prefix

      toJSON() ::
        callCount++
        return @{} prefix: this.prefix, aa: 'AAaa', bb: 'bbBB'

      combine() ::
        return [this.prefix, this.aa, this.bb].join(' ').trim()

    revitalize.register @ SomeExampleObject


    t.equal @ 0, callCount

    ::
      const obj = new SomeExampleObject('first')
      t.equal @ 'first', obj.combine()

      const sz_ans = await revitalize.encode(obj)
      t.equal @ 1, callCount

      applyJSONEqual @ t, sz_ans, @{} 'Ξrefs': @[]
        @{} 'Ξ': [ 'example.scope.something', 0 ]
          , prefix: 'first', aa: 'AAaa', bb: 'bbBB'

      const reanim = await revitalize.decode(sz_ans)
      t.equal @ 'first AAaa bbBB', reanim.combine()
      t.equal @ 1, callCount

    ::
      const part1 = new SomeExampleObject('part-1')
      const part2 = new SomeExampleObject('part-2')
      const part3 = new SomeExampleObject('part-3')

      const sz_ans = await revitalize.encode([part1, part2, part3])
      t.equal @ 4, callCount

      applyJSONEqual @ t, sz_ans, @{} 'Ξrefs': @[]
          @{} 'Ξ': [ '[root]', 0 ]
            , '_': @[] { 'Ξ': 1 }, { 'Ξ': 2 }, { 'Ξ': 3 }
        , @{} 'Ξ': [ 'example.scope.something', 1 ]
            , prefix: 'part-1', aa: 'AAaa', bb: 'bbBB'
        , @{} 'Ξ': [ 'example.scope.something', 2 ]
            , prefix: 'part-2', aa: 'AAaa', bb: 'bbBB'
        , @{} 'Ξ': [ 'example.scope.something', 3 ]
            , prefix: 'part-3', aa: 'AAaa', bb: 'bbBB'

      const reanim = await revitalize.decode(sz_ans)
      t.equal @ 'part-1 AAaa bbBB', reanim[0].combine()
      t.equal @ 'part-2 AAaa bbBB', reanim[1].combine()
      t.equal @ 'part-3 AAaa bbBB', reanim[2].combine()
      t.equal @ 4, callCount

