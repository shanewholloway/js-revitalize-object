const ObjMap = 'undefined' !== typeof WeakMap ? WeakMap : Map

function decodeObjectTree(reviver, json_source, ctx) ::
  if null === json_source ::
    return null // JSON.parse(null) returns null; keep with convention

  const token=reviver.token
  const lookupReviver=reviver.lookupReviver

  const queue=[], byOid=new Map()
  JSON.parse(json_source, _json_create)

  const refs=new ObjMap()
  JSON.parse(json_source, _json_restore)

  const evts = {}
  const _start = Promise.resolve().then @ () =>
    queue.reverse().map @ entry => ::
      entry.evts = evts
      return entry.reviver.revive(entry.obj, entry, ctx)

  evts.started = _start.then @ lst => lst.length
  evts.finished = _start.then @ lst =>
    Promise.all(lst).then @ lst => lst.length

  evts.done = evts.finished.then @ () => ::
    const root = byOid.get(0)
    if null == root :: return

    const {obj, promise} = root
    return undefined === promise ? obj
      : promise.then @ ans =>
          ans !== undefined ? ans : obj

  return evts


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

