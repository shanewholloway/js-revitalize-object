const root_obj = {}, root_list = []
const ObjMap = 'undefined' !== typeof WeakMap ? WeakMap : Map

class Revitalization extends Function ::
  constructor() ::
    throw new Error('Use the static .create() instead of new')

  static create(token_p) ::
    register.token = token_p || '\u039E' // 'Ξ'

    const lutRevive=new Map()
    const lutPreserve=new ObjMap()

    const self = Object.setPrototypeOf(register, this.prototype)
    Object.defineProperties @ self,
      @{} lookupReviver: @{} value: lutRevive.get.bind(lutRevive)
        , lookupPreserver: @{} value: lutPreserve.get.bind(lutPreserve)
        , _setReviver: @{} value: _setReviver


    self.initRegistery(root_obj, root_list)
    return self

    function register() ::
      return self.register.apply(self, arguments)

    function _setReviver(entry, kinds, matchers) ::
      lutRevive.set(entry.kind, entry)
      return ::
          alias(...kinds) ::
            for const each of kinds ::
              if each :: lutRevive.set(each, entry)
            return this
        , match(...matchers) ::
            for const each of matchers ::
              if null != each :: lutPreserve.set(each, entry)
            return this


  initRegistery(root_obj, root_list) ::
    this
      .register @: kind: '{root}'
        , revive(obj, entry) :: Object.assign(obj, entry.body)
      .match @ root_obj

    this
      .register @: kind: '[root]'
        , preserve(rootList) :: return @{} _: rootList.slice()
        , init(entry) :: return []
        , revive(rootList, entry) ::
            rootList.push.apply(rootList, entry.body._)
      .match @ root_list

  register(revitalizer) ::
    if 'kind' in revitalizer && revitalizer.revive ::
      return this.registerReviver(revitalizer)

    let tgt
    if undefined !== revitalizer.prototype ::
      tgt = revitalizer.prototype[this.token]
      if undefined !== tgt ::
        if 'function' === typeof tgt ::
          tgt = tgt.call(revitalizer.prototype, this)
          if null == tgt :: return
        if 'string' === typeof tgt ::
          return this.registerClass(tgt, revitalizer)

    tgt = revitalizer[this.token]
    if undefined !== tgt ::
      if 'function' === typeof tgt ::
        tgt = tgt.call(revitalizer, this)
        if null == tgt :: return
      if 'string' === typeof tgt ::
        return this.registerProto(tgt, revitalizer.prototype || revitalizer)
          .match(revitalizer)

    throw new TypeError(`Unrecognized revitalization registration`)

  registerReviver(entry) ::
    ::
      const kind = entry.kind
      if 'string' !== typeof kind && true !== kind && false !== kind && null !== kind ::
        throw new TypeError @ `"kind" must be a string`

      if entry.init && 'function' !== typeof entry.init ::
        throw new TypeError @ '"init" must be a function'

      if 'function' !== typeof entry.revive ::
        throw new TypeError @ '"revive" must be a function'

      if entry.preserve && 'function' !== typeof entry.preserve ::
        throw new TypeError @ '"preserve" must be a function if provided'

    return this._setReviver(entry)

  registerClass(kind, klass) ::
    return this
      .registerReviver @: kind,
        revive(obj, entry) ::
          obj = Object.assign(obj, entry.body)
          Object.setPrototypeOf(obj, klass.prototype)
      .match(klass, klass.prototype)

  registerProto(kind, proto) ::
    return this
      .registerReviver @: kind,
        revive(obj, entry) ::
          obj = Object.assign(obj, entry.body)
          Object.setPrototypeOf(obj, proto)
      .match(proto)


  decode(aString, ctx) ::
    if null == ctx :: ctx = {}
    const token=this.token, lookupReviver=this.lookupReviver

    const queue=[], byOid=new Map()
    JSON.parse(aString, _json_create)

    const refs=new ObjMap()
    JSON.parse(aString, _json_restore)

    const evts = {}
    const _start = Promise.resolve().then @ () =>
      queue.reverse().map @ entry => ::
        entry.evts = evts
        return entry.reviver.revive(entry.obj, entry, ctx)

    evts.started = _start.then @ lst => lst.length
    evts.finished = _start.then @ lst =>
      Promise.all(lst).then @ lst => lst.length

    evts.done = evts.finished.then @ () => ::
      const {obj, promise} = byOid.get(0)
      return undefined === promise ? obj
        : promise.then @ ans =>
            ans !== undefined ? ans : obj
    return evts.done


    function _json_create(key, value) ::
      if token === key ::
        if 'number' === typeof value ::
        else if Array.isArray(value) ::
          delete this[token]

          const [kind, oid] = value
          const reviver = lookupReviver(kind)
          if undefined === reviver ::
            throw new ReviverNotFound(`Missing registered reviver for kind "${kind}"`)

          const entry = @: kind, oid, reviver, body: this

          entry.obj = reviver.init
            ? reviver.init(entry, ctx)
            : Object.create(null)

          byOid.set(oid, entry)
          queue.push(entry)
        return

      return value


    function _json_restore(key, value) ::
      if token === key ::
        if 'number' === typeof value ::
          refs.set @ this, byOid.get(value).obj

        else if Array.isArray(value) ::
          const entry = byOid.get(value[1])
          entry.body = this
          refs.set @ this, entry.obj
        return

      else if null === value || 'object' !== typeof value ::
        return value

      const ans = refs.get(value)
      return ans !== undefined ? ans : value


  encode(anObject, ctx) ::
    const refs = []
    const promise = this.encodeObjects @ anObject, ctx, (err, entry) => ::
      refs[entry.oid] = entry.content

    const key = JSON.stringify @ `${this.token}refs`
    return promise.then @ () =>
      `{${key}: [\n  ${refs.join(',\n  ')} ]}\n`


  encodeObjects(anObject, ctx, callback) ::
    if 'function' === typeof ctx ::
      callback = ctx; ctx = {}
    else if null == ctx ::
      ctx = {}

    const token=this.token, lookupPreserver=this.lookupPreserver, findPreserver=this._boundFindPreserveForObj()

    const queue=[], lookup=new Map()
    JSON.stringify(anObject, _json_replacer)

    return _encodeQueue()

    function _encodeQueue() ::
      if 0 === queue.length ::
        return Promise.resolve()

      const promises = []
      while 0 !== queue.length ::
        const tip = queue.shift(), oid = tip.oid
        promises.push @
          tip
            .then @ body => ::
              const content = JSON.stringify(body, _json_replacer)
              return callback @ null, { oid, body, content }
            .catch @ err => callback(err)

      return Promise.all(promises).then(_encodeQueue)

    function _json_replacer(key, dstValue) ::
      // srcValue !== dstValue for objects with .toJSON() methods
      const srcValue = this[key]

      if dstValue === null || 'object' !== typeof srcValue ::
        return dstValue

      const prev = lookup.get(srcValue)
      if undefined !== prev ::
        return prev // already serialized -- reference existing item

      let entry = findPreserver(srcValue)
      if undefined === entry ::
        // not a "special" preserved item
        if anObject !== srcValue ::
          return dstValue // so serialize normally
        // but it is the root, so store at oid 0
        entry = lookupPreserver @
          Array.isArray(dstValue) ? root_list : root_obj

      // register id for object and return a JSON serializable version
      const oid = lookup.size
      const ref = {[token]: oid}
      lookup.set(srcValue, ref)

      // transform live object into preserved form
      const body = {[token]: [entry.kind, oid]}
      const promise = Promise
        .resolve @ entry.preserve ? entry.preserve(dstValue, srcValue, ctx) : dstValue
        .then @ attrs => Object.assign(body, attrs)

      promise.oid = oid
      queue.push @ promise
      return ref

  _boundFindPreserveForObj() ::
    const lookupPreserver = this.lookupPreserver
    return function(obj) ::
      let entry = lookupPreserver(obj)
      if undefined !== entry ::
        return entry

      entry = lookupPreserver(obj.constructor)
      if undefined !== entry ::
        return entry

      let proto = obj
      while null !== @ proto = Object.getPrototypeOf(proto) ::
        let entry = lookupPreserver(proto)
        if undefined !== entry ::
          return entry


class ReviverNotFound extends Error ::

const createRegistry = Revitalization.create.bind(Revitalization)

module.exports = exports = createRegistry()
Object.assign @ exports
  , @{} Revitalization, ReviverNotFound
      , createRegistry, create: createRegistry
