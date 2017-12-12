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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvZGVjb2RlLmpzIiwiLi4vY29kZS9lbmNvZGUuanMiLCIuLi9jb2RlL3Jldml0YWxpemF0aW9uLmpzIiwiLi4vY29kZS9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY29uc3QgT2JqTWFwID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBXZWFrTWFwID8gV2Vha01hcCA6IE1hcFxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlT2JqZWN0VHJlZShyZXZpdGFsaXplciwganNvbl9zb3VyY2UsIGN0eCkgOjpcbiAgaWYgbnVsbCA9PT0ganNvbl9zb3VyY2UgOjpcbiAgICByZXR1cm4gbnVsbCAvLyBKU09OLnBhcnNlKG51bGwpIHJldHVybnMgbnVsbDsga2VlcCB3aXRoIGNvbnZlbnRpb25cblxuICBjb25zdCB0b2tlbj1yZXZpdGFsaXplci50b2tlblxuICBjb25zdCBsb29rdXBSZXZpdmVyPXJldml0YWxpemVyLmxvb2t1cFJldml2ZXJcblxuICBjb25zdCBxdWV1ZT1bXSwgYnlPaWQ9bmV3IE1hcCgpLCB2PVtdXG4gIHZbMF0gPSBKU09OLnBhcnNlKGpzb25fc291cmNlLCBfanNvbl9jcmVhdGUpXG5cbiAgY29uc3QgcmVmcz1uZXcgT2JqTWFwKClcbiAgdlsxXSA9IEpTT04ucGFyc2UoanNvbl9zb3VyY2UsIF9qc29uX3Jlc3RvcmUpXG5cbiAgY29uc3QgZXZ0cyA9IHt9XG4gIGNvbnN0IF9zdGFydCA9IFByb21pc2UucmVzb2x2ZSgpLnRoZW4gQCAoKSA9PlxuICAgIHF1ZXVlLnJldmVyc2UoKS5tYXAgQCBlbnRyeSA9PiA6OlxuICAgICAgZW50cnkuZXZ0cyA9IGV2dHNcbiAgICAgIHJldHVybiBlbnRyeS5yZXZpdmVyLnJldml2ZShlbnRyeS5vYmosIGVudHJ5LCBjdHgpXG5cbiAgZXZ0cy5zdGFydGVkID0gX3N0YXJ0LnRoZW4gQCBsc3QgPT4gbHN0Lmxlbmd0aFxuICBldnRzLmZpbmlzaGVkID0gX3N0YXJ0LnRoZW4gQCBsc3QgPT5cbiAgICBQcm9taXNlLmFsbChsc3QpLnRoZW4gQCBsc3QgPT4gbHN0Lmxlbmd0aFxuXG4gIGV2dHMuZG9uZSA9IGV2dHMuZmluaXNoZWQudGhlbiBAICgpID0+IDo6XG4gICAgY29uc3Qgcm9vdCA9IGJ5T2lkLmdldCgwKVxuICAgIGlmIG51bGwgPT0gcm9vdCA6OiByZXR1cm5cblxuICAgIGNvbnN0IHtvYmosIHByb21pc2V9ID0gcm9vdFxuICAgIHJldHVybiB1bmRlZmluZWQgPT09IHByb21pc2UgPyBvYmpcbiAgICAgIDogcHJvbWlzZS50aGVuIEAgYW5zID0+XG4gICAgICAgICAgYW5zICE9PSB1bmRlZmluZWQgPyBhbnMgOiBvYmpcblxuICByZXR1cm4gZXZ0c1xuXG5cbiAgZnVuY3Rpb24gX2pzb25fY3JlYXRlKGtleSwgdmFsdWUpIDo6XG4gICAgaWYgdG9rZW4gPT09IGtleSA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgZWxzZSBpZiBBcnJheS5pc0FycmF5KHZhbHVlKSA6OlxuICAgICAgICBkZWxldGUgdGhpc1t0b2tlbl1cblxuICAgICAgICBjb25zdCBba2luZCwgb2lkXSA9IHZhbHVlXG4gICAgICAgIGNvbnN0IHJldml2ZXIgPSBsb29rdXBSZXZpdmVyKGtpbmQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmV2aXZlciA6OlxuICAgICAgICAgIHRocm93IG5ldyBSZXZpdmVyTm90Rm91bmQoYE1pc3NpbmcgcmVnaXN0ZXJlZCByZXZpdmVyIGZvciBraW5kIFwiJHtraW5kfVwiYClcblxuICAgICAgICBjb25zdCBlbnRyeSA9IEA6IGtpbmQsIG9pZCwgcmV2aXZlciwgYm9keTogdGhpc1xuXG4gICAgICAgIGVudHJ5Lm9iaiA9IHJldml2ZXIuaW5pdFxuICAgICAgICAgID8gcmV2aXZlci5pbml0KGVudHJ5LCBjdHgpXG4gICAgICAgICAgOiBPYmplY3QuY3JlYXRlKG51bGwpXG5cbiAgICAgICAgYnlPaWQuc2V0KG9pZCwgZW50cnkpXG4gICAgICAgIHF1ZXVlLnB1c2goZW50cnkpXG4gICAgICByZXR1cm5cblxuICAgIHJldHVybiB2YWx1ZVxuXG5cbiAgZnVuY3Rpb24gX2pzb25fcmVzdG9yZShrZXksIHZhbHVlKSA6OlxuICAgIGlmIHRva2VuID09PSBrZXkgOjpcbiAgICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgcmVmcy5zZXQgQCB0aGlzLCBieU9pZC5nZXQodmFsdWUpLm9ialxuXG4gICAgICBlbHNlIGlmIEFycmF5LmlzQXJyYXkodmFsdWUpIDo6XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gYnlPaWQuZ2V0KHZhbHVlWzFdKVxuICAgICAgICBlbnRyeS5ib2R5ID0gdGhpc1xuICAgICAgICByZWZzLnNldCBAIHRoaXMsIGVudHJ5Lm9ialxuICAgICAgcmV0dXJuXG5cbiAgICBlbHNlIGlmIG51bGwgPT09IHZhbHVlIHx8ICdvYmplY3QnICE9PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgY29uc3QgYW5zID0gcmVmcy5nZXQodmFsdWUpXG4gICAgcmV0dXJuIGFucyAhPT0gdW5kZWZpbmVkID8gYW5zIDogdmFsdWVcblxuIiwiZXhwb3J0IGNvbnN0IHJvb3Rfb2JqID0gT2JqZWN0LmZyZWV6ZSBAIHt9XG5leHBvcnQgY29uc3Qgcm9vdF9saXN0ID0gT2JqZWN0LmZyZWV6ZSBAIFtdXG5cbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGVPYmplY3RUcmVlKHJldml0YWxpemVyLCBhbk9iamVjdCwgY3R4LCBjYl9hZGRPYmplY3QpIDo6XG4gIGNvbnN0IHRva2VuPXJldml0YWxpemVyLnRva2VuXG4gIGNvbnN0IGxvb2t1cFByZXNlcnZlcj1yZXZpdGFsaXplci5sb29rdXBQcmVzZXJ2ZXJcbiAgY29uc3QgZmluZFByZXNlcnZlcj1yZXZpdGFsaXplci5fYm91bmRGaW5kUHJlc2VydmVGb3JPYmooKVxuXG4gIGNvbnN0IHF1ZXVlPVtdLCBsb29rdXA9bmV3IE1hcCgpLCB2PVtdXG4gIHZbMF0gPSBKU09OLnN0cmluZ2lmeShhbk9iamVjdCwgX2pzb25fcmVwbGFjZXIpXG4gIHJldHVybiBfZW5jb2RlUXVldWUoKVxuXG4gIGZ1bmN0aW9uIF9lbmNvZGVRdWV1ZSgpIDo6XG4gICAgaWYgMCA9PT0gcXVldWUubGVuZ3RoIDo6XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcblxuICAgIGNvbnN0IHByb21pc2VzID0gW11cbiAgICB3aGlsZSAwICE9PSBxdWV1ZS5sZW5ndGggOjpcbiAgICAgIGNvbnN0IHRpcCA9IHF1ZXVlLnNoaWZ0KCksIG9pZCA9IHRpcC5vaWRcbiAgICAgIHByb21pc2VzLnB1c2ggQCB0aXAudGhlbiBAXG4gICAgICAgIGJvZHkgPT4gOjpcbiAgICAgICAgICB0cnkgOjpcbiAgICAgICAgICAgIHZhciBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoYm9keSwgX2pzb25fcmVwbGFjZXIpXG4gICAgICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgICAgICByZXR1cm4gY2JfYWRkT2JqZWN0KGVycilcbiAgICAgICAgICByZXR1cm4gY2JfYWRkT2JqZWN0IEAgbnVsbCwgeyBvaWQsIGJvZHksIGNvbnRlbnQgfVxuXG4gICAgICAgIGVyciA9PiBjYl9hZGRPYmplY3QoZXJyKVxuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKF9lbmNvZGVRdWV1ZSlcblxuICBmdW5jdGlvbiBfanNvbl9yZXBsYWNlcihrZXksIGRzdFZhbHVlKSA6OlxuICAgIC8vIHNyY1ZhbHVlICE9PSBkc3RWYWx1ZSBmb3Igb2JqZWN0cyB3aXRoIC50b0pTT04oKSBtZXRob2RzXG4gICAgY29uc3Qgc3JjVmFsdWUgPSB0aGlzW2tleV1cblxuICAgIGlmIGRzdFZhbHVlID09PSBudWxsIHx8ICdvYmplY3QnICE9PSB0eXBlb2Ygc3JjVmFsdWUgOjpcbiAgICAgIHJldHVybiBkc3RWYWx1ZVxuXG4gICAgY29uc3QgcHJldiA9IGxvb2t1cC5nZXQoc3JjVmFsdWUpXG4gICAgaWYgdW5kZWZpbmVkICE9PSBwcmV2IDo6XG4gICAgICByZXR1cm4gcHJldiAvLyBhbHJlYWR5IHNlcmlhbGl6ZWQgLS0gcmVmZXJlbmNlIGV4aXN0aW5nIGl0ZW1cblxuICAgIGxldCBwcmVzZXJ2ZXIgPSBmaW5kUHJlc2VydmVyKHNyY1ZhbHVlKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gcHJlc2VydmVyIDo6XG4gICAgICAvLyBub3QgYSBcInNwZWNpYWxcIiBwcmVzZXJ2ZWQgaXRlbVxuICAgICAgaWYgYW5PYmplY3QgIT09IHNyY1ZhbHVlIDo6XG4gICAgICAgIHJldHVybiBkc3RWYWx1ZSAvLyBzbyBzZXJpYWxpemUgbm9ybWFsbHlcbiAgICAgIC8vIGJ1dCBpdCBpcyB0aGUgcm9vdCwgc28gc3RvcmUgYXQgb2lkIDBcbiAgICAgIHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlciBAXG4gICAgICAgIEFycmF5LmlzQXJyYXkoZHN0VmFsdWUpID8gcm9vdF9saXN0IDogcm9vdF9vYmpcblxuICAgIC8vIHJlZ2lzdGVyIGlkIGZvciBvYmplY3QgYW5kIHJldHVybiBhIEpTT04gc2VyaWFsaXphYmxlIHZlcnNpb25cbiAgICBjb25zdCBvaWQgPSBsb29rdXAuc2l6ZVxuICAgIGNvbnN0IHJlZiA9IHtbdG9rZW5dOiBvaWR9XG4gICAgbG9va3VwLnNldChzcmNWYWx1ZSwgcmVmKVxuXG4gICAgLy8gdHJhbnNmb3JtIGxpdmUgb2JqZWN0IGludG8gcHJlc2VydmVkIGZvcm1cbiAgICBjb25zdCBib2R5ID0ge1t0b2tlbl06IFtwcmVzZXJ2ZXIua2luZCwgb2lkXX1cbiAgICBjb25zdCBwcm9taXNlID0gUHJvbWlzZVxuICAgICAgLnJlc29sdmUgQFxuICAgICAgICBwcmVzZXJ2ZXIucHJlc2VydmVcbiAgICAgICAgICA/IHByZXNlcnZlci5wcmVzZXJ2ZShkc3RWYWx1ZSwgc3JjVmFsdWUsIGN0eClcbiAgICAgICAgICA6IGRzdFZhbHVlXG4gICAgICAudGhlbiBAIGF0dHJzID0+IE9iamVjdC5hc3NpZ24oYm9keSwgYXR0cnMpXG5cbiAgICBwcm9taXNlLm9pZCA9IG9pZFxuICAgIHF1ZXVlLnB1c2ggQCBwcm9taXNlXG4gICAgcmV0dXJuIHJlZlxuXG4iLCJpbXBvcnQge2RlY29kZU9iamVjdFRyZWUsIE9iak1hcH0gZnJvbSAnLi9kZWNvZGUnXG5pbXBvcnQge2VuY29kZU9iamVjdFRyZWUsIHJvb3Rfb2JqLCByb290X2xpc3R9IGZyb20gJy4vZW5jb2RlJ1xuXG5leHBvcnQgY2xhc3MgUmV2aXRhbGl6YXRpb24gZXh0ZW5kcyBGdW5jdGlvbiA6OlxuICBjb25zdHJ1Y3RvcigpIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVc2UgdGhlIHN0YXRpYyAuY3JlYXRlKCkgaW5zdGVhZCBvZiBuZXcnKVxuXG4gIHN0YXRpYyBjcmVhdGUodG9rZW5fcCkgOjpcbiAgICByZWdpc3Rlci50b2tlbiA9IHRva2VuX3AgfHwgJ1xcdTAzOUUnIC8vICfOnidcblxuICAgIGNvbnN0IGx1dFJldml2ZT1uZXcgTWFwKClcbiAgICBjb25zdCBsdXRQcmVzZXJ2ZT1uZXcgT2JqTWFwKClcblxuICAgIGNvbnN0IHNlbGYgPSBPYmplY3Quc2V0UHJvdG90eXBlT2YocmVnaXN0ZXIsIHRoaXMucHJvdG90eXBlKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgc2VsZiwgQHt9XG4gICAgICBsb29rdXBSZXZpdmVyOiBAe30gdmFsdWU6IGx1dFJldml2ZS5nZXQuYmluZChsdXRSZXZpdmUpXG4gICAgICBsb29rdXBQcmVzZXJ2ZXI6IEB7fSB2YWx1ZTogbHV0UHJlc2VydmUuZ2V0LmJpbmQobHV0UHJlc2VydmUpXG4gICAgICBfc2V0UmV2aXZlcjogQHt9IHZhbHVlOiBfc2V0UmV2aXZlclxuXG5cbiAgICBzZWxmLmluaXRSZWdpc3Rlcnkocm9vdF9vYmosIHJvb3RfbGlzdClcbiAgICByZXR1cm4gc2VsZlxuXG4gICAgZnVuY3Rpb24gcmVnaXN0ZXIoKSA6OlxuICAgICAgcmV0dXJuIHNlbGYucmVnaXN0ZXIuYXBwbHkoc2VsZiwgYXJndW1lbnRzKVxuXG4gICAgZnVuY3Rpb24gX3NldFJldml2ZXIocmV2aXZlciwga2luZHMsIG1hdGNoZXJzKSA6OlxuICAgICAgbHV0UmV2aXZlLnNldChyZXZpdmVyLmtpbmQsIHJldml2ZXIpXG4gICAgICByZXR1cm4gQDpcbiAgICAgICAgYWxpYXMoLi4ua2luZHMpIDo6XG4gICAgICAgICAgZm9yIGNvbnN0IGVhY2ggb2Yga2luZHMgOjpcbiAgICAgICAgICAgIGlmIGVhY2ggOjogbHV0UmV2aXZlLnNldChlYWNoLCByZXZpdmVyKVxuICAgICAgICAgIHJldHVybiB0aGlzXG4gICAgICAgIG1hdGNoKC4uLm1hdGNoZXJzKSA6OlxuICAgICAgICAgIGZvciBjb25zdCBlYWNoIG9mIG1hdGNoZXJzIDo6XG4gICAgICAgICAgICBpZiBudWxsICE9IGVhY2ggOjogbHV0UHJlc2VydmUuc2V0KGVhY2gsIHJldml2ZXIpXG4gICAgICAgICAgcmV0dXJuIHRoaXNcblxuXG4gIGluaXRSZWdpc3Rlcnkocm9vdF9vYmosIHJvb3RfbGlzdCkgOjpcbiAgICB0aGlzXG4gICAgICAucmVnaXN0ZXIgQDoga2luZDogJ3tyb290fSdcbiAgICAgICAgcmV2aXZlKG9iaiwgZW50cnkpIDo6IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgLm1hdGNoIEAgcm9vdF9vYmpcblxuICAgIHRoaXNcbiAgICAgIC5yZWdpc3RlciBAOiBraW5kOiAnW3Jvb3RdJ1xuICAgICAgICBwcmVzZXJ2ZShyb290TGlzdCkgOjogcmV0dXJuIEB7fSBfOiByb290TGlzdC5zbGljZSgpXG4gICAgICAgIGluaXQoZW50cnkpIDo6IHJldHVybiBbXVxuICAgICAgICByZXZpdmUocm9vdExpc3QsIGVudHJ5KSA6OlxuICAgICAgICAgIHJvb3RMaXN0LnB1c2guYXBwbHkocm9vdExpc3QsIGVudHJ5LmJvZHkuXylcbiAgICAgIC5tYXRjaCBAIHJvb3RfbGlzdFxuXG4gIHJlZ2lzdGVyKHJldml0YWxpemVyKSA6OlxuICAgIGlmICdraW5kJyBpbiByZXZpdGFsaXplciAmJiByZXZpdGFsaXplci5yZXZpdmUgOjpcbiAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyUmV2aXZlcihyZXZpdGFsaXplcilcblxuICAgIGxldCB0Z3RcbiAgICBpZiB1bmRlZmluZWQgIT09IHJldml0YWxpemVyLnByb3RvdHlwZSA6OlxuICAgICAgdGd0ID0gcmV2aXRhbGl6ZXIucHJvdG90eXBlW3RoaXMudG9rZW5dXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRndCA6OlxuICAgICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgICAgdGd0ID0gdGd0LmNhbGwocmV2aXRhbGl6ZXIucHJvdG90eXBlLCB0aGlzKVxuICAgICAgICAgIGlmIG51bGwgPT0gdGd0IDo6IHJldHVyblxuICAgICAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyQ2xhc3ModGd0LCByZXZpdGFsaXplcilcblxuICAgIHRndCA9IHJldml0YWxpemVyW3RoaXMudG9rZW5dXG4gICAgaWYgdW5kZWZpbmVkICE9PSB0Z3QgOjpcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgdGd0ID0gdGd0LmNhbGwocmV2aXRhbGl6ZXIsIHRoaXMpXG4gICAgICAgIGlmIG51bGwgPT0gdGd0IDo6IHJldHVyblxuICAgICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJQcm90byh0Z3QsIHJldml0YWxpemVyLnByb3RvdHlwZSB8fCByZXZpdGFsaXplcilcbiAgICAgICAgICAubWF0Y2gocmV2aXRhbGl6ZXIpXG5cbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBVbnJlY29nbml6ZWQgcmV2aXRhbGl6YXRpb24gcmVnaXN0cmF0aW9uYClcblxuICByZWdpc3RlclJldml2ZXIocmV2aXZlcikgOjpcbiAgICA6OlxuICAgICAgY29uc3Qga2luZCA9IHJldml2ZXIua2luZFxuICAgICAgaWYgJ3N0cmluZycgIT09IHR5cGVvZiBraW5kICYmIHRydWUgIT09IGtpbmQgJiYgZmFsc2UgIT09IGtpbmQgJiYgbnVsbCAhPT0ga2luZCA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYFwia2luZFwiIG11c3QgYmUgYSBzdHJpbmdgXG5cbiAgICAgIGlmIHJldml2ZXIuaW5pdCAmJiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmV2aXZlci5pbml0IDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCAnXCJpbml0XCIgbXVzdCBiZSBhIGZ1bmN0aW9uJ1xuXG4gICAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmV2aXZlci5yZXZpdmUgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcInJldml2ZVwiIG11c3QgYmUgYSBmdW5jdGlvbidcblxuICAgICAgaWYgcmV2aXZlci5wcmVzZXJ2ZSAmJiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmV2aXZlci5wcmVzZXJ2ZSA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wicHJlc2VydmVcIiBtdXN0IGJlIGEgZnVuY3Rpb24gaWYgcHJvdmlkZWQnXG5cbiAgICByZXR1cm4gdGhpcy5fc2V0UmV2aXZlcihyZXZpdmVyKVxuXG4gIHJlZ2lzdGVyQ2xhc3Moa2luZCwga2xhc3MpIDo6XG4gICAgcmV0dXJuIHRoaXNcbiAgICAgIC5yZWdpc3RlclJldml2ZXIgQDoga2luZCxcbiAgICAgICAgcmV2aXZlKG9iaiwgZW50cnkpIDo6XG4gICAgICAgICAgb2JqID0gT2JqZWN0LmFzc2lnbihvYmosIGVudHJ5LmJvZHkpXG4gICAgICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKG9iaiwga2xhc3MucHJvdG90eXBlKVxuICAgICAgLm1hdGNoKGtsYXNzLCBrbGFzcy5wcm90b3R5cGUpXG5cbiAgcmVnaXN0ZXJQcm90byhraW5kLCBwcm90bykgOjpcbiAgICByZXR1cm4gdGhpc1xuICAgICAgLnJlZ2lzdGVyUmV2aXZlciBAOiBraW5kLFxuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjpcbiAgICAgICAgICBvYmogPSBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2Yob2JqLCBwcm90bylcbiAgICAgIC5tYXRjaChwcm90bylcblxuXG4gIGRlY29kZShqc29uX3NvdXJjZSwgY3R4KSA6OlxuICAgIGlmIG51bGwgPT09IGpzb25fc291cmNlIDo6XG4gICAgICByZXR1cm4gbnVsbCAvLyBKU09OLnBhcnNlKG51bGwpIHJldHVybnMgbnVsbDsga2VlcCB3aXRoIGNvbnZlbnRpb25cblxuICAgIGNvbnN0IGV2dHMgPSBkZWNvZGVPYmplY3RUcmVlIEAgdGhpcywganNvbl9zb3VyY2UsIGN0eFxuICAgIHJldHVybiBldnRzLmRvbmVcblxuICBlbmNvZGVUb1JlZnMoYW5PYmplY3QsIGN0eCwgcmVmcykgOjpcbiAgICBpZiBudWxsID09IHJlZnMgOjogcmVmcyA9IFtdXG4gICAgY29uc3QgcHJvbWlzZSA9IGVuY29kZU9iamVjdFRyZWUgQCB0aGlzLCBhbk9iamVjdCwgY3R4LCAoZXJyLCBlbnRyeSkgPT4gOjpcbiAgICAgIHJlZnNbZW50cnkub2lkXSA9IGVudHJ5LmNvbnRlbnRcbiAgICByZXR1cm4gcHJvbWlzZS50aGVuIEAgKCkgPT4gcmVmc1xuXG4gIGVuY29kZShhbk9iamVjdCwgY3R4LCBwcmV0dHkpIDo6XG4gICAgcmV0dXJuIHRoaXMuZW5jb2RlVG9SZWZzKGFuT2JqZWN0LCBjdHgpLnRoZW4gQCByZWZzID0+IDo6XG4gICAgICBjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeSBAIGAke3RoaXMudG9rZW59cmVmc2BcbiAgICAgIHJldHVybiBwcmV0dHlcbiAgICAgICAgPyBgeyR7a2V5fTogW1xcbiAgJHtyZWZzLmpvaW4oJyxcXG4gICcpfSBdfVxcbmBcbiAgICAgICAgOiBgeyR7a2V5fTpbJHtyZWZzLmpvaW4oJywnKX1dfWBcblxuICBfYm91bmRGaW5kUHJlc2VydmVGb3JPYmooKSA6OlxuICAgIGNvbnN0IGxvb2t1cFByZXNlcnZlciA9IHRoaXMubG9va3VwUHJlc2VydmVyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikgOjpcbiAgICAgIGxldCBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIob2JqKVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG4gICAgICBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIob2JqLmNvbnN0cnVjdG9yKVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG4gICAgICBsZXQgcHJvdG8gPSBvYmpcbiAgICAgIHdoaWxlIG51bGwgIT09IEAgcHJvdG8gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YocHJvdG8pIDo6XG4gICAgICAgIGxldCBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIocHJvdG8pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJlc2VydmVyIDo6XG4gICAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG5cbmV4cG9ydCBjbGFzcyBSZXZpdmVyTm90Rm91bmQgZXh0ZW5kcyBFcnJvciA6OlxuXG4iLCJpbXBvcnQge1Jldml0YWxpemF0aW9ufSBmcm9tICcuL3Jldml0YWxpemF0aW9uJ1xuXG5jb25zdCBjcmVhdGVSZWdpc3RyeSA9IFJldml0YWxpemF0aW9uLmNyZWF0ZS5iaW5kKFJldml0YWxpemF0aW9uKVxuXG5leHBvcnQgKiBmcm9tICcuL2VuY29kZSdcbmV4cG9ydCAqIGZyb20gJy4vZGVjb2RlJ1xuZXhwb3J0ICogZnJvbSAnLi9yZXZpdGFsaXphdGlvbidcbmV4cG9ydCBkZWZhdWx0IGNyZWF0ZVJlZ2lzdHJ5KClcbmV4cG9ydCBAe31cbiAgY3JlYXRlUmVnaXN0cnlcbiAgY3JlYXRlUmVnaXN0cnkgYXMgY3JlYXRlXG5cbiJdLCJuYW1lcyI6WyJPYmpNYXAiLCJXZWFrTWFwIiwiTWFwIiwiZGVjb2RlT2JqZWN0VHJlZSIsInJldml0YWxpemVyIiwianNvbl9zb3VyY2UiLCJjdHgiLCJ0b2tlbiIsImxvb2t1cFJldml2ZXIiLCJxdWV1ZSIsImJ5T2lkIiwidiIsIkpTT04iLCJwYXJzZSIsIl9qc29uX2NyZWF0ZSIsInJlZnMiLCJfanNvbl9yZXN0b3JlIiwiZXZ0cyIsIl9zdGFydCIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsInJldmVyc2UiLCJtYXAiLCJlbnRyeSIsInJldml2ZXIiLCJyZXZpdmUiLCJvYmoiLCJzdGFydGVkIiwibHN0IiwibGVuZ3RoIiwiZmluaXNoZWQiLCJhbGwiLCJkb25lIiwicm9vdCIsImdldCIsInByb21pc2UiLCJ1bmRlZmluZWQiLCJhbnMiLCJrZXkiLCJ2YWx1ZSIsIkFycmF5IiwiaXNBcnJheSIsImtpbmQiLCJvaWQiLCJSZXZpdmVyTm90Rm91bmQiLCJib2R5IiwiaW5pdCIsIk9iamVjdCIsImNyZWF0ZSIsInNldCIsInB1c2giLCJyb290X29iaiIsImZyZWV6ZSIsInJvb3RfbGlzdCIsImVuY29kZU9iamVjdFRyZWUiLCJhbk9iamVjdCIsImNiX2FkZE9iamVjdCIsImxvb2t1cFByZXNlcnZlciIsImZpbmRQcmVzZXJ2ZXIiLCJfYm91bmRGaW5kUHJlc2VydmVGb3JPYmoiLCJsb29rdXAiLCJzdHJpbmdpZnkiLCJfanNvbl9yZXBsYWNlciIsIl9lbmNvZGVRdWV1ZSIsInByb21pc2VzIiwidGlwIiwic2hpZnQiLCJjb250ZW50IiwiZXJyIiwiZHN0VmFsdWUiLCJzcmNWYWx1ZSIsInByZXYiLCJwcmVzZXJ2ZXIiLCJzaXplIiwicmVmIiwicHJlc2VydmUiLCJhdHRycyIsImFzc2lnbiIsIlJldml0YWxpemF0aW9uIiwiRnVuY3Rpb24iLCJFcnJvciIsInRva2VuX3AiLCJsdXRSZXZpdmUiLCJsdXRQcmVzZXJ2ZSIsInNlbGYiLCJzZXRQcm90b3R5cGVPZiIsInJlZ2lzdGVyIiwicHJvdG90eXBlIiwiZGVmaW5lUHJvcGVydGllcyIsImJpbmQiLCJfc2V0UmV2aXZlciIsImluaXRSZWdpc3RlcnkiLCJhcHBseSIsImFyZ3VtZW50cyIsImtpbmRzIiwibWF0Y2hlcnMiLCJlYWNoIiwibWF0Y2giLCJyb290TGlzdCIsIl8iLCJzbGljZSIsInJlZ2lzdGVyUmV2aXZlciIsInRndCIsImNhbGwiLCJyZWdpc3RlckNsYXNzIiwicmVnaXN0ZXJQcm90byIsIlR5cGVFcnJvciIsImtsYXNzIiwicHJvdG8iLCJwcmV0dHkiLCJlbmNvZGVUb1JlZnMiLCJqb2luIiwiY29uc3RydWN0b3IiLCJnZXRQcm90b3R5cGVPZiIsImNyZWF0ZVJlZ2lzdHJ5Il0sIm1hcHBpbmdzIjoiOzs7O0FBQU8sTUFBTUEsU0FBUyxnQkFBZ0IsT0FBT0MsT0FBdkIsR0FBaUNBLE9BQWpDLEdBQTJDQyxHQUExRDs7QUFFUCxBQUFPLFNBQVNDLGdCQUFULENBQTBCQyxXQUExQixFQUF1Q0MsV0FBdkMsRUFBb0RDLEdBQXBELEVBQXlEO01BQzNELFNBQVNELFdBQVosRUFBMEI7V0FDakIsSUFBUCxDQUR3QjtHQUcxQixNQUFNRSxRQUFNSCxZQUFZRyxLQUF4QjtRQUNNQyxnQkFBY0osWUFBWUksYUFBaEM7O1FBRU1DLFFBQU0sRUFBWjtRQUFnQkMsUUFBTSxJQUFJUixHQUFKLEVBQXRCO1FBQWlDUyxJQUFFLEVBQW5DO0lBQ0UsQ0FBRixJQUFPQyxLQUFLQyxLQUFMLENBQVdSLFdBQVgsRUFBd0JTLFlBQXhCLENBQVA7O1FBRU1DLE9BQUssSUFBSWYsTUFBSixFQUFYO0lBQ0UsQ0FBRixJQUFPWSxLQUFLQyxLQUFMLENBQVdSLFdBQVgsRUFBd0JXLGFBQXhCLENBQVA7O1FBRU1DLE9BQU8sRUFBYjtRQUNNQyxTQUFTQyxRQUFRQyxPQUFSLEdBQWtCQyxJQUFsQixD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
