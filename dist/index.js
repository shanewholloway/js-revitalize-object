'use strict';

const root_obj = {};
const root_list = [];

function encodeObjectTree(reviver, anObject, ctx, cb_addObject) {
  const token = reviver.token;
  const lookupPreserver = reviver.lookupPreserver;
  const findPreserver = reviver._boundFindPreserveForObj();

  const queue = [],
        lookup = new Map();
  JSON.stringify(anObject, _json_replacer);

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
    }let entry = findPreserver(srcValue);
    if (undefined === entry) {
      // not a "special" preserved item
      if (anObject !== srcValue) {
        return dstValue; // so serialize normally
      }
      // but it is the root, so store at oid 0
      entry = lookupPreserver(Array.isArray(dstValue) ? root_list : root_obj);
    }

    // register id for object and return a JSON serializable version
    const oid = lookup.size;
    const ref = { [token]: oid };
    lookup.set(srcValue, ref

    // transform live object into preserved form
    );const body = { [token]: [entry.kind, oid] };
    const promise = Promise.resolve(entry.preserve ? entry.preserve(dstValue, srcValue, ctx) : dstValue).then(attrs => Object.assign(body, attrs));

    promise.oid = oid;
    queue.push(promise);
    return ref;
  }
}
'use strict';

const ObjMap = 'undefined' !== typeof WeakMap ? WeakMap : Map;

