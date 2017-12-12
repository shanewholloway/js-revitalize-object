export const root_obj = Object.freeze @ {}
export const root_list = Object.freeze @ []

export function encodeObjectTree(revitalizer, anObject, ctx, cb_addObject) ::
  const token=revitalizer.token
  const lookupPreserver=revitalizer.lookupPreserver
  const findPreserver=revitalizer._boundFindPreserveForObj()

  const queue=[], lookup=new Map(), v=[]
  v[0] = JSON.stringify(anObject, _json_replacer)

  while 0 !== queue.length ::
    const save = queue.shift(), {oid} = save
    let body, content
    try ::
      body = save(ctx)
      content = JSON.stringify(body, _json_replacer)
    catch err ::
      cb_addObject @ err, { oid, body }
      continue
    cb_addObject @ null, { oid, body, content }


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
    const save = ctx => ::
      const body = {[token]: [preserver.kind, oid]}
      if preserver.preserve ::
        const attrs = preserver.preserve(dstValue, srcValue, ctx)
        return Object.assign(body, attrs)
      else return Object.assign(body, dstValue)

    save.oid = oid
    queue.push @ save
    return ref

