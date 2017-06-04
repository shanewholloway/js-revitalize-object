const ObjMap = 'undefined' !== typeof WeakMap ? WeakMap : Map

module.exports = exports = createRevitalizationRegistry()
Object.assign @ exports, @{}
  createRevitalizationRegistry, createRegistry: createRevitalizationRegistry

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
    return registerKind
      @ kind, (objBody) => Object.setPrototypeOf(objBody, klass.prototype)
      .match(klass, klass.prototype)

  function registerProto(kind, proto) ::
    return registerKind
      @ kind, (objBody) => Object.setPrototypeOf(objBody, proto)
      .match(proto)

  function registerKind(kind, revive, preserve) ::
    if 'function' !== typeof revive ::
      throw new TypeError @ '"revive" must be a function'

    if null == preserve ::
      preserve = default_preserve
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

  function default_preserve(obj) ::
    if obj.toJSON ::
      return obj.toJSON()
    return Object.assign({}, obj)

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
  const token=this.token, lookupReviver=this.lookupReviver

  const queue=[], oidRefs=new Map(), refs=new ObjMap()
  const root = JSON.parse(aString, _json_reviver)

  for const args of _lookupReviveForObjects(queue) ::
    args.revive(args.obj, args, ctx)

  return root

  function _json_reviver(key, value) ::
    if token === key ::
      if 'number' === typeof value ::
        const oid = value
        const obj = oidRefs.get(oid)
        if undefined === obj ::
          throw new Error(`Referenced object id "${oid}" not found`)
        else :: refs.set(this, obj)

      else ::
        const [kind, oid] = value
        oidRefs.set(oid, this)
        queue.push @: kind, oid, obj: this

      return

    else if null === value || 'object' !== typeof value ::
      return value

    const ans = refs.get(value)
    return ans !== undefined ? ans : value

  function _lookupReviveForObjects(queue) ::
    let missing
    for const args of queue ::
      const revive = lookupReviver(args.kind)
      if undefined === revive ::
        missing = [].concat(missing || [], [args.kind])
      else :: args.revive = revive
    
    if undefined !== missing ::
      const err = TypeError(`Missing registered revive functions for kinds: ${JSON.stringify(missing)}`)
      err.missing = missing
      throw err

    return queue


function stringify(anObject, space) ::
  const token=this.token, findPreserver=this.findPreserver

  const refs = new Map()
  return JSON.stringify(anObject, _json_replacer, space)

  function _json_replacer(key, value) ::
    if value === null || 'object' !== typeof value ::
      return value

    const prev = refs.get(value)
    if undefined !== prev ::
      return prev // already serialized -- reference existing item

    const entry = findPreserver(value)
    if undefined === entry ::
      return value // not a "special" preserved item; serialize normally


    // transform live object into preserved form
    let body = entry.preserve(value)
    if body === value ::
      body = Object.assign({}, body)

    // register id for object and return a JSON serializable version
    const oid = refs.size
    body[token] = [entry.kind, oid]
    refs.set @ value, {[token]: oid}
    return body