function decodeObjectTree(reviver, json_source, ctx) {
  if (null === json_source) {
    return null; // JSON.parse(null) returns null; keep with convention
  }const token = reviver.token;
  const lookupReviver = reviver.lookupReviver;

  const queue = [],
        byOid = new Map();
  JSON.parse(json_source, _json_create);

  const refs = new ObjMap();
  JSON.parse(json_source, _json_restore);

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
'use strict';

/* The following inlined by package.json build script:

const {decodeObjectTree, ObjMap} = require('./decode')
const {encodeObjectTree, root_obj, root_list} = require('./encode')
*/

class Revitalization extends Function {
  constructor() {
    throw new Error('Use the static .create() instead of new');
  }

  static create(token_p) {
    register.token = token_p || '\u039E'; // 'Ξ'

    const lutRevive = new Map();
    const lutPreserve = new ObjMap();

    const self = Object.setPrototypeOf(register, this.prototype);
    Object.defineProperties(self, { lookupReviver: { value: lutRevive.get.bind(lutRevive) }, lookupPreserver: { value: lutPreserve.get.bind(lutPreserve) }, _setReviver: { value: _setReviver } });

    self.initRegistery(root_obj, root_list);
    return self;

    function register() {
      return self.register.apply(self, arguments);
    }

    function _setReviver(entry, kinds, matchers) {
      lutRevive.set(entry.kind, entry);
      return {
        alias(...kinds) {
          for (const each of kinds) {
            if (each) {
              lutRevive.set(each, entry);
            }
          }
          return this;
        }, match(...matchers) {
          for (const each of matchers) {
            if (null != each) {
              lutPreserve.set(each, entry);
            }
          }
          return this;
        } };
    }
  }

  initRegistery(root_obj, root_list) {
    this.register({ kind: '{root}',
      revive(obj, entry) {
        Object.assign(obj, entry.body);
      } }).match(root_obj);

    this.register({ kind: '[root]',
      preserve(rootList) {
        return { _: rootList.slice() };
      }, init(entry) {
        return [];
      }, revive(rootList, entry) {
        rootList.push.apply(rootList, entry.body._);
      } }).match(root_list);
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

  registerReviver(entry) {
    {
      const kind = entry.kind;
      if ('string' !== typeof kind && true !== kind && false !== kind && null !== kind) {
        throw new TypeError(`"kind" must be a string`);
      }

      if (entry.init && 'function' !== typeof entry.init) {
        throw new TypeError('"init" must be a function');
      }

      if ('function' !== typeof entry.revive) {
        throw new TypeError('"revive" must be a function');
      }

      if (entry.preserve && 'function' !== typeof entry.preserve) {
        throw new TypeError('"preserve" must be a function if provided');
      }
    }

    return this._setReviver(entry);
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
      let entry = lookupPreserver(obj);
      if (undefined !== entry) {
        return entry;
      }

      entry = lookupPreserver(obj.constructor);
      if (undefined !== entry) {
        return entry;
      }

      let proto = obj;
      while (null !== (proto = Object.getPrototypeOf(proto))) {
        let entry = lookupPreserver(proto);
        if (undefined !== entry) {
          return entry;
        }
      }
    };
  }
}

class ReviverNotFound extends Error {}

const createRegistry = Revitalization.create.bind(Revitalization);

module.exports = exports = createRegistry();
Object.assign(exports, { Revitalization, ReviverNotFound,
  createRegistry, create: createRegistry });

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL2NvZGUvZW5jb2RlLmpzIiwiLi4vY29kZS9kZWNvZGUuanMiLCIuLi9jb2RlL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTSxXQUFXLEVBQWpCO0FBQ0EsTUFBTSxZQUFZLEVBQWxCOztBQUVBLFNBQVMsZ0JBQVQsQ0FBMEIsT0FBMUIsRUFBbUMsUUFBbkMsRUFBNkMsR0FBN0MsRUFBa0QsWUFBbEQsRUFBZ0U7QUFDOUQsUUFBTSxRQUFNLFFBQVEsS0FBcEI7QUFDQSxRQUFNLGtCQUFnQixRQUFRLGVBQTlCO0FBQ0EsUUFBTSxnQkFBYyxRQUFRLHdCQUFSLEVBQXBCOztBQUVBLFFBQU0sUUFBTSxFQUFaO0FBQUEsUUFBZ0IsU0FBTyxJQUFJLEdBQUosRUFBdkI7QUFDQSxPQUFLLFNBQUwsQ0FBZSxRQUFmLEVBQXlCLGNBQXpCOztBQUVBLFNBQU8sY0FBUDs7QUFFQSxXQUFTLFlBQVQsR0FBd0I7QUFDdEIsUUFBRyxNQUFNLE1BQU0sTUFBZixFQUF3QjtBQUN0QixhQUFPLFFBQVEsT0FBUixFQUFQO0FBQXdCOztBQUUxQixVQUFNLFdBQVcsRUFBakI7QUFDQSxXQUFNLE1BQU0sTUFBTSxNQUFsQixFQUEyQjtBQUN6QixZQUFNLE1BQU0sTUFBTSxLQUFOLEVBQVo7QUFBQSxZQUEyQixNQUFNLElBQUksR0FBckM7QUFDQSxlQUFTLElBQVQsQ0FDRSxJQUNHLElBREgsQ0FFTSxRQUFRO0FBQ04sWUFBSTtBQUNGLGNBQUksVUFBVSxLQUFLLFNBQUwsQ0FBZSxJQUFmLEVBQXFCLGNBQXJCLENBQWQ7QUFBa0QsU0FEcEQsQ0FFQSxPQUFNLEdBQU4sRUFBWTtBQUNWLGlCQUFPLGFBQWEsR0FBYixDQUFQO0FBQXdCO0FBQzFCLGVBQU8sYUFBZSxJQUFmLEVBQXFCLEVBQUUsR0FBRixFQUFPLElBQVAsRUFBYSxPQUFiLEVBQXJCLENBQVA7QUFBa0QsT0FQMUQsRUFTTSxPQUFPLGFBQWEsR0FBYixDQVRiLENBREY7QUFVZ0M7O0FB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bkIsVUFBSSxRQUFRLGdCQUFnQixHQUFoQixDQUFaO0FBQ0EsVUFBRyxjQUFjLEtBQWpCLEVBQXlCO0FBQ3ZCLGVBQU8sS0FBUDtBQUFZOztBQUVkLGNBQVEsZ0JBQWdCLElBQUksV0FBcEIsQ0FBUjtBQUNBLFVBQUcsY0FBYyxLQUFqQixFQUF5QjtBQUN2QixlQUFPLEtBQVA7QUFBWTs7QUFFZCxVQUFJLFFBQVEsR0FBWjtBQUNBLGFBQU0sVUFBVyxRQUFRLE9BQU8sY0FBUCxDQUFzQixLQUF0QixDQUFuQixDQUFOLEVBQXdEO0FBQ3RELFlBQUksUUFBUSxnQkFBZ0IsS0FBaEIsQ0FBWjtBQUNBLFlBQUcsY0FBYyxLQUFqQixFQUF5QjtBQUN2QixpQkFBTyxLQUFQO0FBQVk7QUFBQTtBQUFBLEtBYmxCO0FBYWtCO0FBNUlnQjs7QUErSXRDLE1BQU0sZUFBTixTQUE4QixLQUE5QixDQUFvQzs7QUFFcEMsTUFBTSxpQkFBaUIsZUFBZSxNQUFmLENBQXNCLElBQXRCLENBQTJCLGNBQTNCLENBQXZCOztBQUVBLE9BQU8sT0FBUCxHQUFpQixVQUFVLGdCQUEzQjtBQUNBLE9BQU8sTUFBUCxDQUFnQixPQUFoQixFQUNJLEVBQUksY0FBSixFQUFvQixlQUFwQjtBQUNJLGdCQURKLEVBQ29CLFFBQVEsY0FENUIsRUFESiIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbImNvbnN0IHJvb3Rfb2JqID0ge31cbmNvbnN0IHJvb3RfbGlzdCA9IFtdXG5cbmZ1bmN0aW9uIGVuY29kZU9iamVjdFRyZWUocmV2aXZlciwgYW5PYmplY3QsIGN0eCwgY2JfYWRkT2JqZWN0KSA6OlxuICBjb25zdCB0b2tlbj1yZXZpdmVyLnRva2VuXG4gIGNvbnN0IGxvb2t1cFByZXNlcnZlcj1yZXZpdmVyLmxvb2t1cFByZXNlcnZlclxuICBjb25zdCBmaW5kUHJlc2VydmVyPXJldml2ZXIuX2JvdW5kRmluZFByZXNlcnZlRm9yT2JqKClcblxuICBjb25zdCBxdWV1ZT1bXSwgbG9va3VwPW5ldyBNYXAoKVxuICBKU09OLnN0cmluZ2lmeShhbk9iamVjdCwgX2pzb25fcmVwbGFjZXIpXG5cbiAgcmV0dXJuIF9lbmNvZGVRdWV1ZSgpXG5cbiAgZnVuY3Rpb24gX2VuY29kZVF1ZXVlKCkgOjpcbiAgICBpZiAwID09PSBxdWV1ZS5sZW5ndGggOjpcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXVxuICAgIHdoaWxlIDAgIT09IHF1ZXVlLmxlbmd0aCA6OlxuICAgICAgY29uc3QgdGlwID0gcXVldWUuc2hpZnQoKSwgb2lkID0gdGlwLm9pZFxuICAgICAgcHJvbWlzZXMucHVzaCBAXG4gICAgICAgIHRpcFxuICAgICAgICAgIC50aGVuIEBcbiAgICAgICAgICAgICAgYm9keSA9PiA6OlxuICAgICAgICAgICAgICAgIHRyeSA6OlxuICAgICAgICAgICAgICAgICAgdmFyIGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShib2R5LCBfanNvbl9yZXBsYWNlcilcbiAgICAgICAgICAgICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgICAgICAgICAgIHJldHVybiBjYl9hZGRPYmplY3QoZXJyKVxuICAgICAgICAgICAgICAgIHJldHVybiBjYl9hZGRPYmplY3QgQCBudWxsLCB7IG9pZCwgYm9keSwgY29udGVudCB9XG5cbiAgICAgICAgICAgICwgZXJyID0+IGNiX2FkZE9iamVjdChlcnIpXG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oX2VuY29kZVF1ZXVlKVxuXG4gIGZ1bmN0aW9uIF9qc29uX3JlcGxhY2VyKGtleSwgZHN0VmFsdWUpIDo6XG4gICAgLy8gc3JjVmFsdWUgIT09IGRzdFZhbHVlIGZvciBvYmplY3RzIHdpdGggLnRvSlNPTigpIG1ldGhvZHNcbiAgICBjb25zdCBzcmNWYWx1ZSA9IHRoaXNba2V5XVxuXG4gICAgaWYgZHN0VmFsdWUgPT09IG51bGwgfHwgJ29iamVjdCcgIT09IHR5cGVvZiBzcmNWYWx1ZSA6OlxuICAgICAgcmV0dXJuIGRzdFZhbHVlXG5cbiAgICBjb25zdCBwcmV2ID0gbG9va3VwLmdldChzcmNWYWx1ZSlcbiAgICBpZiB1bmRlZmluZWQgIT09IHByZXYgOjpcbiAgICAgIHJldHVybiBwcmV2IC8vIGFscmVhZHkgc2VyaWFsaXplZCAtLSByZWZlcmVuY2UgZXhpc3RpbmcgaXRlbVxuXG4gICAgbGV0IGVudHJ5ID0gZmluZFByZXNlcnZlcihzcmNWYWx1ZSlcbiAgICBpZiB1bmRlZmluZWQgPT09IGVudHJ5IDo6XG4gICAgICAvLyBub3QgYSBcInNwZWNpYWxcIiBwcmVzZXJ2ZWQgaXRlbVxuICAgICAgaWYgYW5PYmplY3QgIT09IHNyY1ZhbHVlIDo6XG4gICAgICAgIHJldHVybiBkc3RWYWx1ZSAvLyBzbyBzZXJpYWxpemUgbm9ybWFsbHlcbiAgICAgIC8vIGJ1dCBpdCBpcyB0aGUgcm9vdCwgc28gc3RvcmUgYXQgb2lkIDBcbiAgICAgIGVudHJ5ID0gbG9va3VwUHJlc2VydmVyIEBcbiAgICAgICAgQXJyYXkuaXNBcnJheShkc3RWYWx1ZSkgPyByb290X2xpc3QgOiByb290X29ialxuXG4gICAgLy8gcmVnaXN0ZXIgaWQgZm9yIG9iamVjdCBhbmQgcmV0dXJuIGEgSlNPTiBzZXJpYWxpemFibGUgdmVyc2lvblxuICAgIGNvbnN0IG9pZCA9IGxvb2t1cC5zaXplXG4gICAgY29uc3QgcmVmID0ge1t0b2tlbl06IG9pZH1cbiAgICBsb29rdXAuc2V0KHNyY1ZhbHVlLCByZWYpXG5cbiAgICAvLyB0cmFuc2Zvcm0gbGl2ZSBvYmplY3QgaW50byBwcmVzZXJ2ZWQgZm9ybVxuICAgIGNvbnN0IGJvZHkgPSB7W3Rva2VuXTogW2VudHJ5LmtpbmQsIG9pZF19XG4gICAgY29uc3QgcHJvbWlzZSA9IFByb21pc2VcbiAgICAgIC5yZXNvbHZlIEAgZW50cnkucHJlc2VydmUgPyBlbnRyeS5wcmVzZXJ2ZShkc3RWYWx1ZSwgc3JjVmFsdWUsIGN0eCkgOiBkc3RWYWx1ZVxuICAgICAgLnRoZW4gQCBhdHRycyA9PiBPYmplY3QuYXNzaWduKGJvZHksIGF0dHJzKVxuXG4gICAgcHJvbWlzZS5vaWQgPSBvaWRcbiAgICBxdWV1ZS5wdXNoIEAgcHJvbWlzZVxuICAgIHJldHVybiByZWZcblxuIiwiY29uc3QgT2JqTWFwID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBXZWFrTWFwID8gV2Vha01hcCA6IE1hcFxuXG5mdW5jdGlvbiBkZWNvZGVPYmplY3RUcmVlKHJldml2ZXIsIGpzb25fc291cmNlLCBjdHgpIDo6XG4gIGlmIG51bGwgPT09IGpzb25fc291cmNlIDo6XG4gICAgcmV0dXJuIG51bGwgLy8gSlNPTi5wYXJzZShudWxsKSByZXR1cm5zIG51bGw7IGtlZXAgd2l0aCBjb252ZW50aW9uXG5cbiAgY29uc3QgdG9rZW49cmV2aXZlci50b2tlblxuICBjb25zdCBsb29rdXBSZXZpdmVyPXJldml2ZXIubG9va3VwUmV2aXZlclxuXG4gIGNvbnN0IHF1ZXVlPVtdLCBieU9pZD1uZXcgTWFwKClcbiAgSlNPTi5wYXJzZShqc29uX3NvdXJjZSwgX2pzb25fY3JlYXRlKVxuXG4gIGNvbnN0IHJlZnM9bmV3IE9iak1hcCgpXG4gIEpTT04ucGFyc2UoanNvbl9zb3VyY2UsIF9qc29uX3Jlc3RvcmUpXG5cbiAgY29uc3QgZXZ0cyA9IHt9XG4gIGNvbnN0IF9zdGFydCA9IFByb21pc2UucmVzb2x2ZSgpLnRoZW4gQCAoKSA9PlxuICAgIHF1ZXVlLnJldmVyc2UoKS5tYXAgQCBlbnRyeSA9PiA6OlxuICAgICAgZW50cnkuZXZ0cyA9IGV2dHNcbiAgICAgIHJldHVybiBlbnRyeS5yZXZpdmVyLnJldml2ZShlbnRyeS5vYmosIGVudHJ5LCBjdHgpXG5cbiAgZXZ0cy5zdGFydGVkID0gX3N0YXJ0LnRoZW4gQCBsc3QgPT4gbHN0Lmxlbmd0aFxuICBldnRzLmZpbmlzaGVkID0gX3N0YXJ0LnRoZW4gQCBsc3QgPT5cbiAgICBQcm9taXNlLmFsbChsc3QpLnRoZW4gQCBsc3QgPT4gbHN0Lmxlbmd0aFxuXG4gIGV2dHMuZG9uZSA9IGV2dHMuZmluaXNoZWQudGhlbiBAICgpID0+IDo6XG4gICAgY29uc3Qgcm9vdCA9IGJ5T2lkLmdldCgwKVxuICAgIGlmIG51bGwgPT0gcm9vdCA6OiByZXR1cm5cblxuICAgIGNvbnN0IHtvYmosIHByb21pc2V9ID0gcm9vdFxuICAgIHJldHVybiB1bmRlZmluZWQgPT09IHByb21pc2UgPyBvYmpcbiAgICAgIDogcHJvbWlzZS50aGVuIEAgYW5zID0+XG4gICAgICAgICAgYW5zICE9PSB1bmRlZmluZWQgPyBhbnMgOiBvYmpcblxuICByZXR1cm4gZXZ0c1xuXG5cbiAgZnVuY3Rpb24gX2pzb25fY3JlYXRlKGtleSwgdmFsdWUpIDo6XG4gICAgaWYgdG9rZW4gPT09IGtleSA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgZWxzZSBpZiBBcnJheS5pc0FycmF5KHZhbHVlKSA6OlxuICAgICAgICBkZWxldGUgdGhpc1t0b2tlbl1cblxuICAgICAgICBjb25zdCBba2luZCwgb2lkXSA9IHZhbHVlXG4gICAgICAgIGNvbnN0IHJldml2ZXIgPSBsb29rdXBSZXZpdmVyKGtpbmQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmV2aXZlciA6OlxuICAgICAgICAgIHRocm93IG5ldyBSZXZpdmVyTm90Rm91bmQoYE1pc3NpbmcgcmVnaXN0ZXJlZCByZXZpdmVyIGZvciBraW5kIFwiJHtraW5kfVwiYClcblxuICAgICAgICBjb25zdCBlbnRyeSA9IEA6IGtpbmQsIG9pZCwgcmV2aXZlciwgYm9keTogdGhpc1xuXG4gICAgICAgIGVudHJ5Lm9iaiA9IHJldml2ZXIuaW5pdFxuICAgICAgICAgID8gcmV2aXZlci5pbml0KGVudHJ5LCBjdHgpXG4gICAgICAgICAgOiBPYmplY3QuY3JlYXRlKG51bGwpXG5cbiAgICAgICAgYnlPaWQuc2V0KG9pZCwgZW50cnkpXG4gICAgICAgIHF1ZXVlLnB1c2goZW50cnkpXG4gICAgICByZXR1cm5cblxuICAgIHJldHVybiB2YWx1ZVxuXG5cbiAgZnVuY3Rpb24gX2pzb25fcmVzdG9yZShrZXksIHZhbHVlKSA6OlxuICAgIGlmIHRva2VuID09PSBrZXkgOjpcbiAgICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgcmVmcy5zZXQgQCB0aGlzLCBieU9pZC5nZXQodmFsdWUpLm9ialxuXG4gICAgICBlbHNlIGlmIEFycmF5LmlzQXJyYXkodmFsdWUpIDo6XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gYnlPaWQuZ2V0KHZhbHVlWzFdKVxuICAgICAgICBlbnRyeS5ib2R5ID0gdGhpc1xuICAgICAgICByZWZzLnNldCBAIHRoaXMsIGVudHJ5Lm9ialxuICAgICAgcmV0dXJuXG5cbiAgICBlbHNlIGlmIG51bGwgPT09IHZhbHVlIHx8ICdvYmplY3QnICE9PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgY29uc3QgYW5zID0gcmVmcy5nZXQodmFsdWUpXG4gICAgcmV0dXJuIGFucyAhPT0gdW5kZWZpbmVkID8gYW5zIDogdmFsdWVcblxuIiwiLyogVGhlIGZvbGxvd2luZyBpbmxpbmVkIGJ5IHBhY2thZ2UuanNvbiBidWlsZCBzY3JpcHQ6XG5cbmNvbnN0IHtkZWNvZGVPYmplY3RUcmVlLCBPYmpNYXB9ID0gcmVxdWlyZSgnLi9kZWNvZGUnKVxuY29uc3Qge2VuY29kZU9iamVjdFRyZWUsIHJvb3Rfb2JqLCByb290X2xpc3R9ID0gcmVxdWlyZSgnLi9lbmNvZGUnKVxuKi9cblxuY2xhc3MgUmV2aXRhbGl6YXRpb24gZXh0ZW5kcyBGdW5jdGlvbiA6OlxuICBjb25zdHJ1Y3RvcigpIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVc2UgdGhlIHN0YXRpYyAuY3JlYXRlKCkgaW5zdGVhZCBvZiBuZXcnKVxuXG4gIHN0YXRpYyBjcmVhdGUodG9rZW5fcCkgOjpcbiAgICByZWdpc3Rlci50b2tlbiA9IHRva2VuX3AgfHwgJ1xcdTAzOUUnIC8vICfOnidcblxuICAgIGNvbnN0IGx1dFJldml2ZT1uZXcgTWFwKClcbiAgICBjb25zdCBsdXRQcmVzZXJ2ZT1uZXcgT2JqTWFwKClcblxuICAgIGNvbnN0IHNlbGYgPSBPYmplY3Quc2V0UHJvdG90eXBlT2YocmVnaXN0ZXIsIHRoaXMucHJvdG90eXBlKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgc2VsZixcbiAgICAgIEB7fSBsb29rdXBSZXZpdmVyOiBAe30gdmFsdWU6IGx1dFJldml2ZS5nZXQuYmluZChsdXRSZXZpdmUpXG4gICAgICAgICwgbG9va3VwUHJlc2VydmVyOiBAe30gdmFsdWU6IGx1dFByZXNlcnZlLmdldC5iaW5kKGx1dFByZXNlcnZlKVxuICAgICAgICAsIF9zZXRSZXZpdmVyOiBAe30gdmFsdWU6IF9zZXRSZXZpdmVyXG5cblxuICAgIHNlbGYuaW5pdFJlZ2lzdGVyeShyb290X29iaiwgcm9vdF9saXN0KVxuICAgIHJldHVybiBzZWxmXG5cbiAgICBmdW5jdGlvbiByZWdpc3RlcigpIDo6XG4gICAgICByZXR1cm4gc2VsZi5yZWdpc3Rlci5hcHBseShzZWxmLCBhcmd1bWVudHMpXG5cbiAgICBmdW5jdGlvbiBfc2V0UmV2aXZlcihlbnRyeSwga2luZHMsIG1hdGNoZXJzKSA6OlxuICAgICAgbHV0UmV2aXZlLnNldChlbnRyeS5raW5kLCBlbnRyeSlcbiAgICAgIHJldHVybiA6OlxuICAgICAgICAgIGFsaWFzKC4uLmtpbmRzKSA6OlxuICAgICAgICAgICAgZm9yIGNvbnN0IGVhY2ggb2Yga2luZHMgOjpcbiAgICAgICAgICAgICAgaWYgZWFjaCA6OiBsdXRSZXZpdmUuc2V0KGVhY2gsIGVudHJ5KVxuICAgICAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgICAgLCBtYXRjaCguLi5tYXRjaGVycykgOjpcbiAgICAgICAgICAgIGZvciBjb25zdCBlYWNoIG9mIG1hdGNoZXJzIDo6XG4gICAgICAgICAgICAgIGlmIG51bGwgIT0gZWFjaCA6OiBsdXRQcmVzZXJ2ZS5zZXQoZWFjaCwgZW50cnkpXG4gICAgICAgICAgICByZXR1cm4gdGhpc1xuXG5cbiAgaW5pdFJlZ2lzdGVyeShyb290X29iaiwgcm9vdF9saXN0KSA6OlxuICAgIHRoaXNcbiAgICAgIC5yZWdpc3RlciBAOiBraW5kOiAne3Jvb3R9J1xuICAgICAgICAsIHJldml2ZShvYmosIGVudHJ5KSA6OiBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgIC5tYXRjaCBAIHJvb3Rfb2JqXG5cbiAgICB0aGlzXG4gICAgICAucmVnaXN0ZXIgQDoga2luZDogJ1tyb290XSdcbiAgICAgICAgLCBwcmVzZXJ2ZShyb290TGlzdCkgOjogcmV0dXJuIEB7fSBfOiByb290TGlzdC5zbGljZSgpXG4gICAgICAgICwgaW5pdChlbnRyeSkgOjogcmV0dXJuIFtdXG4gICAgICAgICwgcmV2aXZlKHJvb3RMaXN0LCBlbnRyeSkgOjpcbiAgICAgICAgICAgIHJvb3RMaXN0LnB1c2guYXBwbHkocm9vdExpc3QsIGVudHJ5LmJvZHkuXylcbiAgICAgIC5tYXRjaCBAIHJvb3RfbGlzdFxuXG4gIHJlZ2lzdGVyKHJldml0YWxpemVyKSA6OlxuICAgIGlmICdraW5kJyBpbiByZXZpdGFsaXplciAmJiByZXZpdGFsaXplci5yZXZpdmUgOjpcbiAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyUmV2aXZlcihyZXZpdGFsaXplcilcblxuICAgIGxldCB0Z3RcbiAgICBpZiB1bmRlZmluZWQgIT09IHJldml0YWxpemVyLnByb3RvdHlwZSA6OlxuICAgICAgdGd0ID0gcmV2aXRhbGl6ZXIucHJvdG90eXBlW3RoaXMudG9rZW5dXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRndCA6OlxuICAgICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgICAgdGd0ID0gdGd0LmNhbGwocmV2aXRhbGl6ZXIucHJvdG90eXBlLCB0aGlzKVxuICAgICAgICAgIGlmIG51bGwgPT0gdGd0IDo6IHJldHVyblxuICAgICAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyQ2xhc3ModGd0LCByZXZpdGFsaXplcilcblxuICAgIHRndCA9IHJldml0YWxpemVyW3RoaXMudG9rZW5dXG4gICAgaWYgdW5kZWZpbmVkICE9PSB0Z3QgOjpcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgdGd0ID0gdGd0LmNhbGwocmV2aXRhbGl6ZXIsIHRoaXMpXG4gICAgICAgIGlmIG51bGwgPT0gdGd0IDo6IHJldHVyblxuICAgICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJQcm90byh0Z3QsIHJldml0YWxpemVyLnByb3RvdHlwZSB8fCByZXZpdGFsaXplcilcbiAgICAgICAgICAubWF0Y2gocmV2aXRhbGl6ZXIpXG5cbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBVbnJlY29nbml6ZWQgcmV2aXRhbGl6YXRpb24gcmVnaXN0cmF0aW9uYClcblxuICByZWdpc3RlclJldml2ZXIoZW50cnkpIDo6XG4gICAgOjpcbiAgICAgIGNvbnN0IGtpbmQgPSBlbnRyeS5raW5kXG4gICAgICBpZiAnc3RyaW5nJyAhPT0gdHlwZW9mIGtpbmQgJiYgdHJ1ZSAhPT0ga2luZCAmJiBmYWxzZSAhPT0ga2luZCAmJiBudWxsICE9PSBraW5kIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgXCJraW5kXCIgbXVzdCBiZSBhIHN0cmluZ2BcblxuICAgICAgaWYgZW50cnkuaW5pdCAmJiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgZW50cnkuaW5pdCA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wiaW5pdFwiIG11c3QgYmUgYSBmdW5jdGlvbidcblxuICAgICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGVudHJ5LnJldml2ZSA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wicmV2aXZlXCIgbXVzdCBiZSBhIGZ1bmN0aW9uJ1xuXG4gICAgICBpZiBlbnRyeS5wcmVzZXJ2ZSAmJiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgZW50cnkucHJlc2VydmUgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcInByZXNlcnZlXCIgbXVzdCBiZSBhIGZ1bmN0aW9uIGlmIHByb3ZpZGVkJ1xuXG4gICAgcmV0dXJuIHRoaXMuX3NldFJldml2ZXIoZW50cnkpXG5cbiAgcmVnaXN0ZXJDbGFzcyhraW5kLCBrbGFzcykgOjpcbiAgICByZXR1cm4gdGhpc1xuICAgICAgLnJlZ2lzdGVyUmV2aXZlciBAOiBraW5kLFxuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjpcbiAgICAgICAgICBvYmogPSBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2Yob2JqLCBrbGFzcy5wcm90b3R5cGUpXG4gICAgICAubWF0Y2goa2xhc3MsIGtsYXNzLnByb3RvdHlwZSlcblxuICByZWdpc3RlclByb3RvKGtpbmQsIHByb3RvKSA6OlxuICAgIHJldHVybiB0aGlzXG4gICAgICAucmVnaXN0ZXJSZXZpdmVyIEA6IGtpbmQsXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OlxuICAgICAgICAgIG9iaiA9IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihvYmosIHByb3RvKVxuICAgICAgLm1hdGNoKHByb3RvKVxuXG5cbiAgZGVjb2RlKGpzb25fc291cmNlLCBjdHgpIDo6XG4gICAgaWYgbnVsbCA9PT0ganNvbl9zb3VyY2UgOjpcbiAgICAgIHJldHVybiBudWxsIC8vIEpTT04ucGFyc2UobnVsbCkgcmV0dXJucyBudWxsOyBrZWVwIHdpdGggY29udmVudGlvblxuXG4gICAgY29uc3QgZXZ0cyA9IGRlY29kZU9iamVjdFRyZWUgQCB0aGlzLCBqc29uX3NvdXJjZSwgY3R4XG4gICAgcmV0dXJuIGV2dHMuZG9uZVxuXG4gIGVuY29kZShhbk9iamVjdCwgY3R4KSA6OlxuICAgIGNvbnN0IHJlZnMgPSBbXVxuICAgIGNvbnN0IHByb21pc2UgPSBlbmNvZGVPYmplY3RUcmVlIEAgdGhpcywgYW5PYmplY3QsIGN0eCwgKGVyciwgZW50cnkpID0+IDo6XG4gICAgICByZWZzW2VudHJ5Lm9pZF0gPSBlbnRyeS5jb250ZW50XG5cbiAgICBjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeSBAIGAke3RoaXMudG9rZW59cmVmc2BcbiAgICByZXR1cm4gcHJvbWlzZS50aGVuIEAgKCkgPT5cbiAgICAgIGB7JHtrZXl9OiBbXFxuICAke3JlZnMuam9pbignLFxcbiAgJyl9IF19XFxuYFxuXG4gIF9ib3VuZEZpbmRQcmVzZXJ2ZUZvck9iaigpIDo6XG4gICAgY29uc3QgbG9va3VwUHJlc2VydmVyID0gdGhpcy5sb29rdXBQcmVzZXJ2ZXJcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSA6OlxuICAgICAgbGV0IGVudHJ5ID0gbG9va3VwUHJlc2VydmVyKG9iailcbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gZW50cnkgOjpcbiAgICAgICAgcmV0dXJuIGVudHJ5XG5cbiAgICAgIGVudHJ5ID0gbG9va3VwUHJlc2VydmVyKG9iai5jb25zdHJ1Y3RvcilcbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gZW50cnkgOjpcbiAgICAgICAgcmV0dXJuIGVudHJ5XG5cbiAgICAgIGxldCBwcm90byA9IG9ialxuICAgICAgd2hpbGUgbnVsbCAhPT0gQCBwcm90byA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihwcm90bykgOjpcbiAgICAgICAgbGV0IGVudHJ5ID0gbG9va3VwUHJlc2VydmVyKHByb3RvKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IGVudHJ5IDo6XG4gICAgICAgICAgcmV0dXJuIGVudHJ5XG5cblxuY2xhc3MgUmV2aXZlck5vdEZvdW5kIGV4dGVuZHMgRXJyb3IgOjpcblxuY29uc3QgY3JlYXRlUmVnaXN0cnkgPSBSZXZpdGFsaXphdGlvbi5jcmVhdGUuYmluZChSZXZpdGFsaXphdGlvbilcblxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzID0gY3JlYXRlUmVnaXN0cnkoKVxuT2JqZWN0LmFzc2lnbiBAIGV4cG9ydHNcbiAgLCBAe30gUmV2aXRhbGl6YXRpb24sIFJldml2ZXJOb3RGb3VuZFxuICAgICAgLCBjcmVhdGVSZWdpc3RyeSwgY3JlYXRlOiBjcmVhdGVSZWdpc3RyeVxuIl19