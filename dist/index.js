'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const ObjMap = 'undefined' !== typeof WeakMap ? WeakMap : Map;

function decodeObjectTree(reviver, json_source, ctx) {
  if (null === json_source) {
    return null; // JSON.parse(null) returns null; keep with convention
  }const token = reviver.token;
  const lookupReviver = reviver.lookupReviver;

  const queue = [],
        byOid = new Map();
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

  
}

const root_obj = Object.freeze({});
const root_list = Object.freeze([]);

function encodeObjectTree(reviver, anObject, ctx, cb_addObject) {
  const token = reviver.token;
  const lookupPreserver = reviver.lookupPreserver;
  const findPreserver = reviver._boundFindPreserveForObj();

  const queue = [],
        lookup = new Map();
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

  encode(anObject, ctx) {
    const refs = [];
    const promise = encodeObjectTree(this, anObject, ctx, (err, entry) => {
      refs[entry.oid] = entry.content;
    });

    const key = JSON.stringify(`${this.token}refs`);
    return promise.then(() => `{${key}: [\n  ${refs.join(',\n  ')} ]}\n`);
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
exports.Revitalization = Revitalization;
exports.ReviverNotFound = ReviverNotFound$1;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvZGVjb2RlLmpzIiwiLi4vY29kZS9lbmNvZGUuanMiLCIuLi9jb2RlL3Jldml0YWxpemF0aW9uLmpzIiwiLi4vY29kZS9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY29uc3QgT2JqTWFwID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBXZWFrTWFwID8gV2Vha01hcCA6IE1hcFxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlT2JqZWN0VHJlZShyZXZpdmVyLCBqc29uX3NvdXJjZSwgY3R4KSA6OlxuICBpZiBudWxsID09PSBqc29uX3NvdXJjZSA6OlxuICAgIHJldHVybiBudWxsIC8vIEpTT04ucGFyc2UobnVsbCkgcmV0dXJucyBudWxsOyBrZWVwIHdpdGggY29udmVudGlvblxuXG4gIGNvbnN0IHRva2VuPXJldml2ZXIudG9rZW5cbiAgY29uc3QgbG9va3VwUmV2aXZlcj1yZXZpdmVyLmxvb2t1cFJldml2ZXJcblxuICBjb25zdCBxdWV1ZT1bXSwgYnlPaWQ9bmV3IE1hcCgpXG4gIEpTT04ucGFyc2UoanNvbl9zb3VyY2UsIF9qc29uX2NyZWF0ZSlcblxuICBjb25zdCByZWZzPW5ldyBPYmpNYXAoKVxuICBKU09OLnBhcnNlKGpzb25fc291cmNlLCBfanNvbl9yZXN0b3JlKVxuXG4gIGNvbnN0IGV2dHMgPSB7fVxuICBjb25zdCBfc3RhcnQgPSBQcm9taXNlLnJlc29sdmUoKS50aGVuIEAgKCkgPT5cbiAgICBxdWV1ZS5yZXZlcnNlKCkubWFwIEAgZW50cnkgPT4gOjpcbiAgICAgIGVudHJ5LmV2dHMgPSBldnRzXG4gICAgICByZXR1cm4gZW50cnkucmV2aXZlci5yZXZpdmUoZW50cnkub2JqLCBlbnRyeSwgY3R4KVxuXG4gIGV2dHMuc3RhcnRlZCA9IF9zdGFydC50aGVuIEAgbHN0ID0+IGxzdC5sZW5ndGhcbiAgZXZ0cy5maW5pc2hlZCA9IF9zdGFydC50aGVuIEAgbHN0ID0+XG4gICAgUHJvbWlzZS5hbGwobHN0KS50aGVuIEAgbHN0ID0+IGxzdC5sZW5ndGhcblxuICBldnRzLmRvbmUgPSBldnRzLmZpbmlzaGVkLnRoZW4gQCAoKSA9PiA6OlxuICAgIGNvbnN0IHJvb3QgPSBieU9pZC5nZXQoMClcbiAgICBpZiBudWxsID09IHJvb3QgOjogcmV0dXJuXG5cbiAgICBjb25zdCB7b2JqLCBwcm9taXNlfSA9IHJvb3RcbiAgICByZXR1cm4gdW5kZWZpbmVkID09PSBwcm9taXNlID8gb2JqXG4gICAgICA6IHByb21pc2UudGhlbiBAIGFucyA9PlxuICAgICAgICAgIGFucyAhPT0gdW5kZWZpbmVkID8gYW5zIDogb2JqXG5cbiAgcmV0dXJuIGV2dHNcblxuXG4gIGZ1bmN0aW9uIF9qc29uX2NyZWF0ZShrZXksIHZhbHVlKSA6OlxuICAgIGlmIHRva2VuID09PSBrZXkgOjpcbiAgICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgIGVsc2UgaWYgQXJyYXkuaXNBcnJheSh2YWx1ZSkgOjpcbiAgICAgICAgZGVsZXRlIHRoaXNbdG9rZW5dXG5cbiAgICAgICAgY29uc3QgW2tpbmQsIG9pZF0gPSB2YWx1ZVxuICAgICAgICBjb25zdCByZXZpdmVyID0gbG9va3VwUmV2aXZlcihraW5kKVxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IHJldml2ZXIgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgUmV2aXZlck5vdEZvdW5kKGBNaXNzaW5nIHJlZ2lzdGVyZWQgcmV2aXZlciBmb3Iga2luZCBcIiR7a2luZH1cImApXG5cbiAgICAgICAgY29uc3QgZW50cnkgPSBAOiBraW5kLCBvaWQsIHJldml2ZXIsIGJvZHk6IHRoaXNcblxuICAgICAgICBlbnRyeS5vYmogPSByZXZpdmVyLmluaXRcbiAgICAgICAgICA/IHJldml2ZXIuaW5pdChlbnRyeSwgY3R4KVxuICAgICAgICAgIDogT2JqZWN0LmNyZWF0ZShudWxsKVxuXG4gICAgICAgIGJ5T2lkLnNldChvaWQsIGVudHJ5KVxuICAgICAgICBxdWV1ZS5wdXNoKGVudHJ5KVxuICAgICAgcmV0dXJuXG5cbiAgICByZXR1cm4gdmFsdWVcblxuXG4gIGZ1bmN0aW9uIF9qc29uX3Jlc3RvcmUoa2V5LCB2YWx1ZSkgOjpcbiAgICBpZiB0b2tlbiA9PT0ga2V5IDo6XG4gICAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIHJlZnMuc2V0IEAgdGhpcywgYnlPaWQuZ2V0KHZhbHVlKS5vYmpcblxuICAgICAgZWxzZSBpZiBBcnJheS5pc0FycmF5KHZhbHVlKSA6OlxuICAgICAgICBjb25zdCBlbnRyeSA9IGJ5T2lkLmdldCh2YWx1ZVsxXSlcbiAgICAgICAgZW50cnkuYm9keSA9IHRoaXNcbiAgICAgICAgcmVmcy5zZXQgQCB0aGlzLCBlbnRyeS5vYmpcbiAgICAgIHJldHVyblxuXG4gICAgZWxzZSBpZiBudWxsID09PSB2YWx1ZSB8fCAnb2JqZWN0JyAhPT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICByZXR1cm4gdmFsdWVcblxuICAgIGNvbnN0IGFucyA9IHJlZnMuZ2V0KHZhbHVlKVxuICAgIHJldHVybiBhbnMgIT09IHVuZGVmaW5lZCA/IGFucyA6IHZhbHVlXG5cbiIsImV4cG9ydCBjb25zdCByb290X29iaiA9IE9iamVjdC5mcmVlemUgQCB7fVxuZXhwb3J0IGNvbnN0IHJvb3RfbGlzdCA9IE9iamVjdC5mcmVlemUgQCBbXVxuXG5leHBvcnQgZnVuY3Rpb24gZW5jb2RlT2JqZWN0VHJlZShyZXZpdmVyLCBhbk9iamVjdCwgY3R4LCBjYl9hZGRPYmplY3QpIDo6XG4gIGNvbnN0IHRva2VuPXJldml2ZXIudG9rZW5cbiAgY29uc3QgbG9va3VwUHJlc2VydmVyPXJldml2ZXIubG9va3VwUHJlc2VydmVyXG4gIGNvbnN0IGZpbmRQcmVzZXJ2ZXI9cmV2aXZlci5fYm91bmRGaW5kUHJlc2VydmVGb3JPYmooKVxuXG4gIGNvbnN0IHF1ZXVlPVtdLCBsb29rdXA9bmV3IE1hcCgpXG4gIEpTT04uc3RyaW5naWZ5KGFuT2JqZWN0LCBfanNvbl9yZXBsYWNlcilcblxuICByZXR1cm4gX2VuY29kZVF1ZXVlKClcblxuICBmdW5jdGlvbiBfZW5jb2RlUXVldWUoKSA6OlxuICAgIGlmIDAgPT09IHF1ZXVlLmxlbmd0aCA6OlxuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG5cbiAgICBjb25zdCBwcm9taXNlcyA9IFtdXG4gICAgd2hpbGUgMCAhPT0gcXVldWUubGVuZ3RoIDo6XG4gICAgICBjb25zdCB0aXAgPSBxdWV1ZS5zaGlmdCgpLCBvaWQgPSB0aXAub2lkXG4gICAgICBwcm9taXNlcy5wdXNoIEBcbiAgICAgICAgdGlwXG4gICAgICAgICAgLnRoZW4gQFxuICAgICAgICAgICAgICBib2R5ID0+IDo6XG4gICAgICAgICAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KGJvZHksIF9qc29uX3JlcGxhY2VyKVxuICAgICAgICAgICAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiX2FkZE9iamVjdChlcnIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiX2FkZE9iamVjdCBAIG51bGwsIHsgb2lkLCBib2R5LCBjb250ZW50IH1cblxuICAgICAgICAgICAgICBlcnIgPT4gY2JfYWRkT2JqZWN0KGVycilcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihfZW5jb2RlUXVldWUpXG5cbiAgZnVuY3Rpb24gX2pzb25fcmVwbGFjZXIoa2V5LCBkc3RWYWx1ZSkgOjpcbiAgICAvLyBzcmNWYWx1ZSAhPT0gZHN0VmFsdWUgZm9yIG9iamVjdHMgd2l0aCAudG9KU09OKCkgbWV0aG9kc1xuICAgIGNvbnN0IHNyY1ZhbHVlID0gdGhpc1trZXldXG5cbiAgICBpZiBkc3RWYWx1ZSA9PT0gbnVsbCB8fCAnb2JqZWN0JyAhPT0gdHlwZW9mIHNyY1ZhbHVlIDo6XG4gICAgICByZXR1cm4gZHN0VmFsdWVcblxuICAgIGNvbnN0IHByZXYgPSBsb29rdXAuZ2V0KHNyY1ZhbHVlKVxuICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJldiA6OlxuICAgICAgcmV0dXJuIHByZXYgLy8gYWxyZWFkeSBzZXJpYWxpemVkIC0tIHJlZmVyZW5jZSBleGlzdGluZyBpdGVtXG5cbiAgICBsZXQgcHJlc2VydmVyID0gZmluZFByZXNlcnZlcihzcmNWYWx1ZSlcbiAgICBpZiB1bmRlZmluZWQgPT09IHByZXNlcnZlciA6OlxuICAgICAgLy8gbm90IGEgXCJzcGVjaWFsXCIgcHJlc2VydmVkIGl0ZW1cbiAgICAgIGlmIGFuT2JqZWN0ICE9PSBzcmNWYWx1ZSA6OlxuICAgICAgICByZXR1cm4gZHN0VmFsdWUgLy8gc28gc2VyaWFsaXplIG5vcm1hbGx5XG4gICAgICAvLyBidXQgaXQgaXMgdGhlIHJvb3QsIHNvIHN0b3JlIGF0IG9pZCAwXG4gICAgICBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIgQFxuICAgICAgICBBcnJheS5pc0FycmF5KGRzdFZhbHVlKSA/IHJvb3RfbGlzdCA6IHJvb3Rfb2JqXG5cbiAgICAvLyByZWdpc3RlciBpZCBmb3Igb2JqZWN0IGFuZCByZXR1cm4gYSBKU09OIHNlcmlhbGl6YWJsZSB2ZXJzaW9uXG4gICAgY29uc3Qgb2lkID0gbG9va3VwLnNpemVcbiAgICBjb25zdCByZWYgPSB7W3Rva2VuXTogb2lkfVxuICAgIGxvb2t1cC5zZXQoc3JjVmFsdWUsIHJlZilcblxuICAgIC8vIHRyYW5zZm9ybSBsaXZlIG9iamVjdCBpbnRvIHByZXNlcnZlZCBmb3JtXG4gICAgY29uc3QgYm9keSA9IHtbdG9rZW5dOiBbcHJlc2VydmVyLmtpbmQsIG9pZF19XG4gICAgY29uc3QgcHJvbWlzZSA9IFByb21pc2VcbiAgICAgIC5yZXNvbHZlIEBcbiAgICAgICAgcHJlc2VydmVyLnByZXNlcnZlXG4gICAgICAgICAgPyBwcmVzZXJ2ZXIucHJlc2VydmUoZHN0VmFsdWUsIHNyY1ZhbHVlLCBjdHgpXG4gICAgICAgICAgOiBkc3RWYWx1ZVxuICAgICAgLnRoZW4gQCBhdHRycyA9PiBPYmplY3QuYXNzaWduKGJvZHksIGF0dHJzKVxuXG4gICAgcHJvbWlzZS5vaWQgPSBvaWRcbiAgICBxdWV1ZS5wdXNoIEAgcHJvbWlzZVxuICAgIHJldHVybiByZWZcblxuIiwiaW1wb3J0IHtkZWNvZGVPYmplY3RUcmVlLCBPYmpNYXB9IGZyb20gJy4vZGVjb2RlJ1xuaW1wb3J0IHtlbmNvZGVPYmplY3RUcmVlLCByb290X29iaiwgcm9vdF9saXN0fSBmcm9tICcuL2VuY29kZSdcblxuZXhwb3J0IGNsYXNzIFJldml0YWxpemF0aW9uIGV4dGVuZHMgRnVuY3Rpb24gOjpcbiAgY29uc3RydWN0b3IoKSA6OlxuICAgIHRocm93IG5ldyBFcnJvcignVXNlIHRoZSBzdGF0aWMgLmNyZWF0ZSgpIGluc3RlYWQgb2YgbmV3JylcblxuICBzdGF0aWMgY3JlYXRlKHRva2VuX3ApIDo6XG4gICAgcmVnaXN0ZXIudG9rZW4gPSB0b2tlbl9wIHx8ICdcXHUwMzlFJyAvLyAnzp4nXG5cbiAgICBjb25zdCBsdXRSZXZpdmU9bmV3IE1hcCgpXG4gICAgY29uc3QgbHV0UHJlc2VydmU9bmV3IE9iak1hcCgpXG5cbiAgICBjb25zdCBzZWxmID0gT2JqZWN0LnNldFByb3RvdHlwZU9mKHJlZ2lzdGVyLCB0aGlzLnByb3RvdHlwZSlcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHNlbGYsIEB7fVxuICAgICAgbG9va3VwUmV2aXZlcjogQHt9IHZhbHVlOiBsdXRSZXZpdmUuZ2V0LmJpbmQobHV0UmV2aXZlKVxuICAgICAgbG9va3VwUHJlc2VydmVyOiBAe30gdmFsdWU6IGx1dFByZXNlcnZlLmdldC5iaW5kKGx1dFByZXNlcnZlKVxuICAgICAgX3NldFJldml2ZXI6IEB7fSB2YWx1ZTogX3NldFJldml2ZXJcblxuXG4gICAgc2VsZi5pbml0UmVnaXN0ZXJ5KHJvb3Rfb2JqLCByb290X2xpc3QpXG4gICAgcmV0dXJuIHNlbGZcblxuICAgIGZ1bmN0aW9uIHJlZ2lzdGVyKCkgOjpcbiAgICAgIHJldHVybiBzZWxmLnJlZ2lzdGVyLmFwcGx5KHNlbGYsIGFyZ3VtZW50cylcblxuICAgIGZ1bmN0aW9uIF9zZXRSZXZpdmVyKHJldml2ZXIsIGtpbmRzLCBtYXRjaGVycykgOjpcbiAgICAgIGx1dFJldml2ZS5zZXQocmV2aXZlci5raW5kLCByZXZpdmVyKVxuICAgICAgcmV0dXJuIEA6XG4gICAgICAgIGFsaWFzKC4uLmtpbmRzKSA6OlxuICAgICAgICAgIGZvciBjb25zdCBlYWNoIG9mIGtpbmRzIDo6XG4gICAgICAgICAgICBpZiBlYWNoIDo6IGx1dFJldml2ZS5zZXQoZWFjaCwgcmV2aXZlcilcbiAgICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgICBtYXRjaCguLi5tYXRjaGVycykgOjpcbiAgICAgICAgICBmb3IgY29uc3QgZWFjaCBvZiBtYXRjaGVycyA6OlxuICAgICAgICAgICAgaWYgbnVsbCAhPSBlYWNoIDo6IGx1dFByZXNlcnZlLnNldChlYWNoLCByZXZpdmVyKVxuICAgICAgICAgIHJldHVybiB0aGlzXG5cblxuICBpbml0UmVnaXN0ZXJ5KHJvb3Rfb2JqLCByb290X2xpc3QpIDo6XG4gICAgdGhpc1xuICAgICAgLnJlZ2lzdGVyIEA6IGtpbmQ6ICd7cm9vdH0nXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OiBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgIC5tYXRjaCBAIHJvb3Rfb2JqXG5cbiAgICB0aGlzXG4gICAgICAucmVnaXN0ZXIgQDoga2luZDogJ1tyb290XSdcbiAgICAgICAgcHJlc2VydmUocm9vdExpc3QpIDo6IHJldHVybiBAe30gXzogcm9vdExpc3Quc2xpY2UoKVxuICAgICAgICBpbml0KGVudHJ5KSA6OiByZXR1cm4gW11cbiAgICAgICAgcmV2aXZlKHJvb3RMaXN0LCBlbnRyeSkgOjpcbiAgICAgICAgICByb290TGlzdC5wdXNoLmFwcGx5KHJvb3RMaXN0LCBlbnRyeS5ib2R5Ll8pXG4gICAgICAubWF0Y2ggQCByb290X2xpc3RcblxuICByZWdpc3RlcihyZXZpdGFsaXplcikgOjpcbiAgICBpZiAna2luZCcgaW4gcmV2aXRhbGl6ZXIgJiYgcmV2aXRhbGl6ZXIucmV2aXZlIDo6XG4gICAgICByZXR1cm4gdGhpcy5yZWdpc3RlclJldml2ZXIocmV2aXRhbGl6ZXIpXG5cbiAgICBsZXQgdGd0XG4gICAgaWYgdW5kZWZpbmVkICE9PSByZXZpdGFsaXplci5wcm90b3R5cGUgOjpcbiAgICAgIHRndCA9IHJldml0YWxpemVyLnByb3RvdHlwZVt0aGlzLnRva2VuXVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0Z3QgOjpcbiAgICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICAgIHRndCA9IHRndC5jYWxsKHJldml0YWxpemVyLnByb3RvdHlwZSwgdGhpcylcbiAgICAgICAgICBpZiBudWxsID09IHRndCA6OiByZXR1cm5cbiAgICAgICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWdpc3RlckNsYXNzKHRndCwgcmV2aXRhbGl6ZXIpXG5cbiAgICB0Z3QgPSByZXZpdGFsaXplclt0aGlzLnRva2VuXVxuICAgIGlmIHVuZGVmaW5lZCAhPT0gdGd0IDo6XG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgIHRndCA9IHRndC5jYWxsKHJldml0YWxpemVyLCB0aGlzKVxuICAgICAgICBpZiBudWxsID09IHRndCA6OiByZXR1cm5cbiAgICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyUHJvdG8odGd0LCByZXZpdGFsaXplci5wcm90b3R5cGUgfHwgcmV2aXRhbGl6ZXIpXG4gICAgICAgICAgLm1hdGNoKHJldml0YWxpemVyKVxuXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgVW5yZWNvZ25pemVkIHJldml0YWxpemF0aW9uIHJlZ2lzdHJhdGlvbmApXG5cbiAgcmVnaXN0ZXJSZXZpdmVyKHJldml2ZXIpIDo6XG4gICAgOjpcbiAgICAgIGNvbnN0IGtpbmQgPSByZXZpdmVyLmtpbmRcbiAgICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Yga2luZCAmJiB0cnVlICE9PSBraW5kICYmIGZhbHNlICE9PSBraW5kICYmIG51bGwgIT09IGtpbmQgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBcImtpbmRcIiBtdXN0IGJlIGEgc3RyaW5nYFxuXG4gICAgICBpZiByZXZpdmVyLmluaXQgJiYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJldml2ZXIuaW5pdCA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wiaW5pdFwiIG11c3QgYmUgYSBmdW5jdGlvbidcblxuICAgICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJldml2ZXIucmV2aXZlIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCAnXCJyZXZpdmVcIiBtdXN0IGJlIGEgZnVuY3Rpb24nXG5cbiAgICAgIGlmIHJldml2ZXIucHJlc2VydmUgJiYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJldml2ZXIucHJlc2VydmUgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcInByZXNlcnZlXCIgbXVzdCBiZSBhIGZ1bmN0aW9uIGlmIHByb3ZpZGVkJ1xuXG4gICAgcmV0dXJuIHRoaXMuX3NldFJldml2ZXIocmV2aXZlcilcblxuICByZWdpc3RlckNsYXNzKGtpbmQsIGtsYXNzKSA6OlxuICAgIHJldHVybiB0aGlzXG4gICAgICAucmVnaXN0ZXJSZXZpdmVyIEA6IGtpbmQsXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OlxuICAgICAgICAgIG9iaiA9IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihvYmosIGtsYXNzLnByb3RvdHlwZSlcbiAgICAgIC5tYXRjaChrbGFzcywga2xhc3MucHJvdG90eXBlKVxuXG4gIHJlZ2lzdGVyUHJvdG8oa2luZCwgcHJvdG8pIDo6XG4gICAgcmV0dXJuIHRoaXNcbiAgICAgIC5yZWdpc3RlclJldml2ZXIgQDoga2luZCxcbiAgICAgICAgcmV2aXZlKG9iaiwgZW50cnkpIDo6XG4gICAgICAgICAgb2JqID0gT2JqZWN0LmFzc2lnbihvYmosIGVudHJ5LmJvZHkpXG4gICAgICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKG9iaiwgcHJvdG8pXG4gICAgICAubWF0Y2gocHJvdG8pXG5cblxuICBkZWNvZGUoanNvbl9zb3VyY2UsIGN0eCkgOjpcbiAgICBpZiBudWxsID09PSBqc29uX3NvdXJjZSA6OlxuICAgICAgcmV0dXJuIG51bGwgLy8gSlNPTi5wYXJzZShudWxsKSByZXR1cm5zIG51bGw7IGtlZXAgd2l0aCBjb252ZW50aW9uXG5cbiAgICBjb25zdCBldnRzID0gZGVjb2RlT2JqZWN0VHJlZSBAIHRoaXMsIGpzb25fc291cmNlLCBjdHhcbiAgICByZXR1cm4gZXZ0cy5kb25lXG5cbiAgZW5jb2RlKGFuT2JqZWN0LCBjdHgpIDo6XG4gICAgY29uc3QgcmVmcyA9IFtdXG4gICAgY29uc3QgcHJvbWlzZSA9IGVuY29kZU9iamVjdFRyZWUgQCB0aGlzLCBhbk9iamVjdCwgY3R4LCAoZXJyLCBlbnRyeSkgPT4gOjpcbiAgICAgIHJlZnNbZW50cnkub2lkXSA9IGVudHJ5LmNvbnRlbnRcblxuICAgIGNvbnN0IGtleSA9IEpTT04uc3RyaW5naWZ5IEAgYCR7dGhpcy50b2tlbn1yZWZzYFxuICAgIHJldHVybiBwcm9taXNlLnRoZW4gQCAoKSA9PlxuICAgICAgYHske2tleX06IFtcXG4gICR7cmVmcy5qb2luKCcsXFxuICAnKX0gXX1cXG5gXG5cbiAgX2JvdW5kRmluZFByZXNlcnZlRm9yT2JqKCkgOjpcbiAgICBjb25zdCBsb29rdXBQcmVzZXJ2ZXIgPSB0aGlzLmxvb2t1cFByZXNlcnZlclxuICAgIHJldHVybiBmdW5jdGlvbihvYmopIDo6XG4gICAgICBsZXQgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyKG9iailcbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJlc2VydmVyIDo6XG4gICAgICAgIHJldHVybiBwcmVzZXJ2ZXJcblxuICAgICAgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyKG9iai5jb25zdHJ1Y3RvcilcbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJlc2VydmVyIDo6XG4gICAgICAgIHJldHVybiBwcmVzZXJ2ZXJcblxuICAgICAgbGV0IHByb3RvID0gb2JqXG4gICAgICB3aGlsZSBudWxsICE9PSBAIHByb3RvID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHByb3RvKSA6OlxuICAgICAgICBsZXQgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyKHByb3RvKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHByZXNlcnZlciA6OlxuICAgICAgICAgIHJldHVybiBwcmVzZXJ2ZXJcblxuXG5leHBvcnQgY2xhc3MgUmV2aXZlck5vdEZvdW5kIGV4dGVuZHMgRXJyb3IgOjpcblxuIiwiaW1wb3J0IHtSZXZpdGFsaXphdGlvbn0gZnJvbSAnLi9yZXZpdGFsaXphdGlvbidcblxuY29uc3QgY3JlYXRlUmVnaXN0cnkgPSBSZXZpdGFsaXphdGlvbi5jcmVhdGUuYmluZChSZXZpdGFsaXphdGlvbilcblxuZXhwb3J0ICogZnJvbSAnLi9yZXZpdGFsaXphdGlvbidcbmV4cG9ydCBkZWZhdWx0IGNyZWF0ZVJlZ2lzdHJ5KClcbmV4cG9ydCBAe31cbiAgY3JlYXRlUmVnaXN0cnlcbiAgY3JlYXRlUmVnaXN0cnkgYXMgY3JlYXRlXG5cbiJdLCJuYW1lcyI6WyJPYmpNYXAiLCJXZWFrTWFwIiwiTWFwIiwiZGVjb2RlT2JqZWN0VHJlZSIsInJldml2ZXIiLCJqc29uX3NvdXJjZSIsImN0eCIsInRva2VuIiwibG9va3VwUmV2aXZlciIsInF1ZXVlIiwiYnlPaWQiLCJldnRzIiwiX3N0YXJ0IiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwicmV2ZXJzZSIsIm1hcCIsImVudHJ5IiwicmV2aXZlIiwib2JqIiwic3RhcnRlZCIsImxzdCIsImxlbmd0aCIsImZpbmlzaGVkIiwiYWxsIiwiZG9uZSIsInJvb3QiLCJnZXQiLCJwcm9taXNlIiwidW5kZWZpbmVkIiwiYW5zIiwicm9vdF9vYmoiLCJPYmplY3QiLCJmcmVlemUiLCJyb290X2xpc3QiLCJlbmNvZGVPYmplY3RUcmVlIiwiYW5PYmplY3QiLCJjYl9hZGRPYmplY3QiLCJsb29rdXBQcmVzZXJ2ZXIiLCJmaW5kUHJlc2VydmVyIiwiX2JvdW5kRmluZFByZXNlcnZlRm9yT2JqIiwibG9va3VwIiwiX2VuY29kZVF1ZXVlIiwicHJvbWlzZXMiLCJ0aXAiLCJzaGlmdCIsIm9pZCIsInB1c2giLCJib2R5IiwiY29udGVudCIsIkpTT04iLCJzdHJpbmdpZnkiLCJfanNvbl9yZXBsYWNlciIsImVyciIsImtleSIsImRzdFZhbHVlIiwic3JjVmFsdWUiLCJwcmV2IiwicHJlc2VydmVyIiwiQXJyYXkiLCJpc0FycmF5Iiwic2l6ZSIsInJlZiIsInNldCIsImtpbmQiLCJwcmVzZXJ2ZSIsImF0dHJzIiwiYXNzaWduIiwiUmV2aXRhbGl6YXRpb24iLCJGdW5jdGlvbiIsIkVycm9yIiwiY3JlYXRlIiwidG9rZW5fcCIsImx1dFJldml2ZSIsImx1dFByZXNlcnZlIiwic2VsZiIsInNldFByb3RvdHlwZU9mIiwicmVnaXN0ZXIiLCJwcm90b3R5cGUiLCJkZWZpbmVQcm9wZXJ0aWVzIiwidmFsdWUiLCJiaW5kIiwiX3NldFJldml2ZXIiLCJpbml0UmVnaXN0ZXJ5IiwiYXBwbHkiLCJhcmd1bWVudHMiLCJraW5kcyIsIm1hdGNoZXJzIiwiZWFjaCIsIm1hdGNoIiwicm9vdExpc3QiLCJfIiwic2xpY2UiLCJyZXZpdGFsaXplciIsInJlZ2lzdGVyUmV2aXZlciIsInRndCIsImNhbGwiLCJyZWdpc3RlckNsYXNzIiwicmVnaXN0ZXJQcm90byIsIlR5cGVFcnJvciIsImluaXQiLCJrbGFzcyIsInByb3RvIiwicmVmcyIsImpvaW4iLCJjb25zdHJ1Y3RvciIsImdldFByb3RvdHlwZU9mIiwiUmV2aXZlck5vdEZvdW5kIiwiY3JlYXRlUmVnaXN0cnkiXSwibWFwcGluZ3MiOiI7Ozs7QUFBTyxNQUFNQSxTQUFTLGdCQUFnQixPQUFPQyxPQUF2QixHQUFpQ0EsT0FBakMsR0FBMkNDLEdBQTFEOztBQUVQLEFBQU8sU0FBU0MsZ0JBQVQsQ0FBMEJDLE9BQTFCLEVBQW1DQyxXQUFuQyxFQUFnREMsR0FBaEQsRUFBcUQ7TUFDdkQsU0FBU0QsV0FBWixFQUEwQjtXQUNqQixJQUFQLENBRHdCO0dBRzFCLE1BQU1FLFFBQU1ILFFBQVFHLEtBQXBCO1FBQ01DLGdCQUFjSixRQUFRSSxhQUE1Qjs7UUFFTUMsUUFBTSxFQUFaO1FBQWdCQyxRQUFNLElBQUlSLEdBQUosRUFBdEI7UUFNTVMsT0FBTyxFQUFiO1FBQ01DLFNBQVNDLFFBQVFDLE9BQVIsR0FBa0JDLElBQWxCLENBQXlCLE1BQ3RDTixNQUFNTyxPQUFOLEdBQWdCQyxHQUFoQixDQUFzQkMsU0FBUztVQUN2QlAsSUFBTixHQUFhQSxJQUFiO1dBQ09PLE1BQU1kLE9BQU4sQ0FBY2UsTUFBZCxDQUFxQkQsTUFBTUUsR0FBM0IsRUFBZ0NGLEtBQWhDLEVBQXVDWixHQUF2QyxDQUFQO0dBRkYsQ0FEYSxDQUFmOztPQUtLZSxPQUFMLEdBQWVULE9BQU9HLElBQVAsQ0FBY08sT0FBT0EsSUFBSUMsTUFBekIsQ0FBZjtPQUNLQyxRQUFMLEdBQWdCWixPQUFPRyxJQUFQLENBQWNPLE9BQzVCVCxRQUFRWSxHQUFSLENBQVlILEdBQVosRUFBaUJQLElBQWpCLENBQXdCTyxPQUFPQSxJQUFJQyxNQUFuQyxDQURjLENBQWhCOztPQUdLRyxJQUFMLEdBQVlmLEtBQUthLFFBQUwsQ0FBY1QsSUFBZCxDQUFxQixNQUFNO1VBQy9CWSxPQUFPakIsTUFBTWtCLEdBQU4sQ0FBVSxDQUFWLENBQWI7UUFDRyxRQUFRRCxJQUFYLEVBQWtCOzs7O1VBRVosRUFBQ1AsR0FBRCxFQUFN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
