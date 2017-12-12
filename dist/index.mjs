const ObjMap = 'undefined' !== typeof WeakMap ? WeakMap : Map;

function decodeObjectTree(revitalizer, json_source, ctx) {
  if (null === json_source) {
    return null; // JSON.parse(null) returns null; keep with convention
  }const token = revitalizer.token;
  const lookupReviver = revitalizer.lookupReviver;

  const queue = [],
        byOid = new Map(),
        v = [];
  v[0] = JSON.parse(json_source, _json_create);

  const refs = new ObjMap();
  v[1] = JSON.parse(json_source, _json_restore);

  const evts = {};
  const _start = Promise.resolve().then(() => queue.reverse().map(entry => {
    entry.evts = evts;
    return entry.reviver.revive(entry.obj, entry, ctx);
  }));

  evts.started = _start.then(lst => lst.length);
  evts.finished = _start.then(lst => Promise.all(lst).then(lst => lst.length));

  evts.done = evts.finished.then(() => {
    const root = byOid.get(0);
    if (null == root) {
      return;
    }

    const { obj, promise } = root;
    return undefined === promise ? obj : promise.then(ans => ans !== undefined ? ans : obj);
  });

  return evts;

  function _json_create(key, value) {
    if (token === key) {
      if ('number' === typeof value) {} else if (Array.isArray(value)) {
        delete this[token];

        const [kind, oid] = value;
        const reviver = lookupReviver(kind);
        if (undefined === reviver) {
          throw new ReviverNotFound(`Missing registered reviver for kind "${kind}"`);
        }

        const entry = { kind, oid, reviver, body: this };

        entry.obj = reviver.init ? reviver.init(entry, ctx) : Object.create(null);

        byOid.set(oid, entry);
        queue.push(entry);
      }
      return;
    }

    return value;
  }

  function _json_restore(key, value) {
    if (token === key) {
      if ('number' === typeof value) {
        refs.set(this, byOid.get(value).obj);
      } else if (Array.isArray(value)) {
        const entry = byOid.get(value[1]);
        entry.body = this;
        refs.set(this, entry.obj);
      }
      return;
    } else if (null === value || 'object' !== typeof value) {
      return value;
    }

    const ans = refs.get(value);
    return ans !== undefined ? ans : value;
  }
}

const root_obj = Object.freeze({});
const root_list = Object.freeze([]);

function encodeObjectTree(revitalizer, anObject, ctx, cb_addObject) {
  const token = revitalizer.token;
  const lookupPreserver = revitalizer.lookupPreserver;
  const findPreserver = revitalizer._boundFindPreserveForObj();

  const queue = [],
        lookup = new Map(),
        v = [];
  v[0] = JSON.stringify(anObject, _json_replacer);

  while (0 !== queue.length) {
    const save = queue.shift(),
          { oid } = save;
    let body, content;
    try {
      body = save(ctx);
      content = JSON.stringify(body, _json_replacer);
    } catch (err) {
      cb_addObject(err, { oid, body });
      continue;
    }
    cb_addObject(null, { oid, body, content });
  }

  function _json_replacer(key, dstValue) {
    // srcValue !== dstValue for objects with .toJSON() methods
    const srcValue = this[key];

    if (dstValue === null || 'object' !== typeof srcValue) {
      return dstValue;
    }

    const prev = lookup.get(srcValue);
    if (undefined !== prev) {
      return prev; // already serialized -- reference existing item
    }let preserver = findPreserver(srcValue);
    if (undefined === preserver) {
      // not a "special" preserved item
      if (anObject !== srcValue) {
        return dstValue; // so serialize normally
      }
      // but it is the root, so store at oid 0
      preserver = lookupPreserver(Array.isArray(dstValue) ? root_list : root_obj);
    }

    // register id for object and return a JSON serializable version
    const oid = lookup.size;
    const ref = { [token]: oid };
    lookup.set(srcValue, ref);

    // transform live object into preserved form
    const save = ctx => {
      const body = { [token]: [preserver.kind, oid] };
      if (preserver.preserve) {
        const attrs = preserver.preserve(dstValue, srcValue, ctx);
        return Object.assign(body, attrs);
      } else return Object.assign(body, dstValue);
    };

    save.oid = oid;
    queue.push(save);
    return ref;
  }
}

class Revitalization extends Function {
  constructor() {
    throw new Error('Use the static .create() instead of new');
  }

  static create(token_p) {
    register.token = token_p || '\u039E'; // 'Ξ'

    const lutRevive = new Map();
    const lutPreserve = new ObjMap();

    const self = Object.setPrototypeOf(register, this.prototype);
    Object.defineProperties(self, {
      lookupReviver: { value: lutRevive.get.bind(lutRevive) },
      lookupPreserver: { value: lutPreserve.get.bind(lutPreserve) },
      _setReviver: { value: _setReviver } });

    self.initRegistery(root_obj, root_list);
    return self;

    function register() {
      return self.register.apply(self, arguments);
    }

    function _setReviver(reviver, kinds, matchers) {
      lutRevive.set(reviver.kind, reviver);
      return {
        alias(...kinds) {
          for (const each of kinds) {
            if (each) {
              lutRevive.set(each, reviver);
            }
          }
          return this;
        },
        match(...matchers) {
          for (const each of matchers) {
            if (null != each) {
              lutPreserve.set(each, reviver);
            }
          }
          return this;
        } };
    }
  }

