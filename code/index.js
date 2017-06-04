const ObjMap = 'undefined' !== typeof WeakMap ? WeakMap : Map

class ReviverNotFound extends Error ::

const base_api = @{}


module.exports = exports = createRevitalizationRegistry()
Object.assign @ exports, @{}
    createRevitalizationRegistry, createRegistry: createRevitalizationRegistry
  , ReviverNotFound

function createRevitalizationRegistry(token_p) ::
  const token=token_p || '\u039E' // 'Ξ' 
  const lutRevive=new Map(), lookupReviver = lutRevive.get.bind(lutRevive)

  const lutPreserve=new ObjMap(), lookupPreserver=lutPreserve.get.bind(lutPreserve)

  const api = Object.assign @ register, ::
      token
    , register
    , registerKind
    , registerProto
    , registerClass

    , parse, decode: parse
    , stringify, encode: stringify
    , lookupReviver, lookupPreserver, findPreserver

  return api

  function register(revitalizer) ::
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
    return this.registerKind
      @ kind, (obj, args) => Object.setPrototypeOf @ Object.assign(obj, args.body), klass.prototype
      .match(klass, klass.prototype)

  function registerProto(kind, proto) ::
    return this.registerKind
      @ kind, (obj, args) => Object.setPrototypeOf @ Object.assign(obj, args.body), proto
      .match(proto)

  function registerKind(kind, revive, preserve) ::
    if 'function' !== typeof revive ::
      throw new TypeError @ '"revive" must be a function'

    if null == preserve ::
      preserve = noop
    else if 'function' !== typeof preserve ::
      throw new TypeError @ '"preserve" must be a function'

    const entry = @{} kind, revive, preserve

    lutRevive.set(kind, revive)
    return ::
        alias(...kinds) ::
          for const each of kinds ::
            if each ::
              lutRevive.set(each, revive)
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



function parse(aString, ctx) ::
  if null == ctx :: ctx = {}
  const token=this.token, lookupReviver=this.lookupReviver

  const queue=[], oidRefs=new Map(), refs=new ObjMap()
  const {root} = JSON.parse(aString, _json_reviver)

  while 0 !== queue.length ::
    const args = queue.shift()
    const revive = lookupReviver(args.kind) || ctx.reviveMissing
    if undefined === revive ::
      throw ReviverNotFound(`Missing registered revive functions for kind "${args.kind}"`)

    revive(args.obj, args, ctx)

  return root

  function _objForOid(oid) ::
    let obj = oidRefs.get(oid)
    if undefined === obj ::
      obj = Object.create(null)
      oidRefs.set(oid, obj)
    return obj

  function _json_reviver(key, value) ::
    if token === key ::
      delete this[token]

      if 'number' === typeof value ::
        refs.set @ this, _objForOid(value)

      else if Array.isArray(value) ::
        const [kind, oid] = value
        queue.push @: kind, oid
          , body: this, obj: _objForOid(oid)
      return

    else if null === value || 'object' !== typeof value ::
      return value

    const ans = refs.get(value)
    return ans !== undefined ? ans : value


function stringify(anObject) ::
  const token=this.token, findPreserver=this.findPreserver

  const queue=[], lookup=new Map()
  const root = JSON.stringify(anObject, _json_replacer)

  ::
    const flat = []
    while 0 !== queue.length ::
      const {oid, body} = queue.shift()
      flat[oid] = JSON.stringify(body, _json_replacer)

    const result =
      @[] `{"refs": [\n  `
        , flat.join(',\n  ')
        , ` ],\n`
        , ` "root": ${root} }\n`

    return result.join('')

  function _json_replacer(key, value) ::
    if value === null || 'object' !== typeof value ::
      return value

    const prev = lookup.get(value)
    if undefined !== prev ::
      return prev // already serialized -- reference existing item

    const entry = findPreserver(value)
    if undefined === entry ::
      return value // not a "special" preserved item; serialize normally

    // register id for object and return a JSON serializable version
    const oid = lookup.size
    const ref = {[token]: oid}
    lookup.set(value, ref)

    // transform live object into preserved form
    const body = Object.assign @
        {[token]: [entry.kind, oid]}
      , entry.preserve(value)

    queue.push @: oid, body
    return ref


function noop(obj) :: return obj

