const ObjMap = 'undefined' !== typeof WeakMap ? WeakMap : Map

class ReviverNotFound extends Error ::

module.exports = exports = createRevitalizationRegistry()
Object.assign @ exports, @{}
    createRevitalizationRegistry, createRegistry: createRevitalizationRegistry
  , ReviverNotFound

function createRevitalizationRegistry(token_p) ::
  const token=token_p || '\u039E' // 'Ξ' 
  const lutRevive=new Map(), lookupReviver=lutRevive.get.bind(lutRevive)

  const lutPreserve=new ObjMap(), lookupPreserver=lutPreserve.get.bind(lutPreserve)

  const api = Object.assign @ register, ::
      token
    , register
    , registerReviver
    , registerProto
    , registerClass

    , decode, encode, encodeObjects
    , lookupReviver, lookupPreserver, findPreserver

  api.registerReviver @: kind: null,
    revive(obj, args) :: return Object.assign(obj, args.body)
  api.registerReviver @: kind: false,
    revive(obj, args) :: return Object.assign(obj, args.body)
  return api

  function register(revitalizer) ::
    if revitalizer.kind && revitalizer.revive ::
      return api.registerReviver(revitalizer)

    let tgt
    if undefined !== revitalizer.prototype ::
      tgt = revitalizer.prototype[token]
      if undefined !== tgt ::
        if 'function' === typeof tgt ::
          tgt = tgt.call(revitalizer.prototype, api)
          if null == tgt :: return
        if 'string' === typeof tgt ::
          return api.registerClass(tgt, revitalizer)

    tgt = revitalizer[token]
    if undefined !== tgt ::
      if 'function' === typeof tgt ::
        tgt = tgt.call(revitalizer, api)
        if null == tgt :: return
      if 'string' === typeof tgt ::
        return api.registerProto(tgt, revitalizer.prototype || revitalizer)
          .match(revitalizer)

    throw new TypeError(`Unrecognized revitalization registration`)

  function registerClass(kind, klass) ::
    return this
      .registerReviver @: kind,
        revive(obj, args) ::
          obj = Object.assign(obj, args.body)
          return Object.setPrototypeOf(obj, klass.prototype)
      .match(klass, klass.prototype)

  function registerProto(kind, proto) ::
    return this
      .registerReviver @: kind,
        revive(obj, args) ::
          obj = Object.assign(obj, args.body)
          return Object.setPrototypeOf(obj, proto)
      .match(proto)

  function registerReviver(entry) ::
    ::
      const kind = entry.kind
      if 'string' !== typeof kind && true !== kind && false !== kind && null !== kind ::
        throw new TypeError @ `"kind" must be a string`

      if entry.create && 'function' !== typeof entry.create ::
        throw new TypeError @ '"create" must be a function'

      if 'function' !== typeof entry.revive ::
        throw new TypeError @ '"revive" must be a function'

      if entry.preserve && 'function' !== typeof entry.preserve ::
        throw new TypeError @ '"preserve" must be a function if provided'

      lutRevive.set(kind, entry)

    return ::
        alias(...kinds) ::
          for const each of kinds ::
            if each ::
              lutRevive.set(each, entry)
          return this
      , match(...objects) ::
          for const each of objects ::
            if null != each ::
              lutPreserve.set(each, entry)
          return this

  function findPreserver(obj) ::
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



function decode(aString, ctx) ::
  if null == ctx :: ctx = {}
  const token=this.token, lookupReviver=this.lookupReviver

  const queue=[], byOid=new Map()
  JSON.parse(aString, _json_create)

  const refs=new ObjMap()
  JSON.parse(aString, _json_restore)

  return Promise
    .all @ queue.map @ args => ::
      args.reviver.revive(args.obj, args, ctx)
    .then @ () => byOid.get(0).obj


  function _json_create(key, value) ::
    if token === key ::
      if 'number' === typeof value ::
      else if Array.isArray(value) ::
        delete this[token]

        const [kind, oid] = value
        const reviver = lookupReviver(kind)
        if undefined === reviver ::
          throw new ReviverNotFound(`Missing registered reviver for kind "${kind}"`)

        const obj = reviver.create
          ? reviver.create()
          : Object.create(null)

        const entry = @: kind, oid, reviver, obj
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


function encode(anObject) ::
  const refs = []
  const promise = encodeObjects.call @ this, anObject, (err, entry) => ::
    refs[entry.oid] = entry.content

  const key = JSON.stringify @ `${this.token}refs`
  return promise.then @ () =>
    `{${key}: [\n  ${refs.join(',\n  ')} ]}\n`


function encodeObjects(anObject, callback) ::
  const token=this.token, findPreserver=this.findPreserver

  const queue=[], lookup=new Map()
  JSON.stringify(anObject, _json_replacer)

  return encodeQueue()

  function encodeQueue() ::
    if 0 === queue.length :: return

    const promises = []
    while 0 !== queue.length ::
      const tip = queue.shift(), oid = tip.oid
      promises.push @
        tip
          .then @ body => ::
            const content = JSON.stringify(body, _json_replacer)
            return callback @ null, { oid, body, content }
          .catch @ err => callback(err)

    return Promise.all(promises).then(encodeQueue)

  function _json_replacer(key, value) ::
    if value === null || 'object' !== typeof value ::
      return value

    const prev = lookup.get(value)
    if undefined !== prev ::
      return prev // already serialized -- reference existing item

    let entry = findPreserver(value)
    if undefined === entry ::
      // not a "special" preserved item
      if anObject !== value ::
        return value // so serialize normally
      else if Array.isArray(value) ::
        entry = {kind: false} // but since it is the root item array, store it anyway
      else ::
        entry = {kind: null} // but since it is the root item, store it anyway

    // register id for object and return a JSON serializable version
    const oid = lookup.size
    const ref = {[token]: oid}
    lookup.set(value, ref)

    // transform live object into preserved form
    const body = {[token]: [entry.kind, oid]}
    const promise = Promise
      .resolve @ entry.preserve ? entry.preserve(value) : value
      .then @ attrs => Object.assign(body, attrs)

    promise.oid = oid
    queue.push @ promise
    return ref