  initRegistery(root_obj$$1, root_list$$1) {
    this.register({ kind: '{root}',
      revive(obj, entry) {
        Object.assign(obj, entry.body);
      } }).match(root_obj$$1);

    this.register({ kind: '[root]',
      preserve(rootList) {
        return { _: rootList.slice() };
      },
      init(entry) {
        return [];
      },
      revive(rootList, entry) {
        rootList.push.apply(rootList, entry.body._);
      } }).match(root_list$$1);
  }

  register(revitalizer) {
    if ('kind' in revitalizer && revitalizer.revive) {
      return this.registerReviver(revitalizer);
    }

    let tgt;
    if (undefined !== revitalizer.prototype) {
      tgt = revitalizer.prototype[this.token];
      if (undefined !== tgt) {
        if ('function' === typeof tgt) {
          tgt = tgt.call(revitalizer.prototype, this);
          if (null == tgt) {
            return;
          }
        }
        if ('string' === typeof tgt) {
          return this.registerClass(tgt, revitalizer);
        }
      }
    }

    tgt = revitalizer[this.token];
    if (undefined !== tgt) {
      if ('function' === typeof tgt) {
        tgt = tgt.call(revitalizer, this);
        if (null == tgt) {
          return;
        }
      }
      if ('string' === typeof tgt) {
        return this.registerProto(tgt, revitalizer.prototype || revitalizer).match(revitalizer);
      }
    }

    throw new TypeError(`Unrecognized revitalization registration`);
  }

  registerReviver(reviver) {
    {
      const kind = reviver.kind;
      if ('string' !== typeof kind && true !== kind && false !== kind && null !== kind) {
        throw new TypeError(`"kind" must be a string`);
      }

      if (reviver.init && 'function' !== typeof reviver.init) {
        throw new TypeError('"init" must be a function');
      }

      if ('function' !== typeof reviver.revive) {
        throw new TypeError('"revive" must be a function');
      }

      if (reviver.preserve && 'function' !== typeof reviver.preserve) {
        throw new TypeError('"preserve" must be a function if provided');
      }
    }

    return this._setReviver(reviver);
  }

  registerClass(kind, klass) {
    return this.registerReviver({ kind,
      revive(obj, entry) {
        obj = Object.assign(obj, entry.body);
        Object.setPrototypeOf(obj, klass.prototype);
      } }).match(klass, klass.prototype);
  }

  registerProto(kind, proto) {
    return this.registerReviver({ kind,
      revive(obj, entry) {
        obj = Object.assign(obj, entry.body);
        Object.setPrototypeOf(obj, proto);
      } }).match(proto);
  }

  decode(json_source, ctx) {
    if (null === json_source) {
      return null; // JSON.parse(null) returns null; keep with convention
    }const evts = decodeObjectTree(this, json_source, ctx);
    return evts.done;
  }

  encodeToRefs(anObject, ctx, refs) {
    if (null == refs) {
      refs = [];
    }
    encodeObjectTree(this, anObject, ctx, (err, entry) => {
      refs[entry.oid] = entry.content;
    });
    return refs;
  }

  encode(anObject, ctx, pretty) {
    const refs = this.encodeToRefs(anObject, ctx);
    const key = JSON.stringify(`${this.token}refs`);
    return pretty ? `{${key}: [\n  ${refs.join(',\n  ')} ]}\n` : `{${key}:[${refs.join(',')}]}`;
  }

  _boundFindPreserveForObj() {
    const lookupPreserver = this.lookupPreserver;
    return function (obj) {
      let preserver = lookupPreserver(obj);
      if (undefined !== preserver) {
        return preserver;
      }

      preserver = lookupPreserver(obj.constructor);
      if (undefined !== preserver) {
        return preserver;
      }

      let proto = obj;
      while (null !== (proto = Object.getPrototypeOf(proto))) {
        let preserver = lookupPreserver(proto);
        if (undefined !== preserver) {
          return preserver;
        }
      }
    };
  }
}

class ReviverNotFound$1 extends Error {}

const createRegistry = Revitalization.create.bind(Revitalization);

var index = createRegistry();

