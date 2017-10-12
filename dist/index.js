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

  initRegistery(root_obj, root_list) {
    this.register({ kind: '{root}',
      revive(obj, entry) {
        Object.assign(obj, entry.body);
      } }).match(root_obj);

    this.register({ kind: '[root]',
      preserve(rootList) {
        return { _: rootList.slice() };
      },
      init(entry) {
        return [];
      },
      revive(rootList, entry) {
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

class ReviverNotFound extends Error {}

const createRegistry = Revitalization.create.bind(Revitalization);

module.exports = exports = createRegistry();
Object.assign(exports, {
  Revitalization, ReviverNotFound,
  createRegistry, create: createRegistry });

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL2NvZGUvZW5jb2RlLmpzIiwiLi4vY29kZS9kZWNvZGUuanMiLCIuLi9jb2RlL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTSxXQUFXLEVBQWpCO0FBQ0EsTUFBTSxZQUFZLEVBQWxCOztBQUVBLFNBQVMsZ0JBQVQsQ0FBMEIsT0FBMUIsRUFBbUMsUUFBbkMsRUFBNkMsR0FBN0MsRUFBa0QsWUFBbEQsRUFBZ0U7QUFDOUQsUUFBTSxRQUFNLFFBQVEsS0FBcEI7QUFDQSxRQUFNLGtCQUFnQixRQUFRLGVBQTlCO0FBQ0EsUUFBTSxnQkFBYyxRQUFRLHdCQUFSLEVBQXBCOztBQUVBLFFBQU0sUUFBTSxFQUFaO0FBQUEsUUFBZ0IsU0FBTyxJQUFJLEdBQUosRUFBdkI7QUFDQSxPQUFLLFNBQUwsQ0FBZSxRQUFmLEVBQXlCLGNBQXpCOztBQUVBLFNBQU8sY0FBUDs7QUFFQSxXQUFTLFlBQVQsR0FBd0I7QUFDdEIsUUFBRyxNQUFNLE1BQU0sTUFBZixFQUF3QjtBQUN0QixhQUFPLFFBQVEsT0FBUixFQUFQO0FBQXdCOztBQUUxQixVQUFNLFdBQVcsRUFBakI7QUFDQSxXQUFNLE1BQU0sTUFBTSxNQUFsQixFQUEyQjtBQUN6QixZQUFNLE1BQU0sTUFBTSxLQUFOLEVBQVo7QUFBQSxZQUEyQixNQUFNLElBQUksR0FBckM7QUFDQSxlQUFTLElBQVQsQ0FDRSxJQUNHLElBREgsQ0FFTSxRQUFRO0FBQ04sWUFBSTtBQUNGLGNBQUksVUFBVSxLQUFLLFNBQUwsQ0FBZSxJQUFmLEVBQXFCLGNBQXJCLENBQWQ7QUFBa0QsU0FEcEQsQ0FFQSxPQUFNLEdBQU4sRUFBWTtBQUNWLGlCQUFPLGFBQWEsR0FBYixDQUFQO0FBQXdCO0FBQzFCLGVBQU8sYUFBZSxJQUFmLEVBQXFCLEVBQUUsR0FBRixFQUFPLElBQVAsRUFBYSxPQUFiLEVBQXJCLENBQVA7QUFBa0QsT0FQMUQsRUFTTSxPQUFPLGFBQWEsR0FBYixDQVRiLENBREY7QUFVZ0M7O0FB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QUFjO0FBQ25CLFVBQUksWUFBWSxnQkFBZ0IsR0FBaEIsQ0FBaEI7QUFDQSxVQUFHLGNBQWMsU0FBakIsRUFBNkI7QUFDM0IsZUFBTyxTQUFQO0FBQWdCOztBQUVsQixrQkFBWSxnQkFBZ0IsSUFBSSxXQUFwQixDQUFaO0FBQ0EsVUFBRyxjQUFjLFNBQWpCLEVBQTZCO0FBQzNCLGVBQU8sU0FBUDtBQUFnQjs7QUFFbEIsVUFBSSxRQUFRLEdBQVo7QUFDQSxhQUFNLFVBQVcsUUFBUSxPQUFPLGNBQVAsQ0FBc0IsS0FBdEIsQ0FBbkIsQ0FBTixFQUF3RDtBQUN0RCxZQUFJLFlBQVksZ0JBQWdCLEtBQWhCLENBQWhCO0FBQ0EsWUFBRyxjQUFjLFNBQWpCLEVBQTZCO0FBQzNCLGlCQUFPLFNBQVA7QUFBZ0I7QUFBQTtBQUFBLEtBYnRCO0FBYXNCO0FBNUlZOztBQStJdEMsTUFBTSxlQUFOLFNBQThCLEtBQTlCLENBQW9DOztBQUVwQyxNQUFNLGlCQUFpQixlQUFlLE1BQWYsQ0FBc0IsSUFBdEIsQ0FBMkIsY0FBM0IsQ0FBdkI7O0FBRUEsT0FBTyxPQUFQLEdBQWlCLFVBQVUsZ0JBQTNCO0FBQ0EsT0FBTyxNQUFQLENBQWdCLE9BQWhCLEVBQXlCO0FBQ3ZCLGdCQUR1QixFQUNQLGVBRE87QUFFdkIsZ0JBRnVCLEVBRVAsUUFBUSxjQUZELEVBQXpCIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3Qgcm9vdF9vYmogPSB7fVxuY29uc3Qgcm9vdF9saXN0ID0gW11cblxuZnVuY3Rpb24gZW5jb2RlT2JqZWN0VHJlZShyZXZpdmVyLCBhbk9iamVjdCwgY3R4LCBjYl9hZGRPYmplY3QpIDo6XG4gIGNvbnN0IHRva2VuPXJldml2ZXIudG9rZW5cbiAgY29uc3QgbG9va3VwUHJlc2VydmVyPXJldml2ZXIubG9va3VwUHJlc2VydmVyXG4gIGNvbnN0IGZpbmRQcmVzZXJ2ZXI9cmV2aXZlci5fYm91bmRGaW5kUHJlc2VydmVGb3JPYmooKVxuXG4gIGNvbnN0IHF1ZXVlPVtdLCBsb29rdXA9bmV3IE1hcCgpXG4gIEpTT04uc3RyaW5naWZ5KGFuT2JqZWN0LCBfanNvbl9yZXBsYWNlcilcblxuICByZXR1cm4gX2VuY29kZVF1ZXVlKClcblxuICBmdW5jdGlvbiBfZW5jb2RlUXVldWUoKSA6OlxuICAgIGlmIDAgPT09IHF1ZXVlLmxlbmd0aCA6OlxuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG5cbiAgICBjb25zdCBwcm9taXNlcyA9IFtdXG4gICAgd2hpbGUgMCAhPT0gcXVldWUubGVuZ3RoIDo6XG4gICAgICBjb25zdCB0aXAgPSBxdWV1ZS5zaGlmdCgpLCBvaWQgPSB0aXAub2lkXG4gICAgICBwcm9taXNlcy5wdXNoIEBcbiAgICAgICAgdGlwXG4gICAgICAgICAgLnRoZW4gQFxuICAgICAgICAgICAgICBib2R5ID0+IDo6XG4gICAgICAgICAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KGJvZHksIF9qc29uX3JlcGxhY2VyKVxuICAgICAgICAgICAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiX2FkZE9iamVjdChlcnIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiX2FkZE9iamVjdCBAIG51bGwsIHsgb2lkLCBib2R5LCBjb250ZW50IH1cblxuICAgICAgICAgICAgICBlcnIgPT4gY2JfYWRkT2JqZWN0KGVycilcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihfZW5jb2RlUXVldWUpXG5cbiAgZnVuY3Rpb24gX2pzb25fcmVwbGFjZXIoa2V5LCBkc3RWYWx1ZSkgOjpcbiAgICAvLyBzcmNWYWx1ZSAhPT0gZHN0VmFsdWUgZm9yIG9iamVjdHMgd2l0aCAudG9KU09OKCkgbWV0aG9kc1xuICAgIGNvbnN0IHNyY1ZhbHVlID0gdGhpc1trZXldXG5cbiAgICBpZiBkc3RWYWx1ZSA9PT0gbnVsbCB8fCAnb2JqZWN0JyAhPT0gdHlwZW9mIHNyY1ZhbHVlIDo6XG4gICAgICByZXR1cm4gZHN0VmFsdWVcblxuICAgIGNvbnN0IHByZXYgPSBsb29rdXAuZ2V0KHNyY1ZhbHVlKVxuICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJldiA6OlxuICAgICAgcmV0dXJuIHByZXYgLy8gYWxyZWFkeSBzZXJpYWxpemVkIC0tIHJlZmVyZW5jZSBleGlzdGluZyBpdGVtXG5cbiAgICBsZXQgcHJlc2VydmVyID0gZmluZFByZXNlcnZlcihzcmNWYWx1ZSlcbiAgICBpZiB1bmRlZmluZWQgPT09IHByZXNlcnZlciA6OlxuICAgICAgLy8gbm90IGEgXCJzcGVjaWFsXCIgcHJlc2VydmVkIGl0ZW1cbiAgICAgIGlmIGFuT2JqZWN0ICE9PSBzcmNWYWx1ZSA6OlxuICAgICAgICByZXR1cm4gZHN0VmFsdWUgLy8gc28gc2VyaWFsaXplIG5vcm1hbGx5XG4gICAgICAvLyBidXQgaXQgaXMgdGhlIHJvb3QsIHNvIHN0b3JlIGF0IG9pZCAwXG4gICAgICBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIgQFxuICAgICAgICBBcnJheS5pc0FycmF5KGRzdFZhbHVlKSA/IHJvb3RfbGlzdCA6IHJvb3Rfb2JqXG5cbiAgICAvLyByZWdpc3RlciBpZCBmb3Igb2JqZWN0IGFuZCByZXR1cm4gYSBKU09OIHNlcmlhbGl6YWJsZSB2ZXJzaW9uXG4gICAgY29uc3Qgb2lkID0gbG9va3VwLnNpemVcbiAgICBjb25zdCByZWYgPSB7W3Rva2VuXTogb2lkfVxuICAgIGxvb2t1cC5zZXQoc3JjVmFsdWUsIHJlZilcblxuICAgIC8vIHRyYW5zZm9ybSBsaXZlIG9iamVjdCBpbnRvIHByZXNlcnZlZCBmb3JtXG4gICAgY29uc3QgYm9keSA9IHtbdG9rZW5dOiBbcHJlc2VydmVyLmtpbmQsIG9pZF19XG4gICAgY29uc3QgcHJvbWlzZSA9IFByb21pc2VcbiAgICAgIC5yZXNvbHZlIEBcbiAgICAgICAgcHJlc2VydmVyLnByZXNlcnZlXG4gICAgICAgICAgPyBwcmVzZXJ2ZXIucHJlc2VydmUoZHN0VmFsdWUsIHNyY1ZhbHVlLCBjdHgpXG4gICAgICAgICAgOiBkc3RWYWx1ZVxuICAgICAgLnRoZW4gQCBhdHRycyA9PiBPYmplY3QuYXNzaWduKGJvZHksIGF0dHJzKVxuXG4gICAgcHJvbWlzZS5vaWQgPSBvaWRcbiAgICBxdWV1ZS5wdXNoIEAgcHJvbWlzZVxuICAgIHJldHVybiByZWZcblxuIiwiY29uc3QgT2JqTWFwID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBXZWFrTWFwID8gV2Vha01hcCA6IE1hcFxuXG5mdW5jdGlvbiBkZWNvZGVPYmplY3RUcmVlKHJldml2ZXIsIGpzb25fc291cmNlLCBjdHgpIDo6XG4gIGlmIG51bGwgPT09IGpzb25fc291cmNlIDo6XG4gICAgcmV0dXJuIG51bGwgLy8gSlNPTi5wYXJzZShudWxsKSByZXR1cm5zIG51bGw7IGtlZXAgd2l0aCBjb252ZW50aW9uXG5cbiAgY29uc3QgdG9rZW49cmV2aXZlci50b2tlblxuICBjb25zdCBsb29rdXBSZXZpdmVyPXJldml2ZXIubG9va3VwUmV2aXZlclxuXG4gIGNvbnN0IHF1ZXVlPVtdLCBieU9pZD1uZXcgTWFwKClcbiAgSlNPTi5wYXJzZShqc29uX3NvdXJjZSwgX2pzb25fY3JlYXRlKVxuXG4gIGNvbnN0IHJlZnM9bmV3IE9iak1hcCgpXG4gIEpTT04ucGFyc2UoanNvbl9zb3VyY2UsIF9qc29uX3Jlc3RvcmUpXG5cbiAgY29uc3QgZXZ0cyA9IHt9XG4gIGNvbnN0IF9zdGFydCA9IFByb21pc2UucmVzb2x2ZSgpLnRoZW4gQCAoKSA9PlxuICAgIHF1ZXVlLnJldmVyc2UoKS5tYXAgQCBlbnRyeSA9PiA6OlxuICAgICAgZW50cnkuZXZ0cyA9IGV2dHNcbiAgICAgIHJldHVybiBlbnRyeS5yZXZpdmVyLnJldml2ZShlbnRyeS5vYmosIGVudHJ5LCBjdHgpXG5cbiAgZXZ0cy5zdGFydGVkID0gX3N0YXJ0LnRoZW4gQCBsc3QgPT4gbHN0Lmxlbmd0aFxuICBldnRzLmZpbmlzaGVkID0gX3N0YXJ0LnRoZW4gQCBsc3QgPT5cbiAgICBQcm9taXNlLmFsbChsc3QpLnRoZW4gQCBsc3QgPT4gbHN0Lmxlbmd0aFxuXG4gIGV2dHMuZG9uZSA9IGV2dHMuZmluaXNoZWQudGhlbiBAICgpID0+IDo6XG4gICAgY29uc3Qgcm9vdCA9IGJ5T2lkLmdldCgwKVxuICAgIGlmIG51bGwgPT0gcm9vdCA6OiByZXR1cm5cblxuICAgIGNvbnN0IHtvYmosIHByb21pc2V9ID0gcm9vdFxuICAgIHJldHVybiB1bmRlZmluZWQgPT09IHByb21pc2UgPyBvYmpcbiAgICAgIDogcHJvbWlzZS50aGVuIEAgYW5zID0+XG4gICAgICAgICAgYW5zICE9PSB1bmRlZmluZWQgPyBhbnMgOiBvYmpcblxuICByZXR1cm4gZXZ0c1xuXG5cbiAgZnVuY3Rpb24gX2pzb25fY3JlYXRlKGtleSwgdmFsdWUpIDo6XG4gICAgaWYgdG9rZW4gPT09IGtleSA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgZWxzZSBpZiBBcnJheS5pc0FycmF5KHZhbHVlKSA6OlxuICAgICAgICBkZWxldGUgdGhpc1t0b2tlbl1cblxuICAgICAgICBjb25zdCBba2luZCwgb2lkXSA9IHZhbHVlXG4gICAgICAgIGNvbnN0IHJldml2ZXIgPSBsb29rdXBSZXZpdmVyKGtpbmQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmV2aXZlciA6OlxuICAgICAgICAgIHRocm93IG5ldyBSZXZpdmVyTm90Rm91bmQoYE1pc3NpbmcgcmVnaXN0ZXJlZCByZXZpdmVyIGZvciBraW5kIFwiJHtraW5kfVwiYClcblxuICAgICAgICBjb25zdCBlbnRyeSA9IEA6IGtpbmQsIG9pZCwgcmV2aXZlciwgYm9keTogdGhpc1xuXG4gICAgICAgIGVudHJ5Lm9iaiA9IHJldml2ZXIuaW5pdFxuICAgICAgICAgID8gcmV2aXZlci5pbml0KGVudHJ5LCBjdHgpXG4gICAgICAgICAgOiBPYmplY3QuY3JlYXRlKG51bGwpXG5cbiAgICAgICAgYnlPaWQuc2V0KG9pZCwgZW50cnkpXG4gICAgICAgIHF1ZXVlLnB1c2goZW50cnkpXG4gICAgICByZXR1cm5cblxuICAgIHJldHVybiB2YWx1ZVxuXG5cbiAgZnVuY3Rpb24gX2pzb25fcmVzdG9yZShrZXksIHZhbHVlKSA6OlxuICAgIGlmIHRva2VuID09PSBrZXkgOjpcbiAgICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgcmVmcy5zZXQgQCB0aGlzLCBieU9pZC5nZXQodmFsdWUpLm9ialxuXG4gICAgICBlbHNlIGlmIEFycmF5LmlzQXJyYXkodmFsdWUpIDo6XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gYnlPaWQuZ2V0KHZhbHVlWzFdKVxuICAgICAgICBlbnRyeS5ib2R5ID0gdGhpc1xuICAgICAgICByZWZzLnNldCBAIHRoaXMsIGVudHJ5Lm9ialxuICAgICAgcmV0dXJuXG5cbiAgICBlbHNlIGlmIG51bGwgPT09IHZhbHVlIHx8ICdvYmplY3QnICE9PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgY29uc3QgYW5zID0gcmVmcy5nZXQodmFsdWUpXG4gICAgcmV0dXJuIGFucyAhPT0gdW5kZWZpbmVkID8gYW5zIDogdmFsdWVcblxuIiwiLyogVGhlIGZvbGxvd2luZyBpbmxpbmVkIGJ5IHBhY2thZ2UuanNvbiBidWlsZCBzY3JpcHQ6XG5cbmNvbnN0IHtkZWNvZGVPYmplY3RUcmVlLCBPYmpNYXB9ID0gcmVxdWlyZSgnLi9kZWNvZGUnKVxuY29uc3Qge2VuY29kZU9iamVjdFRyZWUsIHJvb3Rfb2JqLCByb290X2xpc3R9ID0gcmVxdWlyZSgnLi9lbmNvZGUnKVxuKi9cblxuY2xhc3MgUmV2aXRhbGl6YXRpb24gZXh0ZW5kcyBGdW5jdGlvbiA6OlxuICBjb25zdHJ1Y3RvcigpIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVc2UgdGhlIHN0YXRpYyAuY3JlYXRlKCkgaW5zdGVhZCBvZiBuZXcnKVxuXG4gIHN0YXRpYyBjcmVhdGUodG9rZW5fcCkgOjpcbiAgICByZWdpc3Rlci50b2tlbiA9IHRva2VuX3AgfHwgJ1xcdTAzOUUnIC8vICfOnidcblxuICAgIGNvbnN0IGx1dFJldml2ZT1uZXcgTWFwKClcbiAgICBjb25zdCBsdXRQcmVzZXJ2ZT1uZXcgT2JqTWFwKClcblxuICAgIGNvbnN0IHNlbGYgPSBPYmplY3Quc2V0UHJvdG90eXBlT2YocmVnaXN0ZXIsIHRoaXMucHJvdG90eXBlKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgc2VsZiwgQHt9XG4gICAgICAgICAgbG9va3VwUmV2aXZlcjogQHt9IHZhbHVlOiBsdXRSZXZpdmUuZ2V0LmJpbmQobHV0UmV2aXZlKVxuICAgICAgICAgIGxvb2t1cFByZXNlcnZlcjogQHt9IHZhbHVlOiBsdXRQcmVzZXJ2ZS5nZXQuYmluZChsdXRQcmVzZXJ2ZSlcbiAgICAgICAgICBfc2V0UmV2aXZlcjogQHt9IHZhbHVlOiBfc2V0UmV2aXZlclxuXG5cbiAgICBzZWxmLmluaXRSZWdpc3Rlcnkocm9vdF9vYmosIHJvb3RfbGlzdClcbiAgICByZXR1cm4gc2VsZlxuXG4gICAgZnVuY3Rpb24gcmVnaXN0ZXIoKSA6OlxuICAgICAgcmV0dXJuIHNlbGYucmVnaXN0ZXIuYXBwbHkoc2VsZiwgYXJndW1lbnRzKVxuXG4gICAgZnVuY3Rpb24gX3NldFJldml2ZXIocmV2aXZlciwga2luZHMsIG1hdGNoZXJzKSA6OlxuICAgICAgbHV0UmV2aXZlLnNldChyZXZpdmVyLmtpbmQsIHJldml2ZXIpXG4gICAgICByZXR1cm4gQDpcbiAgICAgICAgICBhbGlhcyguLi5raW5kcykgOjpcbiAgICAgICAgICAgIGZvciBjb25zdCBlYWNoIG9mIGtpbmRzIDo6XG4gICAgICAgICAgICAgIGlmIGVhY2ggOjogbHV0UmV2aXZlLnNldChlYWNoLCByZXZpdmVyKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgICAgICBtYXRjaCguLi5tYXRjaGVycykgOjpcbiAgICAgICAgICAgIGZvciBjb25zdCBlYWNoIG9mIG1hdGNoZXJzIDo6XG4gICAgICAgICAgICAgIGlmIG51bGwgIT0gZWFjaCA6OiBsdXRQcmVzZXJ2ZS5zZXQoZWFjaCwgcmV2aXZlcilcbiAgICAgICAgICAgIHJldHVybiB0aGlzXG5cblxuICBpbml0UmVnaXN0ZXJ5KHJvb3Rfb2JqLCByb290X2xpc3QpIDo6XG4gICAgdGhpc1xuICAgICAgLnJlZ2lzdGVyIEA6IGtpbmQ6ICd7cm9vdH0nXG4gICAgICAgICAgcmV2aXZlKG9iaiwgZW50cnkpIDo6IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgLm1hdGNoIEAgcm9vdF9vYmpcblxuICAgIHRoaXNcbiAgICAgIC5yZWdpc3RlciBAOiBraW5kOiAnW3Jvb3RdJ1xuICAgICAgICAgIHByZXNlcnZlKHJvb3RMaXN0KSA6OiByZXR1cm4gQHt9IF86IHJvb3RMaXN0LnNsaWNlKClcbiAgICAgICAgICBpbml0KGVudHJ5KSA6OiByZXR1cm4gW11cbiAgICAgICAgICByZXZpdmUocm9vdExpc3QsIGVudHJ5KSA6OlxuICAgICAgICAgICAgcm9vdExpc3QucHVzaC5hcHBseShyb290TGlzdCwgZW50cnkuYm9keS5fKVxuICAgICAgLm1hdGNoIEAgcm9vdF9saXN0XG5cbiAgcmVnaXN0ZXIocmV2aXRhbGl6ZXIpIDo6XG4gICAgaWYgJ2tpbmQnIGluIHJldml0YWxpemVyICYmIHJldml0YWxpemVyLnJldml2ZSA6OlxuICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJSZXZpdmVyKHJldml0YWxpemVyKVxuXG4gICAgbGV0IHRndFxuICAgIGlmIHVuZGVmaW5lZCAhPT0gcmV2aXRhbGl6ZXIucHJvdG90eXBlIDo6XG4gICAgICB0Z3QgPSByZXZpdGFsaXplci5wcm90b3R5cGVbdGhpcy50b2tlbl1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdGd0IDo6XG4gICAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgICB0Z3QgPSB0Z3QuY2FsbChyZXZpdGFsaXplci5wcm90b3R5cGUsIHRoaXMpXG4gICAgICAgICAgaWYgbnVsbCA9PSB0Z3QgOjogcmV0dXJuXG4gICAgICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJDbGFzcyh0Z3QsIHJldml0YWxpemVyKVxuXG4gICAgdGd0ID0gcmV2aXRhbGl6ZXJbdGhpcy50b2tlbl1cbiAgICBpZiB1bmRlZmluZWQgIT09IHRndCA6OlxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICB0Z3QgPSB0Z3QuY2FsbChyZXZpdGFsaXplciwgdGhpcylcbiAgICAgICAgaWYgbnVsbCA9PSB0Z3QgOjogcmV0dXJuXG4gICAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICByZXR1cm4gdGhpcy5yZWdpc3RlclByb3RvKHRndCwgcmV2aXRhbGl6ZXIucHJvdG90eXBlIHx8IHJldml0YWxpemVyKVxuICAgICAgICAgIC5tYXRjaChyZXZpdGFsaXplcilcblxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYFVucmVjb2duaXplZCByZXZpdGFsaXphdGlvbiByZWdpc3RyYXRpb25gKVxuXG4gIHJlZ2lzdGVyUmV2aXZlcihyZXZpdmVyKSA6OlxuICAgIDo6XG4gICAgICBjb25zdCBraW5kID0gcmV2aXZlci5raW5kXG4gICAgICBpZiAnc3RyaW5nJyAhPT0gdHlwZW9mIGtpbmQgJiYgdHJ1ZSAhPT0ga2luZCAmJiBmYWxzZSAhPT0ga2luZCAmJiBudWxsICE9PSBraW5kIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgXCJraW5kXCIgbXVzdCBiZSBhIHN0cmluZ2BcblxuICAgICAgaWYgcmV2aXZlci5pbml0ICYmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLmluaXQgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcImluaXRcIiBtdXN0IGJlIGEgZnVuY3Rpb24nXG5cbiAgICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLnJldml2ZSA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wicmV2aXZlXCIgbXVzdCBiZSBhIGZ1bmN0aW9uJ1xuXG4gICAgICBpZiByZXZpdmVyLnByZXNlcnZlICYmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLnByZXNlcnZlIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCAnXCJwcmVzZXJ2ZVwiIG11c3QgYmUgYSBmdW5jdGlvbiBpZiBwcm92aWRlZCdcblxuICAgIHJldHVybiB0aGlzLl9zZXRSZXZpdmVyKHJldml2ZXIpXG5cbiAgcmVnaXN0ZXJDbGFzcyhraW5kLCBrbGFzcykgOjpcbiAgICByZXR1cm4gdGhpc1xuICAgICAgLnJlZ2lzdGVyUmV2aXZlciBAOiBraW5kLFxuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjpcbiAgICAgICAgICBvYmogPSBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2Yob2JqLCBrbGFzcy5wcm90b3R5cGUpXG4gICAgICAubWF0Y2goa2xhc3MsIGtsYXNzLnByb3RvdHlwZSlcblxuICByZWdpc3RlclByb3RvKGtpbmQsIHByb3RvKSA6OlxuICAgIHJldHVybiB0aGlzXG4gICAgICAucmVnaXN0ZXJSZXZpdmVyIEA6IGtpbmQsXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OlxuICAgICAgICAgIG9iaiA9IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihvYmosIHByb3RvKVxuICAgICAgLm1hdGNoKHByb3RvKVxuXG5cbiAgZGVjb2RlKGpzb25fc291cmNlLCBjdHgpIDo6XG4gICAgaWYgbnVsbCA9PT0ganNvbl9zb3VyY2UgOjpcbiAgICAgIHJldHVybiBudWxsIC8vIEpTT04ucGFyc2UobnVsbCkgcmV0dXJucyBudWxsOyBrZWVwIHdpdGggY29udmVudGlvblxuXG4gICAgY29uc3QgZXZ0cyA9IGRlY29kZU9iamVjdFRyZWUgQCB0aGlzLCBqc29uX3NvdXJjZSwgY3R4XG4gICAgcmV0dXJuIGV2dHMuZG9uZVxuXG4gIGVuY29kZShhbk9iamVjdCwgY3R4KSA6OlxuICAgIGNvbnN0IHJlZnMgPSBbXVxuICAgIGNvbnN0IHByb21pc2UgPSBlbmNvZGVPYmplY3RUcmVlIEAgdGhpcywgYW5PYmplY3QsIGN0eCwgKGVyciwgZW50cnkpID0+IDo6XG4gICAgICByZWZzW2VudHJ5Lm9pZF0gPSBlbnRyeS5jb250ZW50XG5cbiAgICBjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeSBAIGAke3RoaXMudG9rZW59cmVmc2BcbiAgICByZXR1cm4gcHJvbWlzZS50aGVuIEAgKCkgPT5cbiAgICAgIGB7JHtrZXl9OiBbXFxuICAke3JlZnMuam9pbignLFxcbiAgJyl9IF19XFxuYFxuXG4gIF9ib3VuZEZpbmRQcmVzZXJ2ZUZvck9iaigpIDo6XG4gICAgY29uc3QgbG9va3VwUHJlc2VydmVyID0gdGhpcy5sb29rdXBQcmVzZXJ2ZXJcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSA6OlxuICAgICAgbGV0IHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlcihvYmopXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHByZXNlcnZlciA6OlxuICAgICAgICByZXR1cm4gcHJlc2VydmVyXG5cbiAgICAgIHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlcihvYmouY29uc3RydWN0b3IpXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHByZXNlcnZlciA6OlxuICAgICAgICByZXR1cm4gcHJlc2VydmVyXG5cbiAgICAgIGxldCBwcm90byA9IG9ialxuICAgICAgd2hpbGUgbnVsbCAhPT0gQCBwcm90byA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihwcm90bykgOjpcbiAgICAgICAgbGV0IHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlcihwcm90bylcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgICByZXR1cm4gcHJlc2VydmVyXG5cblxuY2xhc3MgUmV2aXZlck5vdEZvdW5kIGV4dGVuZHMgRXJyb3IgOjpcblxuY29uc3QgY3JlYXRlUmVnaXN0cnkgPSBSZXZpdGFsaXphdGlvbi5jcmVhdGUuYmluZChSZXZpdGFsaXphdGlvbilcblxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzID0gY3JlYXRlUmVnaXN0cnkoKVxuT2JqZWN0LmFzc2lnbiBAIGV4cG9ydHMsIEB7fVxuICBSZXZpdGFsaXphdGlvbiwgUmV2aXZlck5vdEZvdW5kXG4gIGNyZWF0ZVJlZ2lzdHJ5LCBjcmVhdGU6IGNyZWF0ZVJlZ2lzdHJ5XG4iXX0=