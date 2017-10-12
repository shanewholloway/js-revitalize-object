const root_obj = {}
const root_list = []

function encodeObjectTree(reviver, anObject, ctx, cb_addObject) ::
  const token=reviver.token
  const lookupPreserver=reviver.lookupPreserver
  const findPreserver=reviver._boundFindPreserveForObj()

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
          .then @
              body => ::
                try ::
                  var content = JSON.stringify(body, _json_replacer)
                catch err ::
                  return cb_addObject(err)
                return cb_addObject @ null, { oid, body, content }

              err => cb_addObject(err)

    return Promise.all(promises).then(_encodeQueue)

  function _json_replacer(key, dstValue) ::
    // srcValue !== dstValue for objects with .toJSON() methods
    const srcValue = this[key]

    if dstValue === null || 'object' !== typeof srcValue ::
      return dstValue

    const prev = lookup.get(srcValue)
    if undefined !== prev ::
      return prev // already serialized -- reference existing item

    let preserver = findPreserver(srcValue)
    if undefined === preserver ::
      // not a "special" preserved item
      if anObject !== srcValue ::
        return dstValue // so serialize normally
      // but it is the root, so store at oid 0
      preserver = lookupPreserver @
        Array.isArray(dstValue) ? root_list : root_obj

    // register id for object and return a JSON serializable version
    const oid = lookup.size
    const ref = {[token]: oid}
    lookup.set(srcValue, ref)

    // transform live object into preserved form
    const body = {[token]: [preserver.kind, oid]}
    const promise = Promise
      .resolve @
        preserver.preserve
          ? preserver.preserve(dstValue, srcValue, ctx)
          : dstValue
      .then @ attrs => Object.assign(body, attrs)

    promise.oid = oid
    queue.push @ promise
    return ref