export { createRegistry, createRegistry as create, root_obj, root_list, encodeObjectTree, ObjMap, decodeObjectTree, Revitalization, ReviverNotFound$1 as ReviverNotFound };
export default index;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL2RlY29kZS5qcyIsIi4uL2NvZGUvZW5jb2RlLmpzIiwiLi4vY29kZS9yZXZpdGFsaXphdGlvbi5qcyIsIi4uL2NvZGUvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IE9iak1hcCA9ICd1bmRlZmluZWQnICE9PSB0eXBlb2YgV2Vha01hcCA/IFdlYWtNYXAgOiBNYXBcblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZU9iamVjdFRyZWUocmV2aXRhbGl6ZXIsIGpzb25fc291cmNlLCBjdHgpIDo6XG4gIGlmIG51bGwgPT09IGpzb25fc291cmNlIDo6XG4gICAgcmV0dXJuIG51bGwgLy8gSlNPTi5wYXJzZShudWxsKSByZXR1cm5zIG51bGw7IGtlZXAgd2l0aCBjb252ZW50aW9uXG5cbiAgY29uc3QgdG9rZW49cmV2aXRhbGl6ZXIudG9rZW5cbiAgY29uc3QgbG9va3VwUmV2aXZlcj1yZXZpdGFsaXplci5sb29rdXBSZXZpdmVyXG5cbiAgY29uc3QgcXVldWU9W10sIGJ5T2lkPW5ldyBNYXAoKSwgdj1bXVxuICB2WzBdID0gSlNPTi5wYXJzZShqc29uX3NvdXJjZSwgX2pzb25fY3JlYXRlKVxuXG4gIGNvbnN0IHJlZnM9bmV3IE9iak1hcCgpXG4gIHZbMV0gPSBKU09OLnBhcnNlKGpzb25fc291cmNlLCBfanNvbl9yZXN0b3JlKVxuXG4gIGNvbnN0IGV2dHMgPSB7fVxuICBjb25zdCBfc3RhcnQgPSBQcm9taXNlLnJlc29sdmUoKS50aGVuIEAgKCkgPT5cbiAgICBxdWV1ZS5yZXZlcnNlKCkubWFwIEAgZW50cnkgPT4gOjpcbiAgICAgIGVudHJ5LmV2dHMgPSBldnRzXG4gICAgICByZXR1cm4gZW50cnkucmV2aXZlci5yZXZpdmUoZW50cnkub2JqLCBlbnRyeSwgY3R4KVxuXG4gIGV2dHMuc3RhcnRlZCA9IF9zdGFydC50aGVuIEAgbHN0ID0+IGxzdC5sZW5ndGhcbiAgZXZ0cy5maW5pc2hlZCA9IF9zdGFydC50aGVuIEAgbHN0ID0+XG4gICAgUHJvbWlzZS5hbGwobHN0KS50aGVuIEAgbHN0ID0+IGxzdC5sZW5ndGhcblxuICBldnRzLmRvbmUgPSBldnRzLmZpbmlzaGVkLnRoZW4gQCAoKSA9PiA6OlxuICAgIGNvbnN0IHJvb3QgPSBieU9pZC5nZXQoMClcbiAgICBpZiBudWxsID09IHJvb3QgOjogcmV0dXJuXG5cbiAgICBjb25zdCB7b2JqLCBwcm9taXNlfSA9IHJvb3RcbiAgICByZXR1cm4gdW5kZWZpbmVkID09PSBwcm9taXNlID8gb2JqXG4gICAgICA6IHByb21pc2UudGhlbiBAIGFucyA9PlxuICAgICAgICAgIGFucyAhPT0gdW5kZWZpbmVkID8gYW5zIDogb2JqXG5cbiAgcmV0dXJuIGV2dHNcblxuXG4gIGZ1bmN0aW9uIF9qc29uX2NyZWF0ZShrZXksIHZhbHVlKSA6OlxuICAgIGlmIHRva2VuID09PSBrZXkgOjpcbiAgICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgIGVsc2UgaWYgQXJyYXkuaXNBcnJheSh2YWx1ZSkgOjpcbiAgICAgICAgZGVsZXRlIHRoaXNbdG9rZW5dXG5cbiAgICAgICAgY29uc3QgW2tpbmQsIG9pZF0gPSB2YWx1ZVxuICAgICAgICBjb25zdCByZXZpdmVyID0gbG9va3VwUmV2aXZlcihraW5kKVxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IHJldml2ZXIgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgUmV2aXZlck5vdEZvdW5kKGBNaXNzaW5nIHJlZ2lzdGVyZWQgcmV2aXZlciBmb3Iga2luZCBcIiR7a2luZH1cImApXG5cbiAgICAgICAgY29uc3QgZW50cnkgPSBAOiBraW5kLCBvaWQsIHJldml2ZXIsIGJvZHk6IHRoaXNcblxuICAgICAgICBlbnRyeS5vYmogPSByZXZpdmVyLmluaXRcbiAgICAgICAgICA/IHJldml2ZXIuaW5pdChlbnRyeSwgY3R4KVxuICAgICAgICAgIDogT2JqZWN0LmNyZWF0ZShudWxsKVxuXG4gICAgICAgIGJ5T2lkLnNldChvaWQsIGVudHJ5KVxuICAgICAgICBxdWV1ZS5wdXNoKGVudHJ5KVxuICAgICAgcmV0dXJuXG5cbiAgICByZXR1cm4gdmFsdWVcblxuXG4gIGZ1bmN0aW9uIF9qc29uX3Jlc3RvcmUoa2V5LCB2YWx1ZSkgOjpcbiAgICBpZiB0b2tlbiA9PT0ga2V5IDo6XG4gICAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIHJlZnMuc2V0IEAgdGhpcywgYnlPaWQuZ2V0KHZhbHVlKS5vYmpcblxuICAgICAgZWxzZSBpZiBBcnJheS5pc0FycmF5KHZhbHVlKSA6OlxuICAgICAgICBjb25zdCBlbnRyeSA9IGJ5T2lkLmdldCh2YWx1ZVsxXSlcbiAgICAgICAgZW50cnkuYm9keSA9IHRoaXNcbiAgICAgICAgcmVmcy5zZXQgQCB0aGlzLCBlbnRyeS5vYmpcbiAgICAgIHJldHVyblxuXG4gICAgZWxzZSBpZiBudWxsID09PSB2YWx1ZSB8fCAnb2JqZWN0JyAhPT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICByZXR1cm4gdmFsdWVcblxuICAgIGNvbnN0IGFucyA9IHJlZnMuZ2V0KHZhbHVlKVxuICAgIHJldHVybiBhbnMgIT09IHVuZGVmaW5lZCA/IGFucyA6IHZhbHVlXG5cbiIsImV4cG9ydCBjb25zdCByb290X29iaiA9IE9iamVjdC5mcmVlemUgQCB7fVxuZXhwb3J0IGNvbnN0IHJvb3RfbGlzdCA9IE9iamVjdC5mcmVlemUgQCBbXVxuXG5leHBvcnQgZnVuY3Rpb24gZW5jb2RlT2JqZWN0VHJlZShyZXZpdGFsaXplciwgYW5PYmplY3QsIGN0eCwgY2JfYWRkT2JqZWN0KSA6OlxuICBjb25zdCB0b2tlbj1yZXZpdGFsaXplci50b2tlblxuICBjb25zdCBsb29rdXBQcmVzZXJ2ZXI9cmV2aXRhbGl6ZXIubG9va3VwUHJlc2VydmVyXG4gIGNvbnN0IGZpbmRQcmVzZXJ2ZXI9cmV2aXRhbGl6ZXIuX2JvdW5kRmluZFByZXNlcnZlRm9yT2JqKClcblxuICBjb25zdCBxdWV1ZT1bXSwgbG9va3VwPW5ldyBNYXAoKSwgdj1bXVxuICB2WzBdID0gSlNPTi5zdHJpbmdpZnkoYW5PYmplY3QsIF9qc29uX3JlcGxhY2VyKVxuXG4gIHdoaWxlIDAgIT09IHF1ZXVlLmxlbmd0aCA6OlxuICAgIGNvbnN0IHNhdmUgPSBxdWV1ZS5zaGlmdCgpLCB7b2lkfSA9IHNhdmVcbiAgICBsZXQgYm9keSwgY29udGVudFxuICAgIHRyeSA6OlxuICAgICAgYm9keSA9IHNhdmUoY3R4KVxuICAgICAgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KGJvZHksIF9qc29uX3JlcGxhY2VyKVxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgY2JfYWRkT2JqZWN0IEAgZXJyLCB7IG9pZCwgYm9keSB9XG4gICAgICBjb250aW51ZVxuICAgIGNiX2FkZE9iamVjdCBAIG51bGwsIHsgb2lkLCBib2R5LCBjb250ZW50IH1cblxuXG4gIGZ1bmN0aW9uIF9qc29uX3JlcGxhY2VyKGtleSwgZHN0VmFsdWUpIDo6XG4gICAgLy8gc3JjVmFsdWUgIT09IGRzdFZhbHVlIGZvciBvYmplY3RzIHdpdGggLnRvSlNPTigpIG1ldGhvZHNcbiAgICBjb25zdCBzcmNWYWx1ZSA9IHRoaXNba2V5XVxuXG4gICAgaWYgZHN0VmFsdWUgPT09IG51bGwgfHwgJ29iamVjdCcgIT09IHR5cGVvZiBzcmNWYWx1ZSA6OlxuICAgICAgcmV0dXJuIGRzdFZhbHVlXG5cbiAgICBjb25zdCBwcmV2ID0gbG9va3VwLmdldChzcmNWYWx1ZSlcbiAgICBpZiB1bmRlZmluZWQgIT09IHByZXYgOjpcbiAgICAgIHJldHVybiBwcmV2IC8vIGFscmVhZHkgc2VyaWFsaXplZCAtLSByZWZlcmVuY2UgZXhpc3RpbmcgaXRlbVxuXG4gICAgbGV0IHByZXNlcnZlciA9IGZpbmRQcmVzZXJ2ZXIoc3JjVmFsdWUpXG4gICAgaWYgdW5kZWZpbmVkID09PSBwcmVzZXJ2ZXIgOjpcbiAgICAgIC8vIG5vdCBhIFwic3BlY2lhbFwiIHByZXNlcnZlZCBpdGVtXG4gICAgICBpZiBhbk9iamVjdCAhPT0gc3JjVmFsdWUgOjpcbiAgICAgICAgcmV0dXJuIGRzdFZhbHVlIC8vIHNvIHNlcmlhbGl6ZSBub3JtYWxseVxuICAgICAgLy8gYnV0IGl0IGlzIHRoZSByb290LCBzbyBzdG9yZSBhdCBvaWQgMFxuICAgICAgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyIEBcbiAgICAgICAgQXJyYXkuaXNBcnJheShkc3RWYWx1ZSkgPyByb290X2xpc3QgOiByb290X29ialxuXG4gICAgLy8gcmVnaXN0ZXIgaWQgZm9yIG9iamVjdCBhbmQgcmV0dXJuIGEgSlNPTiBzZXJpYWxpemFibGUgdmVyc2lvblxuICAgIGNvbnN0IG9pZCA9IGxvb2t1cC5zaXplXG4gICAgY29uc3QgcmVmID0ge1t0b2tlbl06IG9pZH1cbiAgICBsb29rdXAuc2V0KHNyY1ZhbHVlLCByZWYpXG5cbiAgICAvLyB0cmFuc2Zvcm0gbGl2ZSBvYmplY3QgaW50byBwcmVzZXJ2ZWQgZm9ybVxuICAgIGNvbnN0IHNhdmUgPSBjdHggPT4gOjpcbiAgICAgIGNvbnN0IGJvZHkgPSB7W3Rva2VuXTogW3ByZXNlcnZlci5raW5kLCBvaWRdfVxuICAgICAgaWYgcHJlc2VydmVyLnByZXNlcnZlIDo6XG4gICAgICAgIGNvbnN0IGF0dHJzID0gcHJlc2VydmVyLnByZXNlcnZlKGRzdFZhbHVlLCBzcmNWYWx1ZSwgY3R4KVxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihib2R5LCBhdHRycylcbiAgICAgIGVsc2UgcmV0dXJuIE9iamVjdC5hc3NpZ24oYm9keSwgZHN0VmFsdWUpXG5cbiAgICBzYXZlLm9pZCA9IG9pZFxuICAgIHF1ZXVlLnB1c2ggQCBzYXZlXG4gICAgcmV0dXJuIHJlZlxuXG4iLCJpbXBvcnQge2RlY29kZU9iamVjdFRyZWUsIE9iak1hcH0gZnJvbSAnLi9kZWNvZGUnXG5pbXBvcnQge2VuY29kZU9iamVjdFRyZWUsIHJvb3Rfb2JqLCByb290X2xpc3R9IGZyb20gJy4vZW5jb2RlJ1xuXG5leHBvcnQgY2xhc3MgUmV2aXRhbGl6YXRpb24gZXh0ZW5kcyBGdW5jdGlvbiA6OlxuICBjb25zdHJ1Y3RvcigpIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVc2UgdGhlIHN0YXRpYyAuY3JlYXRlKCkgaW5zdGVhZCBvZiBuZXcnKVxuXG4gIHN0YXRpYyBjcmVhdGUodG9rZW5fcCkgOjpcbiAgICByZWdpc3Rlci50b2tlbiA9IHRva2VuX3AgfHwgJ1xcdTAzOUUnIC8vICfOnidcblxuICAgIGNvbnN0IGx1dFJldml2ZT1uZXcgTWFwKClcbiAgICBjb25zdCBsdXRQcmVzZXJ2ZT1uZXcgT2JqTWFwKClcblxuICAgIGNvbnN0IHNlbGYgPSBPYmplY3Quc2V0UHJvdG90eXBlT2YocmVnaXN0ZXIsIHRoaXMucHJvdG90eXBlKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgc2VsZiwgQHt9XG4gICAgICBsb29rdXBSZXZpdmVyOiBAe30gdmFsdWU6IGx1dFJldml2ZS5nZXQuYmluZChsdXRSZXZpdmUpXG4gICAgICBsb29rdXBQcmVzZXJ2ZXI6IEB7fSB2YWx1ZTogbHV0UHJlc2VydmUuZ2V0LmJpbmQobHV0UHJlc2VydmUpXG4gICAgICBfc2V0UmV2aXZlcjogQHt9IHZhbHVlOiBfc2V0UmV2aXZlclxuXG5cbiAgICBzZWxmLmluaXRSZWdpc3Rlcnkocm9vdF9vYmosIHJvb3RfbGlzdClcbiAgICByZXR1cm4gc2VsZlxuXG4gICAgZnVuY3Rpb24gcmVnaXN0ZXIoKSA6OlxuICAgICAgcmV0dXJuIHNlbGYucmVnaXN0ZXIuYXBwbHkoc2VsZiwgYXJndW1lbnRzKVxuXG4gICAgZnVuY3Rpb24gX3NldFJldml2ZXIocmV2aXZlciwga2luZHMsIG1hdGNoZXJzKSA6OlxuICAgICAgbHV0UmV2aXZlLnNldChyZXZpdmVyLmtpbmQsIHJldml2ZXIpXG4gICAgICByZXR1cm4gQDpcbiAgICAgICAgYWxpYXMoLi4ua2luZHMpIDo6XG4gICAgICAgICAgZm9yIGNvbnN0IGVhY2ggb2Yga2luZHMgOjpcbiAgICAgICAgICAgIGlmIGVhY2ggOjogbHV0UmV2aXZlLnNldChlYWNoLCByZXZpdmVyKVxuICAgICAgICAgIHJldHVybiB0aGlzXG4gICAgICAgIG1hdGNoKC4uLm1hdGNoZXJzKSA6OlxuICAgICAgICAgIGZvciBjb25zdCBlYWNoIG9mIG1hdGNoZXJzIDo6XG4gICAgICAgICAgICBpZiBudWxsICE9IGVhY2ggOjogbHV0UHJlc2VydmUuc2V0KGVhY2gsIHJldml2ZXIpXG4gICAgICAgICAgcmV0dXJuIHRoaXNcblxuXG4gIGluaXRSZWdpc3Rlcnkocm9vdF9vYmosIHJvb3RfbGlzdCkgOjpcbiAgICB0aGlzXG4gICAgICAucmVnaXN0ZXIgQDoga2luZDogJ3tyb290fSdcbiAgICAgICAgcmV2aXZlKG9iaiwgZW50cnkpIDo6IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgLm1hdGNoIEAgcm9vdF9vYmpcblxuICAgIHRoaXNcbiAgICAgIC5yZWdpc3RlciBAOiBraW5kOiAnW3Jvb3RdJ1xuICAgICAgICBwcmVzZXJ2ZShyb290TGlzdCkgOjogcmV0dXJuIEB7fSBfOiByb290TGlzdC5zbGljZSgpXG4gICAgICAgIGluaXQoZW50cnkpIDo6IHJldHVybiBbXVxuICAgICAgICByZXZpdmUocm9vdExpc3QsIGVudHJ5KSA6OlxuICAgICAgICAgIHJvb3RMaXN0LnB1c2guYXBwbHkocm9vdExpc3QsIGVudHJ5LmJvZHkuXylcbiAgICAgIC5tYXRjaCBAIHJvb3RfbGlzdFxuXG4gIHJlZ2lzdGVyKHJldml0YWxpemVyKSA6OlxuICAgIGlmICdraW5kJyBpbiByZXZpdGFsaXplciAmJiByZXZpdGFsaXplci5yZXZpdmUgOjpcbiAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyUmV2aXZlcihyZXZpdGFsaXplcilcblxuICAgIGxldCB0Z3RcbiAgICBpZiB1bmRlZmluZWQgIT09IHJldml0YWxpemVyLnByb3RvdHlwZSA6OlxuICAgICAgdGd0ID0gcmV2aXRhbGl6ZXIucHJvdG90eXBlW3RoaXMudG9rZW5dXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRndCA6OlxuICAgICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgICAgdGd0ID0gdGd0LmNhbGwocmV2aXRhbGl6ZXIucHJvdG90eXBlLCB0aGlzKVxuICAgICAgICAgIGlmIG51bGwgPT0gdGd0IDo6IHJldHVyblxuICAgICAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyQ2xhc3ModGd0LCByZXZpdGFsaXplcilcblxuICAgIHRndCA9IHJldml0YWxpemVyW3RoaXMudG9rZW5dXG4gICAgaWYgdW5kZWZpbmVkICE9PSB0Z3QgOjpcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgdGd0ID0gdGd0LmNhbGwocmV2aXRhbGl6ZXIsIHRoaXMpXG4gICAgICAgIGlmIG51bGwgPT0gdGd0IDo6IHJldHVyblxuICAgICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJQcm90byh0Z3QsIHJldml0YWxpemVyLnByb3RvdHlwZSB8fCByZXZpdGFsaXplcilcbiAgICAgICAgICAubWF0Y2gocmV2aXRhbGl6ZXIpXG5cbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBVbnJlY29nbml6ZWQgcmV2aXRhbGl6YXRpb24gcmVnaXN0cmF0aW9uYClcblxuICByZWdpc3RlclJldml2ZXIocmV2aXZlcikgOjpcbiAgICA6OlxuICAgICAgY29uc3Qga2luZCA9IHJldml2ZXIua2luZFxuICAgICAgaWYgJ3N0cmluZycgIT09IHR5cGVvZiBraW5kICYmIHRydWUgIT09IGtpbmQgJiYgZmFsc2UgIT09IGtpbmQgJiYgbnVsbCAhPT0ga2luZCA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYFwia2luZFwiIG11c3QgYmUgYSBzdHJpbmdgXG5cbiAgICAgIGlmIHJldml2ZXIuaW5pdCAmJiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmV2aXZlci5pbml0IDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCAnXCJpbml0XCIgbXVzdCBiZSBhIGZ1bmN0aW9uJ1xuXG4gICAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmV2aXZlci5yZXZpdmUgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcInJldml2ZVwiIG11c3QgYmUgYSBmdW5jdGlvbidcblxuICAgICAgaWYgcmV2aXZlci5wcmVzZXJ2ZSAmJiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmV2aXZlci5wcmVzZXJ2ZSA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wicHJlc2VydmVcIiBtdXN0IGJlIGEgZnVuY3Rpb24gaWYgcHJvdmlkZWQnXG5cbiAgICByZXR1cm4gdGhpcy5fc2V0UmV2aXZlcihyZXZpdmVyKVxuXG4gIHJlZ2lzdGVyQ2xhc3Moa2luZCwga2xhc3MpIDo6XG4gICAgcmV0dXJuIHRoaXNcbiAgICAgIC5yZWdpc3RlclJldml2ZXIgQDoga2luZCxcbiAgICAgICAgcmV2aXZlKG9iaiwgZW50cnkpIDo6XG4gICAgICAgICAgb2JqID0gT2JqZWN0LmFzc2lnbihvYmosIGVudHJ5LmJvZHkpXG4gICAgICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKG9iaiwga2xhc3MucHJvdG90eXBlKVxuICAgICAgLm1hdGNoKGtsYXNzLCBrbGFzcy5wcm90b3R5cGUpXG5cbiAgcmVnaXN0ZXJQcm90byhraW5kLCBwcm90bykgOjpcbiAgICByZXR1cm4gdGhpc1xuICAgICAgLnJlZ2lzdGVyUmV2aXZlciBAOiBraW5kLFxuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjpcbiAgICAgICAgICBvYmogPSBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2Yob2JqLCBwcm90bylcbiAgICAgIC5tYXRjaChwcm90bylcblxuXG4gIGRlY29kZShqc29uX3NvdXJjZSwgY3R4KSA6OlxuICAgIGlmIG51bGwgPT09IGpzb25fc291cmNlIDo6XG4gICAgICByZXR1cm4gbnVsbCAvLyBKU09OLnBhcnNlKG51bGwpIHJldHVybnMgbnVsbDsga2VlcCB3aXRoIGNvbnZlbnRpb25cblxuICAgIGNvbnN0IGV2dHMgPSBkZWNvZGVPYmplY3RUcmVlIEAgdGhpcywganNvbl9zb3VyY2UsIGN0eFxuICAgIHJldHVybiBldnRzLmRvbmVcblxuICBlbmNvZGVUb1JlZnMoYW5PYmplY3QsIGN0eCwgcmVmcykgOjpcbiAgICBpZiBudWxsID09IHJlZnMgOjogcmVmcyA9IFtdXG4gICAgZW5jb2RlT2JqZWN0VHJlZSBAIHRoaXMsIGFuT2JqZWN0LCBjdHgsIChlcnIsIGVudHJ5KSA9PiA6OlxuICAgICAgcmVmc1tlbnRyeS5vaWRdID0gZW50cnkuY29udGVudFxuICAgIHJldHVybiByZWZzXG5cbiAgZW5jb2RlKGFuT2JqZWN0LCBjdHgsIHByZXR0eSkgOjpcbiAgICBjb25zdCByZWZzID0gdGhpcy5lbmNvZGVUb1JlZnMoYW5PYmplY3QsIGN0eClcbiAgICBjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeSBAIGAke3RoaXMudG9rZW59cmVmc2BcbiAgICByZXR1cm4gcHJldHR5XG4gICAgICA/IGB7JHtrZXl9OiBbXFxuICAke3JlZnMuam9pbignLFxcbiAgJyl9IF19XFxuYFxuICAgICAgOiBgeyR7a2V5fTpbJHtyZWZzLmpvaW4oJywnKX1dfWBcblxuICBfYm91bmRGaW5kUHJlc2VydmVGb3JPYmooKSA6OlxuICAgIGNvbnN0IGxvb2t1cFByZXNlcnZlciA9IHRoaXMubG9va3VwUHJlc2VydmVyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikgOjpcbiAgICAgIGxldCBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIob2JqKVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG4gICAgICBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIob2JqLmNvbnN0cnVjdG9yKVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG4gICAgICBsZXQgcHJvdG8gPSBvYmpcbiAgICAgIHdoaWxlIG51bGwgIT09IEAgcHJvdG8gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YocHJvdG8pIDo6XG4gICAgICAgIGxldCBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIocHJvdG8pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJlc2VydmVyIDo6XG4gICAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG5cbmV4cG9ydCBjbGFzcyBSZXZpdmVyTm90Rm91bmQgZXh0ZW5kcyBFcnJvciA6OlxuXG4iLCJpbXBvcnQge1Jldml0YWxpemF0aW9ufSBmcm9tICcuL3Jldml0YWxpemF0aW9uJ1xuXG5jb25zdCBjcmVhdGVSZWdpc3RyeSA9IFJldml0YWxpemF0aW9uLmNyZWF0ZS5iaW5kKFJldml0YWxpemF0aW9uKVxuXG5leHBvcnQgKiBmcm9tICcuL2VuY29kZSdcbmV4cG9ydCAqIGZyb20gJy4vZGVjb2RlJ1xuZXhwb3J0ICogZnJvbSAnLi9yZXZpdGFsaXphdGlvbidcbmV4cG9ydCBkZWZhdWx0IGNyZWF0ZVJlZ2lzdHJ5KClcbmV4cG9ydCBAe31cbiAgY3JlYXRlUmVnaXN0cnlcbiAgY3JlYXRlUmVnaXN0cnkgYXMgY3JlYXRlXG5cbiJdLCJuYW1lcyI6WyJPYmpNYXAiLCJXZWFrTWFwIiwiTWFwIiwiZGVjb2RlT2JqZWN0VHJlZSIsInJldml0YWxpemVyIiwianNvbl9zb3VyY2UiLCJjdHgiLCJ0b2tlbiIsImxvb2t1cFJldml2ZXIiLCJxdWV1ZSIsImJ5T2lkIiwidiIsIkpTT04iLCJwYXJzZSIsIl9qc29uX2NyZWF0ZSIsInJlZnMiLCJfanNvbl9yZXN0b3JlIiwiZXZ0cyIsIl9zdGFydCIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsInJldmVyc2UiLCJtYXAiLCJlbnRyeSIsInJldml2ZXIiLCJyZXZpdmUiLCJvYmoiLCJzdGFydGVkIiwibHN0IiwibGVuZ3RoIiwiZmluaXNoZWQiLCJhbGwiLCJkb25lIiwicm9vdCIsImdldCIsInByb21pc2UiLCJ1bmRlZmluZWQiLCJhbnMiLCJrZXkiLCJ2YWx1ZSIsIkFycmF5IiwiaXNBcnJheSIsImtpbmQiLCJvaWQiLCJSZXZpdmVyTm90Rm91bmQiLCJib2R5IiwiaW5pdCIsIk9iamVjdCIsImNyZWF0ZSIsInNldCIsInB1c2giLCJyb290X29iaiIsImZyZWV6ZSIsInJvb3RfbGlzdCIsImVuY29kZU9iamVjdFRyZWUiLCJhbk9iamVjdCIsImNiX2FkZE9iamVjdCIsImxvb2t1cFByZXNlcnZlciIsImZpbmRQcmVzZXJ2ZXIiLCJfYm91bmRGaW5kUHJlc2VydmVGb3JPYmoiLCJsb29rdXAiLCJzdHJpbmdpZnkiLCJfanNvbl9yZXBsYWNlciIsInNhdmUiLCJzaGlmdCIsImNvbnRlbnQiLCJlcnIiLCJkc3RWYWx1ZSIsInNyY1ZhbHVlIiwicHJldiIsInByZXNlcnZlciIsInNpemUiLCJyZWYiLCJwcmVzZXJ2ZSIsImF0dHJzIiwiYXNzaWduIiwiUmV2aXRhbGl6YXRpb24iLCJGdW5jdGlvbiIsIkVycm9yIiwidG9rZW5fcCIsImx1dFJldml2ZSIsImx1dFByZXNlcnZlIiwic2VsZiIsInNldFByb3RvdHlwZU9mIiwicmVnaXN0ZXIiLCJwcm90b3R5cGUiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiYmluZCIsIl9zZXRSZXZpdmVyIiwiaW5pdFJlZ2lzdGVyeSIsImFwcGx5IiwiYXJndW1lbnRzIiwia2luZHMiLCJtYXRjaGVycyIsImVhY2giLCJtYXRjaCIsInJvb3RMaXN0IiwiXyIsInNsaWNlIiwicmVnaXN0ZXJSZXZpdmVyIiwidGd0IiwiY2FsbCIsInJlZ2lzdGVyQ2xhc3MiLCJyZWdpc3RlclByb3RvIiwiVHlwZUVycm9yIiwia2xhc3MiLCJwcm90byIsInByZXR0eSIsImVuY29kZVRvUmVmcyIsImpvaW4iLCJjb25zdHJ1Y3RvciIsImdldFByb3RvdHlwZU9mIiwiY3JlYXRlUmVnaXN0cnkiXSwibWFwcGluZ3MiOiJBQUFPLE1BQU1BLFNBQVMsZ0JBQWdCLE9BQU9DLE9BQXZCLEdBQWlDQSxPQUFqQyxHQUEyQ0MsR0FBMUQ7O0FBRVAsQUFBTyxTQUFTQyxnQkFBVCxDQUEwQkMsV0FBMUIsRUFBdUNDLFdBQXZDLEVBQW9EQyxHQUFwRCxFQUF5RDtNQUMzRCxTQUFTRCxXQUFaLEVBQTBCO1dBQ2pCLElBQVAsQ0FEd0I7R0FHMUIsTUFBTUUsUUFBTUgsWUFBWUcsS0FBeEI7UUFDTUMsZ0JBQWNKLFlBQVlJLGFBQWhDOztRQUVNQyxRQUFNLEVBQVo7UUFBZ0JDLFFBQU0sSUFBSVIsR0FBSixFQUF0QjtRQUFpQ1MsSUFBRSxFQUFuQztJQUNFLENBQUYsSUFBT0MsS0FBS0MsS0FBTCxDQUFXUixXQUFYLEVBQXdCUyxZQUF4QixDQUFQOztRQUVNQyxPQUFLLElBQUlmLE1BQUosRUFBWDtJQUNFLENBQUYsSUFBT1ksS0FBS0MsS0FBTCxDQUFXUixXQUFYLEVBQXdCVyxhQUF4QixDQUFQOztRQUVNQyxPQUFPLEVBQWI7UUFDTUMsU0FBU0MsUUFBUUMsT0FBUixHQUFrQkMsSUFBbEIsQ0FBeUIsTUFDdENaLE1BQU1hLE9BQU4sR0FBZ0JDLEdBQWhCLENBQXNCQyxTQUFTO1VBQ3ZCUCxJQUFOLEdBQWFBLElBQWI7V0FDT08sTUFBTUMsT0FBTixDQUFjQyxNQUFkLENBQXFCRixNQUFNRyxHQUEzQixFQUFnQ0gsS0FBaEMsRUFBdUNsQixHQUF2QyxDQUFQO0dBRkYsQ0FEYSxDQUFmOztPQUtLc0IsT0FBTCxHQUFlVixPQUFPRyxJQUFQLENBQWNRLE9BQU9BLElBQUlDLE1BQXpCLENBQWY7T0FDS0MsUUFBTCxHQUFnQmIsT0FBT0csSUFBUCxDQUFjUSxPQUM1QlYsUUFBUWEsR0FBUixDQUFZSCxHQUFaLEVBQWlCUixJQUFqQixDQUF3QlEsT0FBT0EsSUFBSUMsTUFBbkMsQ0FEYyxDQUFo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
