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
  return _encodeQueue();

  function _encodeQueue() {
    if (0 === queue.length) {
      return Promise.resolve();
    }

    const promises = [];
    while (0 !== queue.length) {
      const tip = queue.shift(),
            oid = tip.oid;
      promises.push(tip.then(body => {
        try {
          var content = JSON.stringify(body, _json_replacer);
        } catch (err) {
          return cb_addObject(err);
        }
        return cb_addObject(null, { oid, body, content });
      }, err => cb_addObject(err)));
    }

    return Promise.all(promises).then(_encodeQueue);
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
    const body = { [token]: [preserver.kind, oid] };
    const promise = Promise.resolve(preserver.preserve ? preserver.preserve(dstValue, srcValue, ctx) : dstValue).then(attrs => Object.assign(body, attrs));

    promise.oid = oid;
    queue.push(promise);
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
    const promise = encodeObjectTree(this, anObject, ctx, (err, entry) => {
      refs[entry.oid] = entry.content;
    });
    return promise.then(() => refs);
  }

  encode(anObject, ctx, pretty) {
    return this.encodeToRefs(anObject, ctx).then(refs => {
      const key = JSON.stringify(`${this.token}refs`);
      return pretty ? `{${key}: [\n  ${refs.join(',\n  ')} ]}\n` : `{${key}:[${refs.join(',')}]}`;
    });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL2RlY29kZS5qcyIsIi4uL2NvZGUvZW5jb2RlLmpzIiwiLi4vY29kZS9yZXZpdGFsaXphdGlvbi5qcyIsIi4uL2NvZGUvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IE9iak1hcCA9ICd1bmRlZmluZWQnICE9PSB0eXBlb2YgV2Vha01hcCA/IFdlYWtNYXAgOiBNYXBcblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZU9iamVjdFRyZWUocmV2aXRhbGl6ZXIsIGpzb25fc291cmNlLCBjdHgpIDo6XG4gIGlmIG51bGwgPT09IGpzb25fc291cmNlIDo6XG4gICAgcmV0dXJuIG51bGwgLy8gSlNPTi5wYXJzZShudWxsKSByZXR1cm5zIG51bGw7IGtlZXAgd2l0aCBjb252ZW50aW9uXG5cbiAgY29uc3QgdG9rZW49cmV2aXRhbGl6ZXIudG9rZW5cbiAgY29uc3QgbG9va3VwUmV2aXZlcj1yZXZpdGFsaXplci5sb29rdXBSZXZpdmVyXG5cbiAgY29uc3QgcXVldWU9W10sIGJ5T2lkPW5ldyBNYXAoKSwgdj1bXVxuICB2WzBdID0gSlNPTi5wYXJzZShqc29uX3NvdXJjZSwgX2pzb25fY3JlYXRlKVxuXG4gIGNvbnN0IHJlZnM9bmV3IE9iak1hcCgpXG4gIHZbMV0gPSBKU09OLnBhcnNlKGpzb25fc291cmNlLCBfanNvbl9yZXN0b3JlKVxuXG4gIGNvbnN0IGV2dHMgPSB7fVxuICBjb25zdCBfc3RhcnQgPSBQcm9taXNlLnJlc29sdmUoKS50aGVuIEAgKCkgPT5cbiAgICBxdWV1ZS5yZXZlcnNlKCkubWFwIEAgZW50cnkgPT4gOjpcbiAgICAgIGVudHJ5LmV2dHMgPSBldnRzXG4gICAgICByZXR1cm4gZW50cnkucmV2aXZlci5yZXZpdmUoZW50cnkub2JqLCBlbnRyeSwgY3R4KVxuXG4gIGV2dHMuc3RhcnRlZCA9IF9zdGFydC50aGVuIEAgbHN0ID0+IGxzdC5sZW5ndGhcbiAgZXZ0cy5maW5pc2hlZCA9IF9zdGFydC50aGVuIEAgbHN0ID0+XG4gICAgUHJvbWlzZS5hbGwobHN0KS50aGVuIEAgbHN0ID0+IGxzdC5sZW5ndGhcblxuICBldnRzLmRvbmUgPSBldnRzLmZpbmlzaGVkLnRoZW4gQCAoKSA9PiA6OlxuICAgIGNvbnN0IHJvb3QgPSBieU9pZC5nZXQoMClcbiAgICBpZiBudWxsID09IHJvb3QgOjogcmV0dXJuXG5cbiAgICBjb25zdCB7b2JqLCBwcm9taXNlfSA9IHJvb3RcbiAgICByZXR1cm4gdW5kZWZpbmVkID09PSBwcm9taXNlID8gb2JqXG4gICAgICA6IHByb21pc2UudGhlbiBAIGFucyA9PlxuICAgICAgICAgIGFucyAhPT0gdW5kZWZpbmVkID8gYW5zIDogb2JqXG5cbiAgcmV0dXJuIGV2dHNcblxuXG4gIGZ1bmN0aW9uIF9qc29uX2NyZWF0ZShrZXksIHZhbHVlKSA6OlxuICAgIGlmIHRva2VuID09PSBrZXkgOjpcbiAgICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgIGVsc2UgaWYgQXJyYXkuaXNBcnJheSh2YWx1ZSkgOjpcbiAgICAgICAgZGVsZXRlIHRoaXNbdG9rZW5dXG5cbiAgICAgICAgY29uc3QgW2tpbmQsIG9pZF0gPSB2YWx1ZVxuICAgICAgICBjb25zdCByZXZpdmVyID0gbG9va3VwUmV2aXZlcihraW5kKVxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IHJldml2ZXIgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgUmV2aXZlck5vdEZvdW5kKGBNaXNzaW5nIHJlZ2lzdGVyZWQgcmV2aXZlciBmb3Iga2luZCBcIiR7a2luZH1cImApXG5cbiAgICAgICAgY29uc3QgZW50cnkgPSBAOiBraW5kLCBvaWQsIHJldml2ZXIsIGJvZHk6IHRoaXNcblxuICAgICAgICBlbnRyeS5vYmogPSByZXZpdmVyLmluaXRcbiAgICAgICAgICA/IHJldml2ZXIuaW5pdChlbnRyeSwgY3R4KVxuICAgICAgICAgIDogT2JqZWN0LmNyZWF0ZShudWxsKVxuXG4gICAgICAgIGJ5T2lkLnNldChvaWQsIGVudHJ5KVxuICAgICAgICBxdWV1ZS5wdXNoKGVudHJ5KVxuICAgICAgcmV0dXJuXG5cbiAgICByZXR1cm4gdmFsdWVcblxuXG4gIGZ1bmN0aW9uIF9qc29uX3Jlc3RvcmUoa2V5LCB2YWx1ZSkgOjpcbiAgICBpZiB0b2tlbiA9PT0ga2V5IDo6XG4gICAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIHJlZnMuc2V0IEAgdGhpcywgYnlPaWQuZ2V0KHZhbHVlKS5vYmpcblxuICAgICAgZWxzZSBpZiBBcnJheS5pc0FycmF5KHZhbHVlKSA6OlxuICAgICAgICBjb25zdCBlbnRyeSA9IGJ5T2lkLmdldCh2YWx1ZVsxXSlcbiAgICAgICAgZW50cnkuYm9keSA9IHRoaXNcbiAgICAgICAgcmVmcy5zZXQgQCB0aGlzLCBlbnRyeS5vYmpcbiAgICAgIHJldHVyblxuXG4gICAgZWxzZSBpZiBudWxsID09PSB2YWx1ZSB8fCAnb2JqZWN0JyAhPT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICByZXR1cm4gdmFsdWVcblxuICAgIGNvbnN0IGFucyA9IHJlZnMuZ2V0KHZhbHVlKVxuICAgIHJldHVybiBhbnMgIT09IHVuZGVmaW5lZCA/IGFucyA6IHZhbHVlXG5cbiIsImV4cG9ydCBjb25zdCByb290X29iaiA9IE9iamVjdC5mcmVlemUgQCB7fVxuZXhwb3J0IGNvbnN0IHJvb3RfbGlzdCA9IE9iamVjdC5mcmVlemUgQCBbXVxuXG5leHBvcnQgZnVuY3Rpb24gZW5jb2RlT2JqZWN0VHJlZShyZXZpdGFsaXplciwgYW5PYmplY3QsIGN0eCwgY2JfYWRkT2JqZWN0KSA6OlxuICBjb25zdCB0b2tlbj1yZXZpdGFsaXplci50b2tlblxuICBjb25zdCBsb29rdXBQcmVzZXJ2ZXI9cmV2aXRhbGl6ZXIubG9va3VwUHJlc2VydmVyXG4gIGNvbnN0IGZpbmRQcmVzZXJ2ZXI9cmV2aXRhbGl6ZXIuX2JvdW5kRmluZFByZXNlcnZlRm9yT2JqKClcblxuICBjb25zdCBxdWV1ZT1bXSwgbG9va3VwPW5ldyBNYXAoKSwgdj1bXVxuICB2WzBdID0gSlNPTi5zdHJpbmdpZnkoYW5PYmplY3QsIF9qc29uX3JlcGxhY2VyKVxuICByZXR1cm4gX2VuY29kZVF1ZXVlKClcblxuICBmdW5jdGlvbiBfZW5jb2RlUXVldWUoKSA6OlxuICAgIGlmIDAgPT09IHF1ZXVlLmxlbmd0aCA6OlxuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG5cbiAgICBjb25zdCBwcm9taXNlcyA9IFtdXG4gICAgd2hpbGUgMCAhPT0gcXVldWUubGVuZ3RoIDo6XG4gICAgICBjb25zdCB0aXAgPSBxdWV1ZS5zaGlmdCgpLCBvaWQgPSB0aXAub2lkXG4gICAgICBwcm9taXNlcy5wdXNoIEAgdGlwLnRoZW4gQFxuICAgICAgICBib2R5ID0+IDo6XG4gICAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgICB2YXIgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KGJvZHksIF9qc29uX3JlcGxhY2VyKVxuICAgICAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICAgICAgcmV0dXJuIGNiX2FkZE9iamVjdChlcnIpXG4gICAgICAgICAgcmV0dXJuIGNiX2FkZE9iamVjdCBAIG51bGwsIHsgb2lkLCBib2R5LCBjb250ZW50IH1cblxuICAgICAgICBlcnIgPT4gY2JfYWRkT2JqZWN0KGVycilcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihfZW5jb2RlUXVldWUpXG5cbiAgZnVuY3Rpb24gX2pzb25fcmVwbGFjZXIoa2V5LCBkc3RWYWx1ZSkgOjpcbiAgICAvLyBzcmNWYWx1ZSAhPT0gZHN0VmFsdWUgZm9yIG9iamVjdHMgd2l0aCAudG9KU09OKCkgbWV0aG9kc1xuICAgIGNvbnN0IHNyY1ZhbHVlID0gdGhpc1trZXldXG5cbiAgICBpZiBkc3RWYWx1ZSA9PT0gbnVsbCB8fCAnb2JqZWN0JyAhPT0gdHlwZW9mIHNyY1ZhbHVlIDo6XG4gICAgICByZXR1cm4gZHN0VmFsdWVcblxuICAgIGNvbnN0IHByZXYgPSBsb29rdXAuZ2V0KHNyY1ZhbHVlKVxuICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJldiA6OlxuICAgICAgcmV0dXJuIHByZXYgLy8gYWxyZWFkeSBzZXJpYWxpemVkIC0tIHJlZmVyZW5jZSBleGlzdGluZyBpdGVtXG5cbiAgICBsZXQgcHJlc2VydmVyID0gZmluZFByZXNlcnZlcihzcmNWYWx1ZSlcbiAgICBpZiB1bmRlZmluZWQgPT09IHByZXNlcnZlciA6OlxuICAgICAgLy8gbm90IGEgXCJzcGVjaWFsXCIgcHJlc2VydmVkIGl0ZW1cbiAgICAgIGlmIGFuT2JqZWN0ICE9PSBzcmNWYWx1ZSA6OlxuICAgICAgICByZXR1cm4gZHN0VmFsdWUgLy8gc28gc2VyaWFsaXplIG5vcm1hbGx5XG4gICAgICAvLyBidXQgaXQgaXMgdGhlIHJvb3QsIHNvIHN0b3JlIGF0IG9pZCAwXG4gICAgICBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIgQFxuICAgICAgICBBcnJheS5pc0FycmF5KGRzdFZhbHVlKSA/IHJvb3RfbGlzdCA6IHJvb3Rfb2JqXG5cbiAgICAvLyByZWdpc3RlciBpZCBmb3Igb2JqZWN0IGFuZCByZXR1cm4gYSBKU09OIHNlcmlhbGl6YWJsZSB2ZXJzaW9uXG4gICAgY29uc3Qgb2lkID0gbG9va3VwLnNpemVcbiAgICBjb25zdCByZWYgPSB7W3Rva2VuXTogb2lkfVxuICAgIGxvb2t1cC5zZXQoc3JjVmFsdWUsIHJlZilcblxuICAgIC8vIHRyYW5zZm9ybSBsaXZlIG9iamVjdCBpbnRvIHByZXNlcnZlZCBmb3JtXG4gICAgY29uc3QgYm9keSA9IHtbdG9rZW5dOiBbcHJlc2VydmVyLmtpbmQsIG9pZF19XG4gICAgY29uc3QgcHJvbWlzZSA9IFByb21pc2VcbiAgICAgIC5yZXNvbHZlIEBcbiAgICAgICAgcHJlc2VydmVyLnByZXNlcnZlXG4gICAgICAgICAgPyBwcmVzZXJ2ZXIucHJlc2VydmUoZHN0VmFsdWUsIHNyY1ZhbHVlLCBjdHgpXG4gICAgICAgICAgOiBkc3RWYWx1ZVxuICAgICAgLnRoZW4gQCBhdHRycyA9PiBPYmplY3QuYXNzaWduKGJvZHksIGF0dHJzKVxuXG4gICAgcHJvbWlzZS5vaWQgPSBvaWRcbiAgICBxdWV1ZS5wdXNoIEAgcHJvbWlzZVxuICAgIHJldHVybiByZWZcblxuIiwiaW1wb3J0IHtkZWNvZGVPYmplY3RUcmVlLCBPYmpNYXB9IGZyb20gJy4vZGVjb2RlJ1xuaW1wb3J0IHtlbmNvZGVPYmplY3RUcmVlLCByb290X29iaiwgcm9vdF9saXN0fSBmcm9tICcuL2VuY29kZSdcblxuZXhwb3J0IGNsYXNzIFJldml0YWxpemF0aW9uIGV4dGVuZHMgRnVuY3Rpb24gOjpcbiAgY29uc3RydWN0b3IoKSA6OlxuICAgIHRocm93IG5ldyBFcnJvcignVXNlIHRoZSBzdGF0aWMgLmNyZWF0ZSgpIGluc3RlYWQgb2YgbmV3JylcblxuICBzdGF0aWMgY3JlYXRlKHRva2VuX3ApIDo6XG4gICAgcmVnaXN0ZXIudG9rZW4gPSB0b2tlbl9wIHx8ICdcXHUwMzlFJyAvLyAnzp4nXG5cbiAgICBjb25zdCBsdXRSZXZpdmU9bmV3IE1hcCgpXG4gICAgY29uc3QgbHV0UHJlc2VydmU9bmV3IE9iak1hcCgpXG5cbiAgICBjb25zdCBzZWxmID0gT2JqZWN0LnNldFByb3RvdHlwZU9mKHJlZ2lzdGVyLCB0aGlzLnByb3RvdHlwZSlcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHNlbGYsIEB7fVxuICAgICAgbG9va3VwUmV2aXZlcjogQHt9IHZhbHVlOiBsdXRSZXZpdmUuZ2V0LmJpbmQobHV0UmV2aXZlKVxuICAgICAgbG9va3VwUHJlc2VydmVyOiBAe30gdmFsdWU6IGx1dFByZXNlcnZlLmdldC5iaW5kKGx1dFByZXNlcnZlKVxuICAgICAgX3NldFJldml2ZXI6IEB7fSB2YWx1ZTogX3NldFJldml2ZXJcblxuXG4gICAgc2VsZi5pbml0UmVnaXN0ZXJ5KHJvb3Rfb2JqLCByb290X2xpc3QpXG4gICAgcmV0dXJuIHNlbGZcblxuICAgIGZ1bmN0aW9uIHJlZ2lzdGVyKCkgOjpcbiAgICAgIHJldHVybiBzZWxmLnJlZ2lzdGVyLmFwcGx5KHNlbGYsIGFyZ3VtZW50cylcblxuICAgIGZ1bmN0aW9uIF9zZXRSZXZpdmVyKHJldml2ZXIsIGtpbmRzLCBtYXRjaGVycykgOjpcbiAgICAgIGx1dFJldml2ZS5zZXQocmV2aXZlci5raW5kLCByZXZpdmVyKVxuICAgICAgcmV0dXJuIEA6XG4gICAgICAgIGFsaWFzKC4uLmtpbmRzKSA6OlxuICAgICAgICAgIGZvciBjb25zdCBlYWNoIG9mIGtpbmRzIDo6XG4gICAgICAgICAgICBpZiBlYWNoIDo6IGx1dFJldml2ZS5zZXQoZWFjaCwgcmV2aXZlcilcbiAgICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgICBtYXRjaCguLi5tYXRjaGVycykgOjpcbiAgICAgICAgICBmb3IgY29uc3QgZWFjaCBvZiBtYXRjaGVycyA6OlxuICAgICAgICAgICAgaWYgbnVsbCAhPSBlYWNoIDo6IGx1dFByZXNlcnZlLnNldChlYWNoLCByZXZpdmVyKVxuICAgICAgICAgIHJldHVybiB0aGlzXG5cblxuICBpbml0UmVnaXN0ZXJ5KHJvb3Rfb2JqLCByb290X2xpc3QpIDo6XG4gICAgdGhpc1xuICAgICAgLnJlZ2lzdGVyIEA6IGtpbmQ6ICd7cm9vdH0nXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OiBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgIC5tYXRjaCBAIHJvb3Rfb2JqXG5cbiAgICB0aGlzXG4gICAgICAucmVnaXN0ZXIgQDoga2luZDogJ1tyb290XSdcbiAgICAgICAgcHJlc2VydmUocm9vdExpc3QpIDo6IHJldHVybiBAe30gXzogcm9vdExpc3Quc2xpY2UoKVxuICAgICAgICBpbml0KGVudHJ5KSA6OiByZXR1cm4gW11cbiAgICAgICAgcmV2aXZlKHJvb3RMaXN0LCBlbnRyeSkgOjpcbiAgICAgICAgICByb290TGlzdC5wdXNoLmFwcGx5KHJvb3RMaXN0LCBlbnRyeS5ib2R5Ll8pXG4gICAgICAubWF0Y2ggQCByb290X2xpc3RcblxuICByZWdpc3RlcihyZXZpdGFsaXplcikgOjpcbiAgICBpZiAna2luZCcgaW4gcmV2aXRhbGl6ZXIgJiYgcmV2aXRhbGl6ZXIucmV2aXZlIDo6XG4gICAgICByZXR1cm4gdGhpcy5yZWdpc3RlclJldml2ZXIocmV2aXRhbGl6ZXIpXG5cbiAgICBsZXQgdGd0XG4gICAgaWYgdW5kZWZpbmVkICE9PSByZXZpdGFsaXplci5wcm90b3R5cGUgOjpcbiAgICAgIHRndCA9IHJldml0YWxpemVyLnByb3RvdHlwZVt0aGlzLnRva2VuXVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0Z3QgOjpcbiAgICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICAgIHRndCA9IHRndC5jYWxsKHJldml0YWxpemVyLnByb3RvdHlwZSwgdGhpcylcbiAgICAgICAgICBpZiBudWxsID09IHRndCA6OiByZXR1cm5cbiAgICAgICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWdpc3RlckNsYXNzKHRndCwgcmV2aXRhbGl6ZXIpXG5cbiAgICB0Z3QgPSByZXZpdGFsaXplclt0aGlzLnRva2VuXVxuICAgIGlmIHVuZGVmaW5lZCAhPT0gdGd0IDo6XG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgIHRndCA9IHRndC5jYWxsKHJldml0YWxpemVyLCB0aGlzKVxuICAgICAgICBpZiBudWxsID09IHRndCA6OiByZXR1cm5cbiAgICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyUHJvdG8odGd0LCByZXZpdGFsaXplci5wcm90b3R5cGUgfHwgcmV2aXRhbGl6ZXIpXG4gICAgICAgICAgLm1hdGNoKHJldml0YWxpemVyKVxuXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgVW5yZWNvZ25pemVkIHJldml0YWxpemF0aW9uIHJlZ2lzdHJhdGlvbmApXG5cbiAgcmVnaXN0ZXJSZXZpdmVyKHJldml2ZXIpIDo6XG4gICAgOjpcbiAgICAgIGNvbnN0IGtpbmQgPSByZXZpdmVyLmtpbmRcbiAgICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Yga2luZCAmJiB0cnVlICE9PSBraW5kICYmIGZhbHNlICE9PSBraW5kICYmIG51bGwgIT09IGtpbmQgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBcImtpbmRcIiBtdXN0IGJlIGEgc3RyaW5nYFxuXG4gICAgICBpZiByZXZpdmVyLmluaXQgJiYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJldml2ZXIuaW5pdCA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wiaW5pdFwiIG11c3QgYmUgYSBmdW5jdGlvbidcblxuICAgICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJldml2ZXIucmV2aXZlIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCAnXCJyZXZpdmVcIiBtdXN0IGJlIGEgZnVuY3Rpb24nXG5cbiAgICAgIGlmIHJldml2ZXIucHJlc2VydmUgJiYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJldml2ZXIucHJlc2VydmUgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcInByZXNlcnZlXCIgbXVzdCBiZSBhIGZ1bmN0aW9uIGlmIHByb3ZpZGVkJ1xuXG4gICAgcmV0dXJuIHRoaXMuX3NldFJldml2ZXIocmV2aXZlcilcblxuICByZWdpc3RlckNsYXNzKGtpbmQsIGtsYXNzKSA6OlxuICAgIHJldHVybiB0aGlzXG4gICAgICAucmVnaXN0ZXJSZXZpdmVyIEA6IGtpbmQsXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OlxuICAgICAgICAgIG9iaiA9IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihvYmosIGtsYXNzLnByb3RvdHlwZSlcbiAgICAgIC5tYXRjaChrbGFzcywga2xhc3MucHJvdG90eXBlKVxuXG4gIHJlZ2lzdGVyUHJvdG8oa2luZCwgcHJvdG8pIDo6XG4gICAgcmV0dXJuIHRoaXNcbiAgICAgIC5yZWdpc3RlclJldml2ZXIgQDoga2luZCxcbiAgICAgICAgcmV2aXZlKG9iaiwgZW50cnkpIDo6XG4gICAgICAgICAgb2JqID0gT2JqZWN0LmFzc2lnbihvYmosIGVudHJ5LmJvZHkpXG4gICAgICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKG9iaiwgcHJvdG8pXG4gICAgICAubWF0Y2gocHJvdG8pXG5cblxuICBkZWNvZGUoanNvbl9zb3VyY2UsIGN0eCkgOjpcbiAgICBpZiBudWxsID09PSBqc29uX3NvdXJjZSA6OlxuICAgICAgcmV0dXJuIG51bGwgLy8gSlNPTi5wYXJzZShudWxsKSByZXR1cm5zIG51bGw7IGtlZXAgd2l0aCBjb252ZW50aW9uXG5cbiAgICBjb25zdCBldnRzID0gZGVjb2RlT2JqZWN0VHJlZSBAIHRoaXMsIGpzb25fc291cmNlLCBjdHhcbiAgICByZXR1cm4gZXZ0cy5kb25lXG5cbiAgZW5jb2RlVG9SZWZzKGFuT2JqZWN0LCBjdHgsIHJlZnMpIDo6XG4gICAgaWYgbnVsbCA9PSByZWZzIDo6IHJlZnMgPSBbXVxuICAgIGNvbnN0IHByb21pc2UgPSBlbmNvZGVPYmplY3RUcmVlIEAgdGhpcywgYW5PYmplY3QsIGN0eCwgKGVyciwgZW50cnkpID0+IDo6XG4gICAgICByZWZzW2VudHJ5Lm9pZF0gPSBlbnRyeS5jb250ZW50XG4gICAgcmV0dXJuIHByb21pc2UudGhlbiBAICgpID0+IHJlZnNcblxuICBlbmNvZGUoYW5PYmplY3QsIGN0eCwgcHJldHR5KSA6OlxuICAgIHJldHVybiB0aGlzLmVuY29kZVRvUmVmcyhhbk9iamVjdCwgY3R4KS50aGVuIEAgcmVmcyA9PiA6OlxuICAgICAgY29uc3Qga2V5ID0gSlNPTi5zdHJpbmdpZnkgQCBgJHt0aGlzLnRva2VufXJlZnNgXG4gICAgICByZXR1cm4gcHJldHR5XG4gICAgICAgID8gYHske2tleX06IFtcXG4gICR7cmVmcy5qb2luKCcsXFxuICAnKX0gXX1cXG5gXG4gICAgICAgIDogYHske2tleX06WyR7cmVmcy5qb2luKCcsJyl9XX1gXG5cbiAgX2JvdW5kRmluZFByZXNlcnZlRm9yT2JqKCkgOjpcbiAgICBjb25zdCBsb29rdXBQcmVzZXJ2ZXIgPSB0aGlzLmxvb2t1cFByZXNlcnZlclxuICAgIHJldHVybiBmdW5jdGlvbihvYmopIDo6XG4gICAgICBsZXQgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyKG9iailcbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJlc2VydmVyIDo6XG4gICAgICAgIHJldHVybiBwcmVzZXJ2ZXJcblxuICAgICAgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyKG9iai5jb25zdHJ1Y3RvcilcbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJlc2VydmVyIDo6XG4gICAgICAgIHJldHVybiBwcmVzZXJ2ZXJcblxuICAgICAgbGV0IHByb3RvID0gb2JqXG4gICAgICB3aGlsZSBudWxsICE9PSBAIHByb3RvID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHByb3RvKSA6OlxuICAgICAgICBsZXQgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyKHByb3RvKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHByZXNlcnZlciA6OlxuICAgICAgICAgIHJldHVybiBwcmVzZXJ2ZXJcblxuXG5leHBvcnQgY2xhc3MgUmV2aXZlck5vdEZvdW5kIGV4dGVuZHMgRXJyb3IgOjpcblxuIiwiaW1wb3J0IHtSZXZpdGFsaXphdGlvbn0gZnJvbSAnLi9yZXZpdGFsaXphdGlvbidcblxuY29uc3QgY3JlYXRlUmVnaXN0cnkgPSBSZXZpdGFsaXphdGlvbi5jcmVhdGUuYmluZChSZXZpdGFsaXphdGlvbilcblxuZXhwb3J0ICogZnJvbSAnLi9lbmNvZGUnXG5leHBvcnQgKiBmcm9tICcuL2RlY29kZSdcbmV4cG9ydCAqIGZyb20gJy4vcmV2aXRhbGl6YXRpb24nXG5leHBvcnQgZGVmYXVsdCBjcmVhdGVSZWdpc3RyeSgpXG5leHBvcnQgQHt9XG4gIGNyZWF0ZVJlZ2lzdHJ5XG4gIGNyZWF0ZVJlZ2lzdHJ5IGFzIGNyZWF0ZVxuXG4iXSwibmFtZXMiOlsiT2JqTWFwIiwiV2Vha01hcCIsIk1hcCIsImRlY29kZU9iamVjdFRyZWUiLCJyZXZpdGFsaXplciIsImpzb25fc291cmNlIiwiY3R4IiwidG9rZW4iLCJsb29rdXBSZXZpdmVyIiwicXVldWUiLCJieU9pZCIsInYiLCJKU09OIiwicGFyc2UiLCJfanNvbl9jcmVhdGUiLCJyZWZzIiwiX2pzb25fcmVzdG9yZSIsImV2dHMiLCJfc3RhcnQiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJyZXZlcnNlIiwibWFwIiwiZW50cnkiLCJyZXZpdmVyIiwicmV2aXZlIiwib2JqIiwic3RhcnRlZCIsImxzdCIsImxlbmd0aCIsImZpbmlzaGVkIiwiYWxsIiwiZG9uZSIsInJvb3QiLCJnZXQiLCJwcm9taXNlIiwidW5kZWZpbmVkIiwiYW5zIiwia2V5IiwidmFsdWUiLCJBcnJheSIsImlzQXJyYXkiLCJraW5kIiwib2lkIiwiUmV2aXZlck5vdEZvdW5kIiwiYm9keSIsImluaXQiLCJPYmplY3QiLCJjcmVhdGUiLCJzZXQiLCJwdXNoIiwicm9vdF9vYmoiLCJmcmVlemUiLCJyb290X2xpc3QiLCJlbmNvZGVPYmplY3RUcmVlIiwiYW5PYmplY3QiLCJjYl9hZGRPYmplY3QiLCJsb29rdXBQcmVzZXJ2ZXIiLCJmaW5kUHJlc2VydmVyIiwiX2JvdW5kRmluZFByZXNlcnZlRm9yT2JqIiwibG9va3VwIiwic3RyaW5naWZ5IiwiX2pzb25fcmVwbGFjZXIiLCJfZW5jb2RlUXVldWUiLCJwcm9taXNlcyIsInRpcCIsInNoaWZ0IiwiY29udGVudCIsImVyciIsImRzdFZhbHVlIiwic3JjVmFsdWUiLCJwcmV2IiwicHJlc2VydmVyIiwic2l6ZSIsInJlZiIsInByZXNlcnZlIiwiYXR0cnMiLCJhc3NpZ24iLCJSZXZpdGFsaXphdGlvbiIsIkZ1bmN0aW9uIiwiRXJyb3IiLCJ0b2tlbl9wIiwibHV0UmV2aXZlIiwibHV0UHJlc2VydmUiLCJzZWxmIiwic2V0UHJvdG90eXBlT2YiLCJyZWdpc3RlciIsInByb3RvdHlwZSIsImRlZmluZVByb3BlcnRpZXMiLCJiaW5kIiwiX3NldFJldml2ZXIiLCJpbml0UmVnaXN0ZXJ5IiwiYXBwbHkiLCJhcmd1bWVudHMiLCJraW5kcyIsIm1hdGNoZXJzIiwiZWFjaCIsIm1hdGNoIiwicm9vdExpc3QiLCJfIiwic2xpY2UiLCJyZWdpc3RlclJldml2ZXIiLCJ0Z3QiLCJjYWxsIiwicmVnaXN0ZXJDbGFzcyIsInJlZ2lzdGVyUHJvdG8iLCJUeXBlRXJyb3IiLCJrbGFzcyIsInByb3RvIiwicHJldHR5IiwiZW5jb2RlVG9SZWZzIiwiam9pbiIsImNvbnN0cnVjdG9yIiwiZ2V0UHJvdG90eXBlT2YiLCJjcmVhdGVSZWdpc3RyeSJdLCJtYXBwaW5ncyI6IkFBQU8sTUFBTUEsU0FBUyxnQkFBZ0IsT0FBT0MsT0FBdkIsR0FBaUNBLE9BQWpDLEdBQTJDQyxHQUExRDs7QUFFUCxBQUFPLFNBQVNDLGdCQUFULENBQTBCQyxXQUExQixFQUF1Q0MsV0FBdkMsRUFBb0RDLEdBQXBELEVBQXlEO01BQzNELFNBQVNELFdBQVosRUFBMEI7V0FDakIsSUFBUCxDQUR3QjtHQUcxQixNQUFNRSxRQUFNSCxZQUFZRyxLQUF4QjtRQUNNQyxnQkFBY0osWUFBWUksYUFBaEM7O1FBRU1DLFFBQU0sRUFBWjtRQUFnQkMsUUFBTSxJQUFJUixHQUFKLEVBQXRCO1FBQWlDUyxJQUFFLEVBQW5DO0lBQ0UsQ0FBRixJQUFPQyxLQUFLQyxLQUFMLENBQVdSLFdBQVgsRUFBd0JTLFlBQXhCLENBQVA7O1FBRU1DLE9BQUssSUFBSWYsTUFBSixFQUFYO0lBQ0UsQ0FBRixJQUFPWSxLQUFLQyxLQUFMLENBQVdSLFdBQVgsRUFBd0JXLGFBQXhCLENBQVA7O1FBRU1DLE9BQU8sRUFBYjtRQUNNQyxTQUFTQyxRQUFRQyxPQUFSLEdBQWtCQyxJQUFsQixDQUF5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
