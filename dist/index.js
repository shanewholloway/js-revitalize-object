'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

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

exports['default'] = index;
exports.createRegistry = createRegistry;
exports.create = createRegistry;
exports.root_obj = root_obj;
exports.root_list = root_list;
exports.encodeObjectTree = encodeObjectTree;
exports.ObjMap = ObjMap;
exports.decodeObjectTree = decodeObjectTree;
exports.Revitalization = Revitalization;
exports.ReviverNotFound = ReviverNotFound$1;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvZGVjb2RlLmpzIiwiLi4vY29kZS9lbmNvZGUuanMiLCIuLi9jb2RlL3Jldml0YWxpemF0aW9uLmpzIiwiLi4vY29kZS9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY29uc3QgT2JqTWFwID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBXZWFrTWFwID8gV2Vha01hcCA6IE1hcFxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlT2JqZWN0VHJlZShyZXZpdGFsaXplciwganNvbl9zb3VyY2UsIGN0eCkgOjpcbiAgaWYgbnVsbCA9PT0ganNvbl9zb3VyY2UgOjpcbiAgICByZXR1cm4gbnVsbCAvLyBKU09OLnBhcnNlKG51bGwpIHJldHVybnMgbnVsbDsga2VlcCB3aXRoIGNvbnZlbnRpb25cblxuICBjb25zdCB0b2tlbj1yZXZpdGFsaXplci50b2tlblxuICBjb25zdCBsb29rdXBSZXZpdmVyPXJldml0YWxpemVyLmxvb2t1cFJldml2ZXJcblxuICBjb25zdCBxdWV1ZT1bXSwgYnlPaWQ9bmV3IE1hcCgpLCB2PVtdXG4gIHZbMF0gPSBKU09OLnBhcnNlKGpzb25fc291cmNlLCBfanNvbl9jcmVhdGUpXG5cbiAgY29uc3QgcmVmcz1uZXcgT2JqTWFwKClcbiAgdlsxXSA9IEpTT04ucGFyc2UoanNvbl9zb3VyY2UsIF9qc29uX3Jlc3RvcmUpXG5cbiAgY29uc3QgZXZ0cyA9IHt9XG4gIGNvbnN0IF9zdGFydCA9IFByb21pc2UucmVzb2x2ZSgpLnRoZW4gQCAoKSA9PlxuICAgIHF1ZXVlLnJldmVyc2UoKS5tYXAgQCBlbnRyeSA9PiA6OlxuICAgICAgZW50cnkuZXZ0cyA9IGV2dHNcbiAgICAgIHJldHVybiBlbnRyeS5yZXZpdmVyLnJldml2ZShlbnRyeS5vYmosIGVudHJ5LCBjdHgpXG5cbiAgZXZ0cy5zdGFydGVkID0gX3N0YXJ0LnRoZW4gQCBsc3QgPT4gbHN0Lmxlbmd0aFxuICBldnRzLmZpbmlzaGVkID0gX3N0YXJ0LnRoZW4gQCBsc3QgPT5cbiAgICBQcm9taXNlLmFsbChsc3QpLnRoZW4gQCBsc3QgPT4gbHN0Lmxlbmd0aFxuXG4gIGV2dHMuZG9uZSA9IGV2dHMuZmluaXNoZWQudGhlbiBAICgpID0+IDo6XG4gICAgY29uc3Qgcm9vdCA9IGJ5T2lkLmdldCgwKVxuICAgIGlmIG51bGwgPT0gcm9vdCA6OiByZXR1cm5cblxuICAgIGNvbnN0IHtvYmosIHByb21pc2V9ID0gcm9vdFxuICAgIHJldHVybiB1bmRlZmluZWQgPT09IHByb21pc2UgPyBvYmpcbiAgICAgIDogcHJvbWlzZS50aGVuIEAgYW5zID0+XG4gICAgICAgICAgYW5zICE9PSB1bmRlZmluZWQgPyBhbnMgOiBvYmpcblxuICByZXR1cm4gZXZ0c1xuXG5cbiAgZnVuY3Rpb24gX2pzb25fY3JlYXRlKGtleSwgdmFsdWUpIDo6XG4gICAgaWYgdG9rZW4gPT09IGtleSA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgZWxzZSBpZiBBcnJheS5pc0FycmF5KHZhbHVlKSA6OlxuICAgICAgICBkZWxldGUgdGhpc1t0b2tlbl1cblxuICAgICAgICBjb25zdCBba2luZCwgb2lkXSA9IHZhbHVlXG4gICAgICAgIGNvbnN0IHJldml2ZXIgPSBsb29rdXBSZXZpdmVyKGtpbmQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmV2aXZlciA6OlxuICAgICAgICAgIHRocm93IG5ldyBSZXZpdmVyTm90Rm91bmQoYE1pc3NpbmcgcmVnaXN0ZXJlZCByZXZpdmVyIGZvciBraW5kIFwiJHtraW5kfVwiYClcblxuICAgICAgICBjb25zdCBlbnRyeSA9IEA6IGtpbmQsIG9pZCwgcmV2aXZlciwgYm9keTogdGhpc1xuXG4gICAgICAgIGVudHJ5Lm9iaiA9IHJldml2ZXIuaW5pdFxuICAgICAgICAgID8gcmV2aXZlci5pbml0KGVudHJ5LCBjdHgpXG4gICAgICAgICAgOiBPYmplY3QuY3JlYXRlKG51bGwpXG5cbiAgICAgICAgYnlPaWQuc2V0KG9pZCwgZW50cnkpXG4gICAgICAgIHF1ZXVlLnB1c2goZW50cnkpXG4gICAgICByZXR1cm5cblxuICAgIHJldHVybiB2YWx1ZVxuXG5cbiAgZnVuY3Rpb24gX2pzb25fcmVzdG9yZShrZXksIHZhbHVlKSA6OlxuICAgIGlmIHRva2VuID09PSBrZXkgOjpcbiAgICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgcmVmcy5zZXQgQCB0aGlzLCBieU9pZC5nZXQodmFsdWUpLm9ialxuXG4gICAgICBlbHNlIGlmIEFycmF5LmlzQXJyYXkodmFsdWUpIDo6XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gYnlPaWQuZ2V0KHZhbHVlWzFdKVxuICAgICAgICBlbnRyeS5ib2R5ID0gdGhpc1xuICAgICAgICByZWZzLnNldCBAIHRoaXMsIGVudHJ5Lm9ialxuICAgICAgcmV0dXJuXG5cbiAgICBlbHNlIGlmIG51bGwgPT09IHZhbHVlIHx8ICdvYmplY3QnICE9PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgY29uc3QgYW5zID0gcmVmcy5nZXQodmFsdWUpXG4gICAgcmV0dXJuIGFucyAhPT0gdW5kZWZpbmVkID8gYW5zIDogdmFsdWVcblxuIiwiZXhwb3J0IGNvbnN0IHJvb3Rfb2JqID0gT2JqZWN0LmZyZWV6ZSBAIHt9XG5leHBvcnQgY29uc3Qgcm9vdF9saXN0ID0gT2JqZWN0LmZyZWV6ZSBAIFtdXG5cbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGVPYmplY3RUcmVlKHJldml0YWxpemVyLCBhbk9iamVjdCwgY3R4LCBjYl9hZGRPYmplY3QpIDo6XG4gIGNvbnN0IHRva2VuPXJldml0YWxpemVyLnRva2VuXG4gIGNvbnN0IGxvb2t1cFByZXNlcnZlcj1yZXZpdGFsaXplci5sb29rdXBQcmVzZXJ2ZXJcbiAgY29uc3QgZmluZFByZXNlcnZlcj1yZXZpdGFsaXplci5fYm91bmRGaW5kUHJlc2VydmVGb3JPYmooKVxuXG4gIGNvbnN0IHF1ZXVlPVtdLCBsb29rdXA9bmV3IE1hcCgpLCB2PVtdXG4gIHZbMF0gPSBKU09OLnN0cmluZ2lmeShhbk9iamVjdCwgX2pzb25fcmVwbGFjZXIpXG5cbiAgd2hpbGUgMCAhPT0gcXVldWUubGVuZ3RoIDo6XG4gICAgY29uc3Qgc2F2ZSA9IHF1ZXVlLnNoaWZ0KCksIHtvaWR9ID0gc2F2ZVxuICAgIGxldCBib2R5LCBjb250ZW50XG4gICAgdHJ5IDo6XG4gICAgICBib2R5ID0gc2F2ZShjdHgpXG4gICAgICBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoYm9keSwgX2pzb25fcmVwbGFjZXIpXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBjYl9hZGRPYmplY3QgQCBlcnIsIHsgb2lkLCBib2R5IH1cbiAgICAgIGNvbnRpbnVlXG4gICAgY2JfYWRkT2JqZWN0IEAgbnVsbCwgeyBvaWQsIGJvZHksIGNvbnRlbnQgfVxuXG5cbiAgZnVuY3Rpb24gX2pzb25fcmVwbGFjZXIoa2V5LCBkc3RWYWx1ZSkgOjpcbiAgICAvLyBzcmNWYWx1ZSAhPT0gZHN0VmFsdWUgZm9yIG9iamVjdHMgd2l0aCAudG9KU09OKCkgbWV0aG9kc1xuICAgIGNvbnN0IHNyY1ZhbHVlID0gdGhpc1trZXldXG5cbiAgICBpZiBkc3RWYWx1ZSA9PT0gbnVsbCB8fCAnb2JqZWN0JyAhPT0gdHlwZW9mIHNyY1ZhbHVlIDo6XG4gICAgICByZXR1cm4gZHN0VmFsdWVcblxuICAgIGNvbnN0IHByZXYgPSBsb29rdXAuZ2V0KHNyY1ZhbHVlKVxuICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJldiA6OlxuICAgICAgcmV0dXJuIHByZXYgLy8gYWxyZWFkeSBzZXJpYWxpemVkIC0tIHJlZmVyZW5jZSBleGlzdGluZyBpdGVtXG5cbiAgICBsZXQgcHJlc2VydmVyID0gZmluZFByZXNlcnZlcihzcmNWYWx1ZSlcbiAgICBpZiB1bmRlZmluZWQgPT09IHByZXNlcnZlciA6OlxuICAgICAgLy8gbm90IGEgXCJzcGVjaWFsXCIgcHJlc2VydmVkIGl0ZW1cbiAgICAgIGlmIGFuT2JqZWN0ICE9PSBzcmNWYWx1ZSA6OlxuICAgICAgICByZXR1cm4gZHN0VmFsdWUgLy8gc28gc2VyaWFsaXplIG5vcm1hbGx5XG4gICAgICAvLyBidXQgaXQgaXMgdGhlIHJvb3QsIHNvIHN0b3JlIGF0IG9pZCAwXG4gICAgICBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIgQFxuICAgICAgICBBcnJheS5pc0FycmF5KGRzdFZhbHVlKSA/IHJvb3RfbGlzdCA6IHJvb3Rfb2JqXG5cbiAgICAvLyByZWdpc3RlciBpZCBmb3Igb2JqZWN0IGFuZCByZXR1cm4gYSBKU09OIHNlcmlhbGl6YWJsZSB2ZXJzaW9uXG4gICAgY29uc3Qgb2lkID0gbG9va3VwLnNpemVcbiAgICBjb25zdCByZWYgPSB7W3Rva2VuXTogb2lkfVxuICAgIGxvb2t1cC5zZXQoc3JjVmFsdWUsIHJlZilcblxuICAgIC8vIHRyYW5zZm9ybSBsaXZlIG9iamVjdCBpbnRvIHByZXNlcnZlZCBmb3JtXG4gICAgY29uc3Qgc2F2ZSA9IGN0eCA9PiA6OlxuICAgICAgY29uc3QgYm9keSA9IHtbdG9rZW5dOiBbcHJlc2VydmVyLmtpbmQsIG9pZF19XG4gICAgICBpZiBwcmVzZXJ2ZXIucHJlc2VydmUgOjpcbiAgICAgICAgY29uc3QgYXR0cnMgPSBwcmVzZXJ2ZXIucHJlc2VydmUoZHN0VmFsdWUsIHNyY1ZhbHVlLCBjdHgpXG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKGJvZHksIGF0dHJzKVxuICAgICAgZWxzZSByZXR1cm4gT2JqZWN0LmFzc2lnbihib2R5LCBkc3RWYWx1ZSlcblxuICAgIHNhdmUub2lkID0gb2lkXG4gICAgcXVldWUucHVzaCBAIHNhdmVcbiAgICByZXR1cm4gcmVmXG5cbiIsImltcG9ydCB7ZGVjb2RlT2JqZWN0VHJlZSwgT2JqTWFwfSBmcm9tICcuL2RlY29kZSdcbmltcG9ydCB7ZW5jb2RlT2JqZWN0VHJlZSwgcm9vdF9vYmosIHJvb3RfbGlzdH0gZnJvbSAnLi9lbmNvZGUnXG5cbmV4cG9ydCBjbGFzcyBSZXZpdGFsaXphdGlvbiBleHRlbmRzIEZ1bmN0aW9uIDo6XG4gIGNvbnN0cnVjdG9yKCkgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VzZSB0aGUgc3RhdGljIC5jcmVhdGUoKSBpbnN0ZWFkIG9mIG5ldycpXG5cbiAgc3RhdGljIGNyZWF0ZSh0b2tlbl9wKSA6OlxuICAgIHJlZ2lzdGVyLnRva2VuID0gdG9rZW5fcCB8fCAnXFx1MDM5RScgLy8gJ86eJ1xuXG4gICAgY29uc3QgbHV0UmV2aXZlPW5ldyBNYXAoKVxuICAgIGNvbnN0IGx1dFByZXNlcnZlPW5ldyBPYmpNYXAoKVxuXG4gICAgY29uc3Qgc2VsZiA9IE9iamVjdC5zZXRQcm90b3R5cGVPZihyZWdpc3RlciwgdGhpcy5wcm90b3R5cGUpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBzZWxmLCBAe31cbiAgICAgIGxvb2t1cFJldml2ZXI6IEB7fSB2YWx1ZTogbHV0UmV2aXZlLmdldC5iaW5kKGx1dFJldml2ZSlcbiAgICAgIGxvb2t1cFByZXNlcnZlcjogQHt9IHZhbHVlOiBsdXRQcmVzZXJ2ZS5nZXQuYmluZChsdXRQcmVzZXJ2ZSlcbiAgICAgIF9zZXRSZXZpdmVyOiBAe30gdmFsdWU6IF9zZXRSZXZpdmVyXG5cblxuICAgIHNlbGYuaW5pdFJlZ2lzdGVyeShyb290X29iaiwgcm9vdF9saXN0KVxuICAgIHJldHVybiBzZWxmXG5cbiAgICBmdW5jdGlvbiByZWdpc3RlcigpIDo6XG4gICAgICByZXR1cm4gc2VsZi5yZWdpc3Rlci5hcHBseShzZWxmLCBhcmd1bWVudHMpXG5cbiAgICBmdW5jdGlvbiBfc2V0UmV2aXZlcihyZXZpdmVyLCBraW5kcywgbWF0Y2hlcnMpIDo6XG4gICAgICBsdXRSZXZpdmUuc2V0KHJldml2ZXIua2luZCwgcmV2aXZlcilcbiAgICAgIHJldHVybiBAOlxuICAgICAgICBhbGlhcyguLi5raW5kcykgOjpcbiAgICAgICAgICBmb3IgY29uc3QgZWFjaCBvZiBraW5kcyA6OlxuICAgICAgICAgICAgaWYgZWFjaCA6OiBsdXRSZXZpdmUuc2V0KGVhY2gsIHJldml2ZXIpXG4gICAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgICAgbWF0Y2goLi4ubWF0Y2hlcnMpIDo6XG4gICAgICAgICAgZm9yIGNvbnN0IGVhY2ggb2YgbWF0Y2hlcnMgOjpcbiAgICAgICAgICAgIGlmIG51bGwgIT0gZWFjaCA6OiBsdXRQcmVzZXJ2ZS5zZXQoZWFjaCwgcmV2aXZlcilcbiAgICAgICAgICByZXR1cm4gdGhpc1xuXG5cbiAgaW5pdFJlZ2lzdGVyeShyb290X29iaiwgcm9vdF9saXN0KSA6OlxuICAgIHRoaXNcbiAgICAgIC5yZWdpc3RlciBAOiBraW5kOiAne3Jvb3R9J1xuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjogT2JqZWN0LmFzc2lnbihvYmosIGVudHJ5LmJvZHkpXG4gICAgICAubWF0Y2ggQCByb290X29ialxuXG4gICAgdGhpc1xuICAgICAgLnJlZ2lzdGVyIEA6IGtpbmQ6ICdbcm9vdF0nXG4gICAgICAgIHByZXNlcnZlKHJvb3RMaXN0KSA6OiByZXR1cm4gQHt9IF86IHJvb3RMaXN0LnNsaWNlKClcbiAgICAgICAgaW5pdChlbnRyeSkgOjogcmV0dXJuIFtdXG4gICAgICAgIHJldml2ZShyb290TGlzdCwgZW50cnkpIDo6XG4gICAgICAgICAgcm9vdExpc3QucHVzaC5hcHBseShyb290TGlzdCwgZW50cnkuYm9keS5fKVxuICAgICAgLm1hdGNoIEAgcm9vdF9saXN0XG5cbiAgcmVnaXN0ZXIocmV2aXRhbGl6ZXIpIDo6XG4gICAgaWYgJ2tpbmQnIGluIHJldml0YWxpemVyICYmIHJldml0YWxpemVyLnJldml2ZSA6OlxuICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJSZXZpdmVyKHJldml0YWxpemVyKVxuXG4gICAgbGV0IHRndFxuICAgIGlmIHVuZGVmaW5lZCAhPT0gcmV2aXRhbGl6ZXIucHJvdG90eXBlIDo6XG4gICAgICB0Z3QgPSByZXZpdGFsaXplci5wcm90b3R5cGVbdGhpcy50b2tlbl1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdGd0IDo6XG4gICAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgICB0Z3QgPSB0Z3QuY2FsbChyZXZpdGFsaXplci5wcm90b3R5cGUsIHRoaXMpXG4gICAgICAgICAgaWYgbnVsbCA9PSB0Z3QgOjogcmV0dXJuXG4gICAgICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJDbGFzcyh0Z3QsIHJldml0YWxpemVyKVxuXG4gICAgdGd0ID0gcmV2aXRhbGl6ZXJbdGhpcy50b2tlbl1cbiAgICBpZiB1bmRlZmluZWQgIT09IHRndCA6OlxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICB0Z3QgPSB0Z3QuY2FsbChyZXZpdGFsaXplciwgdGhpcylcbiAgICAgICAgaWYgbnVsbCA9PSB0Z3QgOjogcmV0dXJuXG4gICAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICByZXR1cm4gdGhpcy5yZWdpc3RlclByb3RvKHRndCwgcmV2aXRhbGl6ZXIucHJvdG90eXBlIHx8IHJldml0YWxpemVyKVxuICAgICAgICAgIC5tYXRjaChyZXZpdGFsaXplcilcblxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYFVucmVjb2duaXplZCByZXZpdGFsaXphdGlvbiByZWdpc3RyYXRpb25gKVxuXG4gIHJlZ2lzdGVyUmV2aXZlcihyZXZpdmVyKSA6OlxuICAgIDo6XG4gICAgICBjb25zdCBraW5kID0gcmV2aXZlci5raW5kXG4gICAgICBpZiAnc3RyaW5nJyAhPT0gdHlwZW9mIGtpbmQgJiYgdHJ1ZSAhPT0ga2luZCAmJiBmYWxzZSAhPT0ga2luZCAmJiBudWxsICE9PSBraW5kIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgXCJraW5kXCIgbXVzdCBiZSBhIHN0cmluZ2BcblxuICAgICAgaWYgcmV2aXZlci5pbml0ICYmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLmluaXQgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcImluaXRcIiBtdXN0IGJlIGEgZnVuY3Rpb24nXG5cbiAgICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLnJldml2ZSA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wicmV2aXZlXCIgbXVzdCBiZSBhIGZ1bmN0aW9uJ1xuXG4gICAgICBpZiByZXZpdmVyLnByZXNlcnZlICYmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLnByZXNlcnZlIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCAnXCJwcmVzZXJ2ZVwiIG11c3QgYmUgYSBmdW5jdGlvbiBpZiBwcm92aWRlZCdcblxuICAgIHJldHVybiB0aGlzLl9zZXRSZXZpdmVyKHJldml2ZXIpXG5cbiAgcmVnaXN0ZXJDbGFzcyhraW5kLCBrbGFzcykgOjpcbiAgICByZXR1cm4gdGhpc1xuICAgICAgLnJlZ2lzdGVyUmV2aXZlciBAOiBraW5kLFxuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjpcbiAgICAgICAgICBvYmogPSBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2Yob2JqLCBrbGFzcy5wcm90b3R5cGUpXG4gICAgICAubWF0Y2goa2xhc3MsIGtsYXNzLnByb3RvdHlwZSlcblxuICByZWdpc3RlclByb3RvKGtpbmQsIHByb3RvKSA6OlxuICAgIHJldHVybiB0aGlzXG4gICAgICAucmVnaXN0ZXJSZXZpdmVyIEA6IGtpbmQsXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OlxuICAgICAgICAgIG9iaiA9IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihvYmosIHByb3RvKVxuICAgICAgLm1hdGNoKHByb3RvKVxuXG5cbiAgZGVjb2RlKGpzb25fc291cmNlLCBjdHgpIDo6XG4gICAgaWYgbnVsbCA9PT0ganNvbl9zb3VyY2UgOjpcbiAgICAgIHJldHVybiBudWxsIC8vIEpTT04ucGFyc2UobnVsbCkgcmV0dXJucyBudWxsOyBrZWVwIHdpdGggY29udmVudGlvblxuXG4gICAgY29uc3QgZXZ0cyA9IGRlY29kZU9iamVjdFRyZWUgQCB0aGlzLCBqc29uX3NvdXJjZSwgY3R4XG4gICAgcmV0dXJuIGV2dHMuZG9uZVxuXG4gIGVuY29kZVRvUmVmcyhhbk9iamVjdCwgY3R4LCByZWZzKSA6OlxuICAgIGlmIG51bGwgPT0gcmVmcyA6OiByZWZzID0gW11cbiAgICBlbmNvZGVPYmplY3RUcmVlIEAgdGhpcywgYW5PYmplY3QsIGN0eCwgKGVyciwgZW50cnkpID0+IDo6XG4gICAgICByZWZzW2VudHJ5Lm9pZF0gPSBlbnRyeS5jb250ZW50XG4gICAgcmV0dXJuIHJlZnNcblxuICBlbmNvZGUoYW5PYmplY3QsIGN0eCwgcHJldHR5KSA6OlxuICAgIGNvbnN0IHJlZnMgPSB0aGlzLmVuY29kZVRvUmVmcyhhbk9iamVjdCwgY3R4KVxuICAgIGNvbnN0IGtleSA9IEpTT04uc3RyaW5naWZ5IEAgYCR7dGhpcy50b2tlbn1yZWZzYFxuICAgIHJldHVybiBwcmV0dHlcbiAgICAgID8gYHske2tleX06IFtcXG4gICR7cmVmcy5qb2luKCcsXFxuICAnKX0gXX1cXG5gXG4gICAgICA6IGB7JHtrZXl9Olske3JlZnMuam9pbignLCcpfV19YFxuXG4gIF9ib3VuZEZpbmRQcmVzZXJ2ZUZvck9iaigpIDo6XG4gICAgY29uc3QgbG9va3VwUHJlc2VydmVyID0gdGhpcy5sb29rdXBQcmVzZXJ2ZXJcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSA6OlxuICAgICAgbGV0IHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlcihvYmopXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHByZXNlcnZlciA6OlxuICAgICAgICByZXR1cm4gcHJlc2VydmVyXG5cbiAgICAgIHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlcihvYmouY29uc3RydWN0b3IpXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHByZXNlcnZlciA6OlxuICAgICAgICByZXR1cm4gcHJlc2VydmVyXG5cbiAgICAgIGxldCBwcm90byA9IG9ialxuICAgICAgd2hpbGUgbnVsbCAhPT0gQCBwcm90byA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihwcm90bykgOjpcbiAgICAgICAgbGV0IHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlcihwcm90bylcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgICByZXR1cm4gcHJlc2VydmVyXG5cblxuZXhwb3J0IGNsYXNzIFJldml2ZXJOb3RGb3VuZCBleHRlbmRzIEVycm9yIDo6XG5cbiIsImltcG9ydCB7UmV2aXRhbGl6YXRpb259IGZyb20gJy4vcmV2aXRhbGl6YXRpb24nXG5cbmNvbnN0IGNyZWF0ZVJlZ2lzdHJ5ID0gUmV2aXRhbGl6YXRpb24uY3JlYXRlLmJpbmQoUmV2aXRhbGl6YXRpb24pXG5cbmV4cG9ydCAqIGZyb20gJy4vZW5jb2RlJ1xuZXhwb3J0ICogZnJvbSAnLi9kZWNvZGUnXG5leHBvcnQgKiBmcm9tICcuL3Jldml0YWxpemF0aW9uJ1xuZXhwb3J0IGRlZmF1bHQgY3JlYXRlUmVnaXN0cnkoKVxuZXhwb3J0IEB7fVxuICBjcmVhdGVSZWdpc3RyeVxuICBjcmVhdGVSZWdpc3RyeSBhcyBjcmVhdGVcblxuIl0sIm5hbWVzIjpbIk9iak1hcCIsIldlYWtNYXAiLCJNYXAiLCJkZWNvZGVPYmplY3RUcmVlIiwicmV2aXRhbGl6ZXIiLCJqc29uX3NvdXJjZSIsImN0eCIsInRva2VuIiwibG9va3VwUmV2aXZlciIsInF1ZXVlIiwiYnlPaWQiLCJ2IiwiSlNPTiIsInBhcnNlIiwiX2pzb25fY3JlYXRlIiwicmVmcyIsIl9qc29uX3Jlc3RvcmUiLCJldnRzIiwiX3N0YXJ0IiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwicmV2ZXJzZSIsIm1hcCIsImVudHJ5IiwicmV2aXZlciIsInJldml2ZSIsIm9iaiIsInN0YXJ0ZWQiLCJsc3QiLCJsZW5ndGgiLCJmaW5pc2hlZCIsImFsbCIsImRvbmUiLCJyb290IiwiZ2V0IiwicHJvbWlzZSIsInVuZGVmaW5lZCIsImFucyIsImtleSIsInZhbHVlIiwiQXJyYXkiLCJpc0FycmF5Iiwia2luZCIsIm9pZCIsIlJldml2ZXJOb3RGb3VuZCIsImJvZHkiLCJpbml0IiwiT2JqZWN0IiwiY3JlYXRlIiwic2V0IiwicHVzaCIsInJvb3Rfb2JqIiwiZnJlZXplIiwicm9vdF9saXN0IiwiZW5jb2RlT2JqZWN0VHJlZSIsImFuT2JqZWN0IiwiY2JfYWRkT2JqZWN0IiwibG9va3VwUHJlc2VydmVyIiwiZmluZFByZXNlcnZlciIsIl9ib3VuZEZpbmRQcmVzZXJ2ZUZvck9iaiIsImxvb2t1cCIsInN0cmluZ2lmeSIsIl9qc29uX3JlcGxhY2VyIiwic2F2ZSIsInNoaWZ0IiwiY29udGVudCIsImVyciIsImRzdFZhbHVlIiwic3JjVmFsdWUiLCJwcmV2IiwicHJlc2VydmVyIiwic2l6ZSIsInJlZiIsInByZXNlcnZlIiwiYXR0cnMiLCJhc3NpZ24iLCJSZXZpdGFsaXphdGlvbiIsIkZ1bmN0aW9uIiwiRXJyb3IiLCJ0b2tlbl9wIiwibHV0UmV2aXZlIiwibHV0UHJlc2VydmUiLCJzZWxmIiwic2V0UHJvdG90eXBlT2YiLCJyZWdpc3RlciIsInByb3RvdHlwZSIsImRlZmluZVByb3BlcnRpZXMiLCJiaW5kIiwiX3NldFJldml2ZXIiLCJpbml0UmVnaXN0ZXJ5IiwiYXBwbHkiLCJhcmd1bWVudHMiLCJraW5kcyIsIm1hdGNoZXJzIiwiZWFjaCIsIm1hdGNoIiwicm9vdExpc3QiLCJfIiwic2xpY2UiLCJyZWdpc3RlclJldml2ZXIiLCJ0Z3QiLCJjYWxsIiwicmVnaXN0ZXJDbGFzcyIsInJlZ2lzdGVyUHJvdG8iLCJUeXBlRXJyb3IiLCJrbGFzcyIsInByb3RvIiwicHJldHR5IiwiZW5jb2RlVG9SZWZzIiwiam9pbiIsImNvbnN0cnVjdG9yIiwiZ2V0UHJvdG90eXBlT2YiLCJjcmVhdGVSZWdpc3RyeSJdLCJtYXBwaW5ncyI6Ijs7OztBQUFPLE1BQU1BLFNBQVMsZ0JBQWdCLE9BQU9DLE9BQXZCLEdBQWlDQSxPQUFqQyxHQUEyQ0MsR0FBMUQ7O0FBRVAsQUFBTyxTQUFTQyxnQkFBVCxDQUEwQkMsV0FBMUIsRUFBdUNDLFdBQXZDLEVBQW9EQyxHQUFwRCxFQUF5RDtNQUMzRCxTQUFTRCxXQUFaLEVBQTBCO1dBQ2pCLElBQVAsQ0FEd0I7R0FHMUIsTUFBTUUsUUFBTUgsWUFBWUcsS0FBeEI7UUFDTUMsZ0JBQWNKLFlBQVlJLGFBQWhDOztRQUVNQyxRQUFNLEVBQVo7UUFBZ0JDLFFBQU0sSUFBSVIsR0FBSixFQUF0QjtRQUFpQ1MsSUFBRSxFQUFuQztJQUNFLENBQUYsSUFBT0MsS0FBS0MsS0FBTCxDQUFXUixXQUFYLEVBQXdCUyxZQUF4QixDQUFQOztRQUVNQyxPQUFLLElBQUlmLE1BQUosRUFBWDtJQUNFLENBQUYsSUFBT1ksS0FBS0MsS0FBTCxDQUFXUixXQUFYLEVBQXdCVyxhQUF4QixDQUFQOztRQUVNQyxPQUFPLEVBQWI7UUFDTUMsU0FBU0MsUUFBUUMsT0FBUixHQUFrQkMsSUFBbEIsQ0FBeUIsTUFDdENaLE1BQU1hLE9BQU4sR0FBZ0JDLEdBQWhCLENBQXNCQyxTQUFTO1VBQ3ZCUCxJQUFOLEdBQWFBLElBQWI7V0FDT08sTUFBTUMsT0FBTixDQUFjQyxNQUFkLENBQXFCRixNQUFNRyxHQUEzQixFQUFnQ0gsS0FBaEMsRUFBdUNsQixHQUF2QyxDQUFQO0dBRkYsQ0FEYSxDQUFmOztPQUtLc0IsT0FBTCxHQUFlVixPQUFPRyxJQUFQLENBQWNRLE9BQU9BLElBQUlDLE1BQXpCLENBQWY7T0FDS0MsUUFBTCxHQUFnQmIsT0FBT0csSUFBUCxDQUFjUSxPQUM1QlYsUUFBUWEsR0FBUixDQUFZSCxHQUFaLEVBQWlCUixJQUFqQixDQUF3QlEsT0FBT0EsSUFBSUMsTUFBbkMsQ0FEYyxD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
