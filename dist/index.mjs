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

  const _finish = [],
        on_finish = fn => {
    _finish.push([fn, this]);
  };
  const _start = queue.reverse().map(entry => {
    entry.on_finish = on_finish;
    return entry.reviver.revive(entry.obj, entry, ctx);
  });

  for (const [fn, entry] of _finish) {
    fn(entry, ctx);
  }

  const root = byOid.get(0);
  return null != root ? root.obj : null;

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
    }return decodeObjectTree(this, json_source, ctx);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL2RlY29kZS5qcyIsIi4uL2NvZGUvZW5jb2RlLmpzIiwiLi4vY29kZS9yZXZpdGFsaXphdGlvbi5qcyIsIi4uL2NvZGUvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IE9iak1hcCA9ICd1bmRlZmluZWQnICE9PSB0eXBlb2YgV2Vha01hcCA/IFdlYWtNYXAgOiBNYXBcblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZU9iamVjdFRyZWUocmV2aXRhbGl6ZXIsIGpzb25fc291cmNlLCBjdHgpIDo6XG4gIGlmIG51bGwgPT09IGpzb25fc291cmNlIDo6XG4gICAgcmV0dXJuIG51bGwgLy8gSlNPTi5wYXJzZShudWxsKSByZXR1cm5zIG51bGw7IGtlZXAgd2l0aCBjb252ZW50aW9uXG5cbiAgY29uc3QgdG9rZW49cmV2aXRhbGl6ZXIudG9rZW5cbiAgY29uc3QgbG9va3VwUmV2aXZlcj1yZXZpdGFsaXplci5sb29rdXBSZXZpdmVyXG5cbiAgY29uc3QgcXVldWU9W10sIGJ5T2lkPW5ldyBNYXAoKSwgdj1bXVxuICB2WzBdID0gSlNPTi5wYXJzZShqc29uX3NvdXJjZSwgX2pzb25fY3JlYXRlKVxuXG4gIGNvbnN0IHJlZnM9bmV3IE9iak1hcCgpXG4gIHZbMV0gPSBKU09OLnBhcnNlKGpzb25fc291cmNlLCBfanNvbl9yZXN0b3JlKVxuXG4gIGNvbnN0IF9maW5pc2ggPSBbXSwgb25fZmluaXNoID0gZm4gPT4gOjogX2ZpbmlzaC5wdXNoIEAjIGZuLCB0aGlzXG4gIGNvbnN0IF9zdGFydCA9IHF1ZXVlLnJldmVyc2UoKS5tYXAgQCBlbnRyeSA9PiA6OlxuICAgIGVudHJ5Lm9uX2ZpbmlzaCA9IG9uX2ZpbmlzaFxuICAgIHJldHVybiBlbnRyeS5yZXZpdmVyLnJldml2ZShlbnRyeS5vYmosIGVudHJ5LCBjdHgpXG5cbiAgZm9yIGNvbnN0IFtmbiwgZW50cnldIG9mIF9maW5pc2ggOjpcbiAgICBmbihlbnRyeSwgY3R4KVxuXG4gIGNvbnN0IHJvb3QgPSBieU9pZC5nZXQoMClcbiAgcmV0dXJuIG51bGwgIT0gcm9vdCA/IHJvb3Qub2JqIDogbnVsbFxuXG5cbiAgZnVuY3Rpb24gX2pzb25fY3JlYXRlKGtleSwgdmFsdWUpIDo6XG4gICAgaWYgdG9rZW4gPT09IGtleSA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgZWxzZSBpZiBBcnJheS5pc0FycmF5KHZhbHVlKSA6OlxuICAgICAgICBkZWxldGUgdGhpc1t0b2tlbl1cblxuICAgICAgICBjb25zdCBba2luZCwgb2lkXSA9IHZhbHVlXG4gICAgICAgIGNvbnN0IHJldml2ZXIgPSBsb29rdXBSZXZpdmVyKGtpbmQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmV2aXZlciA6OlxuICAgICAgICAgIHRocm93IG5ldyBSZXZpdmVyTm90Rm91bmQoYE1pc3NpbmcgcmVnaXN0ZXJlZCByZXZpdmVyIGZvciBraW5kIFwiJHtraW5kfVwiYClcblxuICAgICAgICBjb25zdCBlbnRyeSA9IEA6IGtpbmQsIG9pZCwgcmV2aXZlciwgYm9keTogdGhpc1xuXG4gICAgICAgIGVudHJ5Lm9iaiA9IHJldml2ZXIuaW5pdFxuICAgICAgICAgID8gcmV2aXZlci5pbml0KGVudHJ5LCBjdHgpXG4gICAgICAgICAgOiBPYmplY3QuY3JlYXRlKG51bGwpXG5cbiAgICAgICAgYnlPaWQuc2V0KG9pZCwgZW50cnkpXG4gICAgICAgIHF1ZXVlLnB1c2goZW50cnkpXG4gICAgICByZXR1cm5cblxuICAgIHJldHVybiB2YWx1ZVxuXG5cbiAgZnVuY3Rpb24gX2pzb25fcmVzdG9yZShrZXksIHZhbHVlKSA6OlxuICAgIGlmIHRva2VuID09PSBrZXkgOjpcbiAgICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgcmVmcy5zZXQgQCB0aGlzLCBieU9pZC5nZXQodmFsdWUpLm9ialxuXG4gICAgICBlbHNlIGlmIEFycmF5LmlzQXJyYXkodmFsdWUpIDo6XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gYnlPaWQuZ2V0KHZhbHVlWzFdKVxuICAgICAgICBlbnRyeS5ib2R5ID0gdGhpc1xuICAgICAgICByZWZzLnNldCBAIHRoaXMsIGVudHJ5Lm9ialxuICAgICAgcmV0dXJuXG5cbiAgICBlbHNlIGlmIG51bGwgPT09IHZhbHVlIHx8ICdvYmplY3QnICE9PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgY29uc3QgYW5zID0gcmVmcy5nZXQodmFsdWUpXG4gICAgcmV0dXJuIGFucyAhPT0gdW5kZWZpbmVkID8gYW5zIDogdmFsdWVcblxuIiwiZXhwb3J0IGNvbnN0IHJvb3Rfb2JqID0gT2JqZWN0LmZyZWV6ZSBAIHt9XG5leHBvcnQgY29uc3Qgcm9vdF9saXN0ID0gT2JqZWN0LmZyZWV6ZSBAIFtdXG5cbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGVPYmplY3RUcmVlKHJldml0YWxpemVyLCBhbk9iamVjdCwgY3R4LCBjYl9hZGRPYmplY3QpIDo6XG4gIGNvbnN0IHRva2VuPXJldml0YWxpemVyLnRva2VuXG4gIGNvbnN0IGxvb2t1cFByZXNlcnZlcj1yZXZpdGFsaXplci5sb29rdXBQcmVzZXJ2ZXJcbiAgY29uc3QgZmluZFByZXNlcnZlcj1yZXZpdGFsaXplci5fYm91bmRGaW5kUHJlc2VydmVGb3JPYmooKVxuXG4gIGNvbnN0IHF1ZXVlPVtdLCBsb29rdXA9bmV3IE1hcCgpLCB2PVtdXG4gIHZbMF0gPSBKU09OLnN0cmluZ2lmeShhbk9iamVjdCwgX2pzb25fcmVwbGFjZXIpXG5cbiAgd2hpbGUgMCAhPT0gcXVldWUubGVuZ3RoIDo6XG4gICAgY29uc3Qgc2F2ZSA9IHF1ZXVlLnNoaWZ0KCksIHtvaWR9ID0gc2F2ZVxuICAgIGxldCBib2R5LCBjb250ZW50XG4gICAgdHJ5IDo6XG4gICAgICBib2R5ID0gc2F2ZShjdHgpXG4gICAgICBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoYm9keSwgX2pzb25fcmVwbGFjZXIpXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBjYl9hZGRPYmplY3QgQCBlcnIsIHsgb2lkLCBib2R5IH1cbiAgICAgIGNvbnRpbnVlXG4gICAgY2JfYWRkT2JqZWN0IEAgbnVsbCwgeyBvaWQsIGJvZHksIGNvbnRlbnQgfVxuXG5cbiAgZnVuY3Rpb24gX2pzb25fcmVwbGFjZXIoa2V5LCBkc3RWYWx1ZSkgOjpcbiAgICAvLyBzcmNWYWx1ZSAhPT0gZHN0VmFsdWUgZm9yIG9iamVjdHMgd2l0aCAudG9KU09OKCkgbWV0aG9kc1xuICAgIGNvbnN0IHNyY1ZhbHVlID0gdGhpc1trZXldXG5cbiAgICBpZiBkc3RWYWx1ZSA9PT0gbnVsbCB8fCAnb2JqZWN0JyAhPT0gdHlwZW9mIHNyY1ZhbHVlIDo6XG4gICAgICByZXR1cm4gZHN0VmFsdWVcblxuICAgIGNvbnN0IHByZXYgPSBsb29rdXAuZ2V0KHNyY1ZhbHVlKVxuICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJldiA6OlxuICAgICAgcmV0dXJuIHByZXYgLy8gYWxyZWFkeSBzZXJpYWxpemVkIC0tIHJlZmVyZW5jZSBleGlzdGluZyBpdGVtXG5cbiAgICBsZXQgcHJlc2VydmVyID0gZmluZFByZXNlcnZlcihzcmNWYWx1ZSlcbiAgICBpZiB1bmRlZmluZWQgPT09IHByZXNlcnZlciA6OlxuICAgICAgLy8gbm90IGEgXCJzcGVjaWFsXCIgcHJlc2VydmVkIGl0ZW1cbiAgICAgIGlmIGFuT2JqZWN0ICE9PSBzcmNWYWx1ZSA6OlxuICAgICAgICByZXR1cm4gZHN0VmFsdWUgLy8gc28gc2VyaWFsaXplIG5vcm1hbGx5XG4gICAgICAvLyBidXQgaXQgaXMgdGhlIHJvb3QsIHNvIHN0b3JlIGF0IG9pZCAwXG4gICAgICBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIgQFxuICAgICAgICBBcnJheS5pc0FycmF5KGRzdFZhbHVlKSA/IHJvb3RfbGlzdCA6IHJvb3Rfb2JqXG5cbiAgICAvLyByZWdpc3RlciBpZCBmb3Igb2JqZWN0IGFuZCByZXR1cm4gYSBKU09OIHNlcmlhbGl6YWJsZSB2ZXJzaW9uXG4gICAgY29uc3Qgb2lkID0gbG9va3VwLnNpemVcbiAgICBjb25zdCByZWYgPSB7W3Rva2VuXTogb2lkfVxuICAgIGxvb2t1cC5zZXQoc3JjVmFsdWUsIHJlZilcblxuICAgIC8vIHRyYW5zZm9ybSBsaXZlIG9iamVjdCBpbnRvIHByZXNlcnZlZCBmb3JtXG4gICAgY29uc3Qgc2F2ZSA9IGN0eCA9PiA6OlxuICAgICAgY29uc3QgYm9keSA9IHtbdG9rZW5dOiBbcHJlc2VydmVyLmtpbmQsIG9pZF19XG4gICAgICBpZiBwcmVzZXJ2ZXIucHJlc2VydmUgOjpcbiAgICAgICAgY29uc3QgYXR0cnMgPSBwcmVzZXJ2ZXIucHJlc2VydmUoZHN0VmFsdWUsIHNyY1ZhbHVlLCBjdHgpXG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKGJvZHksIGF0dHJzKVxuICAgICAgZWxzZSByZXR1cm4gT2JqZWN0LmFzc2lnbihib2R5LCBkc3RWYWx1ZSlcblxuICAgIHNhdmUub2lkID0gb2lkXG4gICAgcXVldWUucHVzaCBAIHNhdmVcbiAgICByZXR1cm4gcmVmXG5cbiIsImltcG9ydCB7ZGVjb2RlT2JqZWN0VHJlZSwgT2JqTWFwfSBmcm9tICcuL2RlY29kZSdcbmltcG9ydCB7ZW5jb2RlT2JqZWN0VHJlZSwgcm9vdF9vYmosIHJvb3RfbGlzdH0gZnJvbSAnLi9lbmNvZGUnXG5cbmV4cG9ydCBjbGFzcyBSZXZpdGFsaXphdGlvbiBleHRlbmRzIEZ1bmN0aW9uIDo6XG4gIGNvbnN0cnVjdG9yKCkgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VzZSB0aGUgc3RhdGljIC5jcmVhdGUoKSBpbnN0ZWFkIG9mIG5ldycpXG5cbiAgc3RhdGljIGNyZWF0ZSh0b2tlbl9wKSA6OlxuICAgIHJlZ2lzdGVyLnRva2VuID0gdG9rZW5fcCB8fCAnXFx1MDM5RScgLy8gJ86eJ1xuXG4gICAgY29uc3QgbHV0UmV2aXZlPW5ldyBNYXAoKVxuICAgIGNvbnN0IGx1dFByZXNlcnZlPW5ldyBPYmpNYXAoKVxuXG4gICAgY29uc3Qgc2VsZiA9IE9iamVjdC5zZXRQcm90b3R5cGVPZihyZWdpc3RlciwgdGhpcy5wcm90b3R5cGUpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBzZWxmLCBAe31cbiAgICAgIGxvb2t1cFJldml2ZXI6IEB7fSB2YWx1ZTogbHV0UmV2aXZlLmdldC5iaW5kKGx1dFJldml2ZSlcbiAgICAgIGxvb2t1cFByZXNlcnZlcjogQHt9IHZhbHVlOiBsdXRQcmVzZXJ2ZS5nZXQuYmluZChsdXRQcmVzZXJ2ZSlcbiAgICAgIF9zZXRSZXZpdmVyOiBAe30gdmFsdWU6IF9zZXRSZXZpdmVyXG5cblxuICAgIHNlbGYuaW5pdFJlZ2lzdGVyeShyb290X29iaiwgcm9vdF9saXN0KVxuICAgIHJldHVybiBzZWxmXG5cbiAgICBmdW5jdGlvbiByZWdpc3RlcigpIDo6XG4gICAgICByZXR1cm4gc2VsZi5yZWdpc3Rlci5hcHBseShzZWxmLCBhcmd1bWVudHMpXG5cbiAgICBmdW5jdGlvbiBfc2V0UmV2aXZlcihyZXZpdmVyLCBraW5kcywgbWF0Y2hlcnMpIDo6XG4gICAgICBsdXRSZXZpdmUuc2V0KHJldml2ZXIua2luZCwgcmV2aXZlcilcbiAgICAgIHJldHVybiBAOlxuICAgICAgICBhbGlhcyguLi5raW5kcykgOjpcbiAgICAgICAgICBmb3IgY29uc3QgZWFjaCBvZiBraW5kcyA6OlxuICAgICAgICAgICAgaWYgZWFjaCA6OiBsdXRSZXZpdmUuc2V0KGVhY2gsIHJldml2ZXIpXG4gICAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgICAgbWF0Y2goLi4ubWF0Y2hlcnMpIDo6XG4gICAgICAgICAgZm9yIGNvbnN0IGVhY2ggb2YgbWF0Y2hlcnMgOjpcbiAgICAgICAgICAgIGlmIG51bGwgIT0gZWFjaCA6OiBsdXRQcmVzZXJ2ZS5zZXQoZWFjaCwgcmV2aXZlcilcbiAgICAgICAgICByZXR1cm4gdGhpc1xuXG5cbiAgaW5pdFJlZ2lzdGVyeShyb290X29iaiwgcm9vdF9saXN0KSA6OlxuICAgIHRoaXNcbiAgICAgIC5yZWdpc3RlciBAOiBraW5kOiAne3Jvb3R9J1xuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjogT2JqZWN0LmFzc2lnbihvYmosIGVudHJ5LmJvZHkpXG4gICAgICAubWF0Y2ggQCByb290X29ialxuXG4gICAgdGhpc1xuICAgICAgLnJlZ2lzdGVyIEA6IGtpbmQ6ICdbcm9vdF0nXG4gICAgICAgIHByZXNlcnZlKHJvb3RMaXN0KSA6OiByZXR1cm4gQHt9IF86IHJvb3RMaXN0LnNsaWNlKClcbiAgICAgICAgaW5pdChlbnRyeSkgOjogcmV0dXJuIFtdXG4gICAgICAgIHJldml2ZShyb290TGlzdCwgZW50cnkpIDo6XG4gICAgICAgICAgcm9vdExpc3QucHVzaC5hcHBseShyb290TGlzdCwgZW50cnkuYm9keS5fKVxuICAgICAgLm1hdGNoIEAgcm9vdF9saXN0XG5cbiAgcmVnaXN0ZXIocmV2aXRhbGl6ZXIpIDo6XG4gICAgaWYgJ2tpbmQnIGluIHJldml0YWxpemVyICYmIHJldml0YWxpemVyLnJldml2ZSA6OlxuICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJSZXZpdmVyKHJldml0YWxpemVyKVxuXG4gICAgbGV0IHRndFxuICAgIGlmIHVuZGVmaW5lZCAhPT0gcmV2aXRhbGl6ZXIucHJvdG90eXBlIDo6XG4gICAgICB0Z3QgPSByZXZpdGFsaXplci5wcm90b3R5cGVbdGhpcy50b2tlbl1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdGd0IDo6XG4gICAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgICB0Z3QgPSB0Z3QuY2FsbChyZXZpdGFsaXplci5wcm90b3R5cGUsIHRoaXMpXG4gICAgICAgICAgaWYgbnVsbCA9PSB0Z3QgOjogcmV0dXJuXG4gICAgICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJDbGFzcyh0Z3QsIHJldml0YWxpemVyKVxuXG4gICAgdGd0ID0gcmV2aXRhbGl6ZXJbdGhpcy50b2tlbl1cbiAgICBpZiB1bmRlZmluZWQgIT09IHRndCA6OlxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICB0Z3QgPSB0Z3QuY2FsbChyZXZpdGFsaXplciwgdGhpcylcbiAgICAgICAgaWYgbnVsbCA9PSB0Z3QgOjogcmV0dXJuXG4gICAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICByZXR1cm4gdGhpcy5yZWdpc3RlclByb3RvKHRndCwgcmV2aXRhbGl6ZXIucHJvdG90eXBlIHx8IHJldml0YWxpemVyKVxuICAgICAgICAgIC5tYXRjaChyZXZpdGFsaXplcilcblxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYFVucmVjb2duaXplZCByZXZpdGFsaXphdGlvbiByZWdpc3RyYXRpb25gKVxuXG4gIHJlZ2lzdGVyUmV2aXZlcihyZXZpdmVyKSA6OlxuICAgIDo6XG4gICAgICBjb25zdCBraW5kID0gcmV2aXZlci5raW5kXG4gICAgICBpZiAnc3RyaW5nJyAhPT0gdHlwZW9mIGtpbmQgJiYgdHJ1ZSAhPT0ga2luZCAmJiBmYWxzZSAhPT0ga2luZCAmJiBudWxsICE9PSBraW5kIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgXCJraW5kXCIgbXVzdCBiZSBhIHN0cmluZ2BcblxuICAgICAgaWYgcmV2aXZlci5pbml0ICYmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLmluaXQgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcImluaXRcIiBtdXN0IGJlIGEgZnVuY3Rpb24nXG5cbiAgICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLnJldml2ZSA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wicmV2aXZlXCIgbXVzdCBiZSBhIGZ1bmN0aW9uJ1xuXG4gICAgICBpZiByZXZpdmVyLnByZXNlcnZlICYmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLnByZXNlcnZlIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCAnXCJwcmVzZXJ2ZVwiIG11c3QgYmUgYSBmdW5jdGlvbiBpZiBwcm92aWRlZCdcblxuICAgIHJldHVybiB0aGlzLl9zZXRSZXZpdmVyKHJldml2ZXIpXG5cbiAgcmVnaXN0ZXJDbGFzcyhraW5kLCBrbGFzcykgOjpcbiAgICByZXR1cm4gdGhpc1xuICAgICAgLnJlZ2lzdGVyUmV2aXZlciBAOiBraW5kLFxuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjpcbiAgICAgICAgICBvYmogPSBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2Yob2JqLCBrbGFzcy5wcm90b3R5cGUpXG4gICAgICAubWF0Y2goa2xhc3MsIGtsYXNzLnByb3RvdHlwZSlcblxuICByZWdpc3RlclByb3RvKGtpbmQsIHByb3RvKSA6OlxuICAgIHJldHVybiB0aGlzXG4gICAgICAucmVnaXN0ZXJSZXZpdmVyIEA6IGtpbmQsXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OlxuICAgICAgICAgIG9iaiA9IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihvYmosIHByb3RvKVxuICAgICAgLm1hdGNoKHByb3RvKVxuXG5cbiAgZGVjb2RlKGpzb25fc291cmNlLCBjdHgpIDo6XG4gICAgaWYgbnVsbCA9PT0ganNvbl9zb3VyY2UgOjpcbiAgICAgIHJldHVybiBudWxsIC8vIEpTT04ucGFyc2UobnVsbCkgcmV0dXJucyBudWxsOyBrZWVwIHdpdGggY29udmVudGlvblxuXG4gICAgcmV0dXJuIGRlY29kZU9iamVjdFRyZWUgQCB0aGlzLCBqc29uX3NvdXJjZSwgY3R4XG5cbiAgZW5jb2RlVG9SZWZzKGFuT2JqZWN0LCBjdHgsIHJlZnMpIDo6XG4gICAgaWYgbnVsbCA9PSByZWZzIDo6IHJlZnMgPSBbXVxuICAgIGVuY29kZU9iamVjdFRyZWUgQCB0aGlzLCBhbk9iamVjdCwgY3R4LCAoZXJyLCBlbnRyeSkgPT4gOjpcbiAgICAgIHJlZnNbZW50cnkub2lkXSA9IGVudHJ5LmNvbnRlbnRcbiAgICByZXR1cm4gcmVmc1xuXG4gIGVuY29kZShhbk9iamVjdCwgY3R4LCBwcmV0dHkpIDo6XG4gICAgY29uc3QgcmVmcyA9IHRoaXMuZW5jb2RlVG9SZWZzKGFuT2JqZWN0LCBjdHgpXG4gICAgY29uc3Qga2V5ID0gSlNPTi5zdHJpbmdpZnkgQCBgJHt0aGlzLnRva2VufXJlZnNgXG4gICAgcmV0dXJuIHByZXR0eVxuICAgICAgPyBgeyR7a2V5fTogW1xcbiAgJHtyZWZzLmpvaW4oJyxcXG4gICcpfSBdfVxcbmBcbiAgICAgIDogYHske2tleX06WyR7cmVmcy5qb2luKCcsJyl9XX1gXG5cbiAgX2JvdW5kRmluZFByZXNlcnZlRm9yT2JqKCkgOjpcbiAgICBjb25zdCBsb29rdXBQcmVzZXJ2ZXIgPSB0aGlzLmxvb2t1cFByZXNlcnZlclxuICAgIHJldHVybiBmdW5jdGlvbihvYmopIDo6XG4gICAgICBsZXQgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyKG9iailcbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJlc2VydmVyIDo6XG4gICAgICAgIHJldHVybiBwcmVzZXJ2ZXJcblxuICAgICAgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyKG9iai5jb25zdHJ1Y3RvcilcbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJlc2VydmVyIDo6XG4gICAgICAgIHJldHVybiBwcmVzZXJ2ZXJcblxuICAgICAgbGV0IHByb3RvID0gb2JqXG4gICAgICB3aGlsZSBudWxsICE9PSBAIHByb3RvID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHByb3RvKSA6OlxuICAgICAgICBsZXQgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyKHByb3RvKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHByZXNlcnZlciA6OlxuICAgICAgICAgIHJldHVybiBwcmVzZXJ2ZXJcblxuXG5leHBvcnQgY2xhc3MgUmV2aXZlck5vdEZvdW5kIGV4dGVuZHMgRXJyb3IgOjpcblxuIiwiaW1wb3J0IHtSZXZpdGFsaXphdGlvbn0gZnJvbSAnLi9yZXZpdGFsaXphdGlvbidcblxuY29uc3QgY3JlYXRlUmVnaXN0cnkgPSBSZXZpdGFsaXphdGlvbi5jcmVhdGUuYmluZChSZXZpdGFsaXphdGlvbilcblxuZXhwb3J0ICogZnJvbSAnLi9lbmNvZGUnXG5leHBvcnQgKiBmcm9tICcuL2RlY29kZSdcbmV4cG9ydCAqIGZyb20gJy4vcmV2aXRhbGl6YXRpb24nXG5leHBvcnQgZGVmYXVsdCBjcmVhdGVSZWdpc3RyeSgpXG5leHBvcnQgQHt9XG4gIGNyZWF0ZVJlZ2lzdHJ5XG4gIGNyZWF0ZVJlZ2lzdHJ5IGFzIGNyZWF0ZVxuXG4iXSwibmFtZXMiOlsiT2JqTWFwIiwiV2Vha01hcCIsIk1hcCIsImRlY29kZU9iamVjdFRyZWUiLCJyZXZpdGFsaXplciIsImpzb25fc291cmNlIiwiY3R4IiwidG9rZW4iLCJsb29rdXBSZXZpdmVyIiwicXVldWUiLCJieU9pZCIsInYiLCJKU09OIiwicGFyc2UiLCJfanNvbl9jcmVhdGUiLCJyZWZzIiwiX2pzb25fcmVzdG9yZSIsIl9maW5pc2giLCJvbl9maW5pc2giLCJmbiIsInB1c2giLCJfc3RhcnQiLCJyZXZlcnNlIiwibWFwIiwiZW50cnkiLCJyZXZpdmVyIiwicmV2aXZlIiwib2JqIiwicm9vdCIsImdldCIsImtleSIsInZhbHVlIiwiQXJyYXkiLCJpc0FycmF5Iiwia2luZCIsIm9pZCIsInVuZGVmaW5lZCIsIlJldml2ZXJOb3RGb3VuZCIsImJvZHkiLCJpbml0IiwiT2JqZWN0IiwiY3JlYXRlIiwic2V0IiwiYW5zIiwicm9vdF9vYmoiLCJmcmVlemUiLCJyb290X2xpc3QiLCJlbmNvZGVPYmplY3RUcmVlIiwiYW5PYmplY3QiLCJjYl9hZGRPYmplY3QiLCJsb29rdXBQcmVzZXJ2ZXIiLCJmaW5kUHJlc2VydmVyIiwiX2JvdW5kRmluZFByZXNlcnZlRm9yT2JqIiwibG9va3VwIiwic3RyaW5naWZ5IiwiX2pzb25fcmVwbGFjZXIiLCJsZW5ndGgiLCJzYXZlIiwic2hpZnQiLCJjb250ZW50IiwiZXJyIiwiZHN0VmFsdWUiLCJzcmNWYWx1ZSIsInByZXYiLCJwcmVzZXJ2ZXIiLCJzaXplIiwicmVmIiwicHJlc2VydmUiLCJhdHRycyIsImFzc2lnbiIsIlJldml0YWxpemF0aW9uIiwiRnVuY3Rpb24iLCJFcnJvciIsInRva2VuX3AiLCJsdXRSZXZpdmUiLCJsdXRQcmVzZXJ2ZSIsInNlbGYiLCJzZXRQcm90b3R5cGVPZiIsInJlZ2lzdGVyIiwicHJvdG90eXBlIiwiZGVmaW5lUHJvcGVydGllcyIsImJpbmQiLCJfc2V0UmV2aXZlciIsImluaXRSZWdpc3RlcnkiLCJhcHBseSIsImFyZ3VtZW50cyIsImtpbmRzIiwibWF0Y2hlcnMiLCJlYWNoIiwibWF0Y2giLCJyb290TGlzdCIsIl8iLCJzbGljZSIsInJlZ2lzdGVyUmV2aXZlciIsInRndCIsImNhbGwiLCJyZWdpc3RlckNsYXNzIiwicmVnaXN0ZXJQcm90byIsIlR5cGVFcnJvciIsImtsYXNzIiwicHJvdG8iLCJwcmV0dHkiLCJlbmNvZGVUb1JlZnMiLCJqb2luIiwiY29uc3RydWN0b3IiLCJnZXRQcm90b3R5cGVPZiIsImNyZWF0ZVJlZ2lzdHJ5Il0sIm1hcHBpbmdzIjoiQUFBTyxNQUFNQSxTQUFTLGdCQUFnQixPQUFPQyxPQUF2QixHQUFpQ0EsT0FBakMsR0FBMkNDLEdBQTFEOztBQUVQLEFBQU8sU0FBU0MsZ0JBQVQsQ0FBMEJDLFdBQTFCLEVBQXVDQyxXQUF2QyxFQUFvREMsR0FBcEQsRUFBeUQ7TUFDM0QsU0FBU0QsV0FBWixFQUEwQjtXQUNqQixJQUFQLENBRHdCO0dBRzFCLE1BQU1FLFFBQU1ILFlBQVlHLEtBQXhCO1FBQ01DLGdCQUFjSixZQUFZSSxhQUFoQzs7UUFFTUMsUUFBTSxFQUFaO1FBQWdCQyxRQUFNLElBQUlSLEdB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
