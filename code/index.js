/* The following inlined by package.json build script:

const {decodeObjectTree, ObjMap} = require('./decode')
const {encodeObjectTree, root_obj, root_list} = require('./encode')
*/

class Revitalization extends Function ::
  constructor() ::
    throw new Error('Use the static .create() instead of new')

  static create(token_p) ::
    register.token = token_p || '\u039E' // 'Ξ'

    const lutRevive=new Map()
    const lutPreserve=new ObjMap()

    const self = Object.setPrototypeOf(register, this.prototype)
    Object.defineProperties @ self, @{}
          lookupReviver: @{} value: lutRevive.get.bind(lutRevive)
          lookupPreserver: @{} value: lutPreserve.get.bind(lutPreserve)
          _setReviver: @{} value: _setReviver


    self.initRegistery(root_obj, root_list)
    return self

    function register() ::
      return self.register.apply(self, arguments)

    function _setReviver(reviver, kinds, matchers) ::
      lutRevive.set(reviver.kind, reviver)
      return @:
          alias(...kinds) ::
            for const each of kinds ::
              if each :: lutRevive.set(each, reviver)
            return this
          match(...matchers) ::
            for const each of matchers ::
              if null != each :: lutPreserve.set(each, reviver)
            return this


  initRegistery(root_obj, root_list) ::
    this
      .register @: kind: '{root}'
          revive(obj, entry) :: Object.assign(obj, entry.body)
      .match @ root_obj

    this
      .register @: kind: '[root]'
          preserve(rootList) :: return @{} _: rootList.slice()
          init(entry) :: return []
          revive(rootList, entry) ::
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

  registerReviver(reviver) ::
    ::
      const kind = reviver.kind
      if 'string' !== typeof kind && true !== kind && false !== kind && null !== kind ::
        throw new TypeError @ `"kind" must be a string`

      if reviver.init && 'function' !== typeof reviver.init ::
        throw new TypeError @ '"init" must be a function'

      if 'function' !== typeof reviver.revive ::
        throw new TypeError @ '"revive" must be a function'

      if reviver.preserve && 'function' !== typeof reviver.preserve ::
        throw new TypeError @ '"preserve" must be a function if provided'

    return this._setReviver(reviver)

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


  decode(json_source, ctx) ::
    if null === json_source ::
      return null // JSON.parse(null) returns null; keep with convention

    const evts = decodeObjectTree @ this, json_source, ctx
    return evts.done

  encode(anObject, ctx) ::
    const refs = []
    const promise = encodeObjectTree @ this, anObject, ctx, (err, entry) => ::
      refs[entry.oid] = entry.content

    const key = JSON.stringify @ `${this.token}refs`
    return promise.then @ () =>
      `{${key}: [\n  ${refs.join(',\n  ')} ]}\n`

  _boundFindPreserveForObj() ::
    const lookupPreserver = this.lookupPreserver
    return function(obj) ::
      let preserver = lookupPreserver(obj)
      if undefined !== preserver ::
        return preserver

      preserver = lookupPreserver(obj.constructor)
      if undefined !== preserver ::
        return preserver

      let proto = obj
      while null !== @ proto = Object.getPrototypeOf(proto) ::
        let preserver = lookupPreserver(proto)
        if undefined !== preserver ::
          return preserver


class ReviverNotFound extends Error ::

const createRegistry = Revitalization.create.bind(Revitalization)

module.exports = exports = createRegistry()
Object.assign @ exports, @{}
  Revitalization, ReviverNotFound
  createRegistry, create: createRegistry
