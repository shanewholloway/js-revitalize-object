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
    lookup.set(srcValue, ref

    // transform live object into preserved form
    );const body = { [token]: [preserver.kind, oid] };
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
    Object.defineProperties(self, { lookupReviver: { value: lutRevive.get.bind(lutRevive) }, lookupPreserver: { value: lutPreserve.get.bind(lutPreserve) }, _setReviver: { value: _setReviver } });

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
        }, match(...matchers) {
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
Object.assign(exports, { Revitalization, ReviverNotFound,
  createRegistry, create: createRegistry });

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL2NvZGUvZW5jb2RlLmpzIiwiLi4vY29kZS9kZWNvZGUuanMiLCIuLi9jb2RlL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTSxXQUFXLEVBQWpCO0FBQ0EsTUFBTSxZQUFZLEVBQWxCOztBQUVBLFNBQVMsZ0JBQVQsQ0FBMEIsT0FBMUIsRUFBbUMsUUFBbkMsRUFBNkMsR0FBN0MsRUFBa0QsWUFBbEQsRUFBZ0U7QUFDOUQsUUFBTSxRQUFNLFFBQVEsS0FBcEI7QUFDQSxRQUFNLGtCQUFnQixRQUFRLGVBQTlCO0FBQ0EsUUFBTSxnQkFBYyxRQUFRLHdCQUFSLEVBQXBCOztBQUVBLFFBQU0sUUFBTSxFQUFaO0FBQUEsUUFBZ0IsU0FBTyxJQUFJLEdBQUosRUFBdkI7QUFDQSxPQUFLLFNBQUwsQ0FBZSxRQUFmLEVBQXlCLGNBQXpCOztBQUVBLFNBQU8sY0FBUDs7QUFFQSxXQUFTLFlBQVQsR0FBd0I7QUFDdEIsUUFBRyxNQUFNLE1BQU0sTUFBZixFQUF3QjtBQUN0QixhQUFPLFFBQVEsT0FBUixFQUFQO0FBQXdCOztBQUUxQixVQUFNLFdBQVcsRUFBakI7QUFDQSxXQUFNLE1BQU0sTUFBTSxNQUFsQixFQUEyQjtBQUN6QixZQUFNLE1BQU0sTUFBTSxLQUFOLEVBQVo7QUFBQSxZQUEyQixNQUFNLElBQUksR0FBckM7QUFDQSxlQUFTLElBQVQsQ0FDRSxJQUNHLElBREgsQ0FFTSxRQUFRO0FBQ04sWUFBSTtBQUNGLGNBQUksVUFBVSxLQUFLLFNBQUwsQ0FBZSxJQUFmLEVBQXFCLGNBQXJCLENBQWQ7QUFBa0QsU0FEcEQsQ0FFQSxPQUFNLEdBQU4sRUFBWTtBQUNWLGlCQUFPLGFBQWEsR0FBYixDQUFQO0FBQXdCO0FBQzFCLGVBQU8sYUFBZSxJQUFmLEVBQXFCLEVBQUUsR0FBRixFQUFPLElBQVAsRUFBYSxPQUFiLEVBQXJCLENBQVA7QUFBa0QsT0FQMUQsRUFTTSxPQUFPLGFBQWEsR0FBYixDQVRiLENBREY7QUFVZ0M7O0FB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QUFDbkIsVUFBSSxZQUFZLGdCQUFnQixHQUFoQixDQUFoQjtBQUNBLFVBQUcsY0FBYyxTQUFqQixFQUE2QjtBQUMzQixlQUFPLFNBQVA7QUFBZ0I7O0FBRWxCLGtCQUFZLGdCQUFnQixJQUFJLFdBQXBCLENBQVo7QUFDQSxVQUFHLGNBQWMsU0FBakIsRUFBNkI7QUFDM0IsZUFBTyxTQUFQO0FBQWdCOztBQUVsQixVQUFJLFFBQVEsR0FBWjtBQUNBLGFBQU0sVUFBVyxRQUFRLE9BQU8sY0FBUCxDQUFzQixLQUF0QixDQUFuQixDQUFOLEVBQXdEO0FBQ3RELFlBQUksWUFBWSxnQkFBZ0IsS0FBaEIsQ0FBaEI7QUFDQSxZQUFHLGNBQWMsU0FBakIsRUFBNkI7QUFDM0IsaUJBQU8sU0FBUDtBQUFnQjtBQUFBO0FBQUEsS0FidEI7QUFhc0I7QUE1SVk7O0FBK0l0QyxNQUFNLGVBQU4sU0FBOEIsS0FBOUIsQ0FBb0M7O0FBRXBDLE1BQU0saUJBQWlCLGVBQWUsTUFBZixDQUFzQixJQUF0QixDQUEyQixjQUEzQixDQUF2Qjs7QUFFQSxPQUFPLE9BQVAsR0FBaUIsVUFBVSxnQkFBM0I7QUFDQSxPQUFPLE1BQVAsQ0FBZ0IsT0FBaEIsRUFDSSxFQUFJLGNBQUosRUFBb0IsZUFBcEI7QUFDSSxnQkFESixFQUNvQixRQUFRLGNBRDVCLEVBREoiLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCByb290X29iaiA9IHt9XG5jb25zdCByb290X2xpc3QgPSBbXVxuXG5mdW5jdGlvbiBlbmNvZGVPYmplY3RUcmVlKHJldml2ZXIsIGFuT2JqZWN0LCBjdHgsIGNiX2FkZE9iamVjdCkgOjpcbiAgY29uc3QgdG9rZW49cmV2aXZlci50b2tlblxuICBjb25zdCBsb29rdXBQcmVzZXJ2ZXI9cmV2aXZlci5sb29rdXBQcmVzZXJ2ZXJcbiAgY29uc3QgZmluZFByZXNlcnZlcj1yZXZpdmVyLl9ib3VuZEZpbmRQcmVzZXJ2ZUZvck9iaigpXG5cbiAgY29uc3QgcXVldWU9W10sIGxvb2t1cD1uZXcgTWFwKClcbiAgSlNPTi5zdHJpbmdpZnkoYW5PYmplY3QsIF9qc29uX3JlcGxhY2VyKVxuXG4gIHJldHVybiBfZW5jb2RlUXVldWUoKVxuXG4gIGZ1bmN0aW9uIF9lbmNvZGVRdWV1ZSgpIDo6XG4gICAgaWYgMCA9PT0gcXVldWUubGVuZ3RoIDo6XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcblxuICAgIGNvbnN0IHByb21pc2VzID0gW11cbiAgICB3aGlsZSAwICE9PSBxdWV1ZS5sZW5ndGggOjpcbiAgICAgIGNvbnN0IHRpcCA9IHF1ZXVlLnNoaWZ0KCksIG9pZCA9IHRpcC5vaWRcbiAgICAgIHByb21pc2VzLnB1c2ggQFxuICAgICAgICB0aXBcbiAgICAgICAgICAudGhlbiBAXG4gICAgICAgICAgICAgIGJvZHkgPT4gOjpcbiAgICAgICAgICAgICAgICB0cnkgOjpcbiAgICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoYm9keSwgX2pzb25fcmVwbGFjZXIpXG4gICAgICAgICAgICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgICAgICAgICAgICByZXR1cm4gY2JfYWRkT2JqZWN0KGVycilcbiAgICAgICAgICAgICAgICByZXR1cm4gY2JfYWRkT2JqZWN0IEAgbnVsbCwgeyBvaWQsIGJvZHksIGNvbnRlbnQgfVxuXG4gICAgICAgICAgICAsIGVyciA9PiBjYl9hZGRPYmplY3QoZXJyKVxuXG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKF9lbmNvZGVRdWV1ZSlcblxuICBmdW5jdGlvbiBfanNvbl9yZXBsYWNlcihrZXksIGRzdFZhbHVlKSA6OlxuICAgIC8vIHNyY1ZhbHVlICE9PSBkc3RWYWx1ZSBmb3Igb2JqZWN0cyB3aXRoIC50b0pTT04oKSBtZXRob2RzXG4gICAgY29uc3Qgc3JjVmFsdWUgPSB0aGlzW2tleV1cblxuICAgIGlmIGRzdFZhbHVlID09PSBudWxsIHx8ICdvYmplY3QnICE9PSB0eXBlb2Ygc3JjVmFsdWUgOjpcbiAgICAgIHJldHVybiBkc3RWYWx1ZVxuXG4gICAgY29uc3QgcHJldiA9IGxvb2t1cC5nZXQoc3JjVmFsdWUpXG4gICAgaWYgdW5kZWZpbmVkICE9PSBwcmV2IDo6XG4gICAgICByZXR1cm4gcHJldiAvLyBhbHJlYWR5IHNlcmlhbGl6ZWQgLS0gcmVmZXJlbmNlIGV4aXN0aW5nIGl0ZW1cblxuICAgIGxldCBwcmVzZXJ2ZXIgPSBmaW5kUHJlc2VydmVyKHNyY1ZhbHVlKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gcHJlc2VydmVyIDo6XG4gICAgICAvLyBub3QgYSBcInNwZWNpYWxcIiBwcmVzZXJ2ZWQgaXRlbVxuICAgICAgaWYgYW5PYmplY3QgIT09IHNyY1ZhbHVlIDo6XG4gICAgICAgIHJldHVybiBkc3RWYWx1ZSAvLyBzbyBzZXJpYWxpemUgbm9ybWFsbHlcbiAgICAgIC8vIGJ1dCBpdCBpcyB0aGUgcm9vdCwgc28gc3RvcmUgYXQgb2lkIDBcbiAgICAgIHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlciBAXG4gICAgICAgIEFycmF5LmlzQXJyYXkoZHN0VmFsdWUpID8gcm9vdF9saXN0IDogcm9vdF9vYmpcblxuICAgIC8vIHJlZ2lzdGVyIGlkIGZvciBvYmplY3QgYW5kIHJldHVybiBhIEpTT04gc2VyaWFsaXphYmxlIHZlcnNpb25cbiAgICBjb25zdCBvaWQgPSBsb29rdXAuc2l6ZVxuICAgIGNvbnN0IHJlZiA9IHtbdG9rZW5dOiBvaWR9XG4gICAgbG9va3VwLnNldChzcmNWYWx1ZSwgcmVmKVxuXG4gICAgLy8gdHJhbnNmb3JtIGxpdmUgb2JqZWN0IGludG8gcHJlc2VydmVkIGZvcm1cbiAgICBjb25zdCBib2R5ID0ge1t0b2tlbl06IFtwcmVzZXJ2ZXIua2luZCwgb2lkXX1cbiAgICBjb25zdCBwcm9taXNlID0gUHJvbWlzZVxuICAgICAgLnJlc29sdmUgQFxuICAgICAgICBwcmVzZXJ2ZXIucHJlc2VydmVcbiAgICAgICAgICA/IHByZXNlcnZlci5wcmVzZXJ2ZShkc3RWYWx1ZSwgc3JjVmFsdWUsIGN0eClcbiAgICAgICAgICA6IGRzdFZhbHVlXG4gICAgICAudGhlbiBAIGF0dHJzID0+IE9iamVjdC5hc3NpZ24oYm9keSwgYXR0cnMpXG5cbiAgICBwcm9taXNlLm9pZCA9IG9pZFxuICAgIHF1ZXVlLnB1c2ggQCBwcm9taXNlXG4gICAgcmV0dXJuIHJlZlxuXG4iLCJjb25zdCBPYmpNYXAgPSAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIFdlYWtNYXAgPyBXZWFrTWFwIDogTWFwXG5cbmZ1bmN0aW9uIGRlY29kZU9iamVjdFRyZWUocmV2aXZlciwganNvbl9zb3VyY2UsIGN0eCkgOjpcbiAgaWYgbnVsbCA9PT0ganNvbl9zb3VyY2UgOjpcbiAgICByZXR1cm4gbnVsbCAvLyBKU09OLnBhcnNlKG51bGwpIHJldHVybnMgbnVsbDsga2VlcCB3aXRoIGNvbnZlbnRpb25cblxuICBjb25zdCB0b2tlbj1yZXZpdmVyLnRva2VuXG4gIGNvbnN0IGxvb2t1cFJldml2ZXI9cmV2aXZlci5sb29rdXBSZXZpdmVyXG5cbiAgY29uc3QgcXVldWU9W10sIGJ5T2lkPW5ldyBNYXAoKVxuICBKU09OLnBhcnNlKGpzb25fc291cmNlLCBfanNvbl9jcmVhdGUpXG5cbiAgY29uc3QgcmVmcz1uZXcgT2JqTWFwKClcbiAgSlNPTi5wYXJzZShqc29uX3NvdXJjZSwgX2pzb25fcmVzdG9yZSlcblxuICBjb25zdCBldnRzID0ge31cbiAgY29uc3QgX3N0YXJ0ID0gUHJvbWlzZS5yZXNvbHZlKCkudGhlbiBAICgpID0+XG4gICAgcXVldWUucmV2ZXJzZSgpLm1hcCBAIGVudHJ5ID0+IDo6XG4gICAgICBlbnRyeS5ldnRzID0gZXZ0c1xuICAgICAgcmV0dXJuIGVudHJ5LnJldml2ZXIucmV2aXZlKGVudHJ5Lm9iaiwgZW50cnksIGN0eClcblxuICBldnRzLnN0YXJ0ZWQgPSBfc3RhcnQudGhlbiBAIGxzdCA9PiBsc3QubGVuZ3RoXG4gIGV2dHMuZmluaXNoZWQgPSBfc3RhcnQudGhlbiBAIGxzdCA9PlxuICAgIFByb21pc2UuYWxsKGxzdCkudGhlbiBAIGxzdCA9PiBsc3QubGVuZ3RoXG5cbiAgZXZ0cy5kb25lID0gZXZ0cy5maW5pc2hlZC50aGVuIEAgKCkgPT4gOjpcbiAgICBjb25zdCByb290ID0gYnlPaWQuZ2V0KDApXG4gICAgaWYgbnVsbCA9PSByb290IDo6IHJldHVyblxuXG4gICAgY29uc3Qge29iaiwgcHJvbWlzZX0gPSByb290XG4gICAgcmV0dXJuIHVuZGVmaW5lZCA9PT0gcHJvbWlzZSA/IG9ialxuICAgICAgOiBwcm9taXNlLnRoZW4gQCBhbnMgPT5cbiAgICAgICAgICBhbnMgIT09IHVuZGVmaW5lZCA/IGFucyA6IG9ialxuXG4gIHJldHVybiBldnRzXG5cblxuICBmdW5jdGlvbiBfanNvbl9jcmVhdGUoa2V5LCB2YWx1ZSkgOjpcbiAgICBpZiB0b2tlbiA9PT0ga2V5IDo6XG4gICAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICBlbHNlIGlmIEFycmF5LmlzQXJyYXkodmFsdWUpIDo6XG4gICAgICAgIGRlbGV0ZSB0aGlzW3Rva2VuXVxuXG4gICAgICAgIGNvbnN0IFtraW5kLCBvaWRdID0gdmFsdWVcbiAgICAgICAgY29uc3QgcmV2aXZlciA9IGxvb2t1cFJldml2ZXIoa2luZClcbiAgICAgICAgaWYgdW5kZWZpbmVkID09PSByZXZpdmVyIDo6XG4gICAgICAgICAgdGhyb3cgbmV3IFJldml2ZXJOb3RGb3VuZChgTWlzc2luZyByZWdpc3RlcmVkIHJldml2ZXIgZm9yIGtpbmQgXCIke2tpbmR9XCJgKVxuXG4gICAgICAgIGNvbnN0IGVudHJ5ID0gQDoga2luZCwgb2lkLCByZXZpdmVyLCBib2R5OiB0aGlzXG5cbiAgICAgICAgZW50cnkub2JqID0gcmV2aXZlci5pbml0XG4gICAgICAgICAgPyByZXZpdmVyLmluaXQoZW50cnksIGN0eClcbiAgICAgICAgICA6IE9iamVjdC5jcmVhdGUobnVsbClcblxuICAgICAgICBieU9pZC5zZXQob2lkLCBlbnRyeSlcbiAgICAgICAgcXVldWUucHVzaChlbnRyeSlcbiAgICAgIHJldHVyblxuXG4gICAgcmV0dXJuIHZhbHVlXG5cblxuICBmdW5jdGlvbiBfanNvbl9yZXN0b3JlKGtleSwgdmFsdWUpIDo6XG4gICAgaWYgdG9rZW4gPT09IGtleSA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICByZWZzLnNldCBAIHRoaXMsIGJ5T2lkLmdldCh2YWx1ZSkub2JqXG5cbiAgICAgIGVsc2UgaWYgQXJyYXkuaXNBcnJheSh2YWx1ZSkgOjpcbiAgICAgICAgY29uc3QgZW50cnkgPSBieU9pZC5nZXQodmFsdWVbMV0pXG4gICAgICAgIGVudHJ5LmJvZHkgPSB0aGlzXG4gICAgICAgIHJlZnMuc2V0IEAgdGhpcywgZW50cnkub2JqXG4gICAgICByZXR1cm5cblxuICAgIGVsc2UgaWYgbnVsbCA9PT0gdmFsdWUgfHwgJ29iamVjdCcgIT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICBjb25zdCBhbnMgPSByZWZzLmdldCh2YWx1ZSlcbiAgICByZXR1cm4gYW5zICE9PSB1bmRlZmluZWQgPyBhbnMgOiB2YWx1ZVxuXG4iLCIvKiBUaGUgZm9sbG93aW5nIGlubGluZWQgYnkgcGFja2FnZS5qc29uIGJ1aWxkIHNjcmlwdDpcblxuY29uc3Qge2RlY29kZU9iamVjdFRyZWUsIE9iak1hcH0gPSByZXF1aXJlKCcuL2RlY29kZScpXG5jb25zdCB7ZW5jb2RlT2JqZWN0VHJlZSwgcm9vdF9vYmosIHJvb3RfbGlzdH0gPSByZXF1aXJlKCcuL2VuY29kZScpXG4qL1xuXG5jbGFzcyBSZXZpdGFsaXphdGlvbiBleHRlbmRzIEZ1bmN0aW9uIDo6XG4gIGNvbnN0cnVjdG9yKCkgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VzZSB0aGUgc3RhdGljIC5jcmVhdGUoKSBpbnN0ZWFkIG9mIG5ldycpXG5cbiAgc3RhdGljIGNyZWF0ZSh0b2tlbl9wKSA6OlxuICAgIHJlZ2lzdGVyLnRva2VuID0gdG9rZW5fcCB8fCAnXFx1MDM5RScgLy8gJ86eJ1xuXG4gICAgY29uc3QgbHV0UmV2aXZlPW5ldyBNYXAoKVxuICAgIGNvbnN0IGx1dFByZXNlcnZlPW5ldyBPYmpNYXAoKVxuXG4gICAgY29uc3Qgc2VsZiA9IE9iamVjdC5zZXRQcm90b3R5cGVPZihyZWdpc3RlciwgdGhpcy5wcm90b3R5cGUpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBzZWxmLFxuICAgICAgQHt9IGxvb2t1cFJldml2ZXI6IEB7fSB2YWx1ZTogbHV0UmV2aXZlLmdldC5iaW5kKGx1dFJldml2ZSlcbiAgICAgICAgLCBsb29rdXBQcmVzZXJ2ZXI6IEB7fSB2YWx1ZTogbHV0UHJlc2VydmUuZ2V0LmJpbmQobHV0UHJlc2VydmUpXG4gICAgICAgICwgX3NldFJldml2ZXI6IEB7fSB2YWx1ZTogX3NldFJldml2ZXJcblxuXG4gICAgc2VsZi5pbml0UmVnaXN0ZXJ5KHJvb3Rfb2JqLCByb290X2xpc3QpXG4gICAgcmV0dXJuIHNlbGZcblxuICAgIGZ1bmN0aW9uIHJlZ2lzdGVyKCkgOjpcbiAgICAgIHJldHVybiBzZWxmLnJlZ2lzdGVyLmFwcGx5KHNlbGYsIGFyZ3VtZW50cylcblxuICAgIGZ1bmN0aW9uIF9zZXRSZXZpdmVyKHJldml2ZXIsIGtpbmRzLCBtYXRjaGVycykgOjpcbiAgICAgIGx1dFJldml2ZS5zZXQocmV2aXZlci5raW5kLCByZXZpdmVyKVxuICAgICAgcmV0dXJuIDo6XG4gICAgICAgICAgYWxpYXMoLi4ua2luZHMpIDo6XG4gICAgICAgICAgICBmb3IgY29uc3QgZWFjaCBvZiBraW5kcyA6OlxuICAgICAgICAgICAgICBpZiBlYWNoIDo6IGx1dFJldml2ZS5zZXQoZWFjaCwgcmV2aXZlcilcbiAgICAgICAgICAgIHJldHVybiB0aGlzXG4gICAgICAgICwgbWF0Y2goLi4ubWF0Y2hlcnMpIDo6XG4gICAgICAgICAgICBmb3IgY29uc3QgZWFjaCBvZiBtYXRjaGVycyA6OlxuICAgICAgICAgICAgICBpZiBudWxsICE9IGVhY2ggOjogbHV0UHJlc2VydmUuc2V0KGVhY2gsIHJldml2ZXIpXG4gICAgICAgICAgICByZXR1cm4gdGhpc1xuXG5cbiAgaW5pdFJlZ2lzdGVyeShyb290X29iaiwgcm9vdF9saXN0KSA6OlxuICAgIHRoaXNcbiAgICAgIC5yZWdpc3RlciBAOiBraW5kOiAne3Jvb3R9J1xuICAgICAgICAsIHJldml2ZShvYmosIGVudHJ5KSA6OiBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgIC5tYXRjaCBAIHJvb3Rfb2JqXG5cbiAgICB0aGlzXG4gICAgICAucmVnaXN0ZXIgQDoga2luZDogJ1tyb290XSdcbiAgICAgICAgLCBwcmVzZXJ2ZShyb290TGlzdCkgOjogcmV0dXJuIEB7fSBfOiByb290TGlzdC5zbGljZSgpXG4gICAgICAgICwgaW5pdChlbnRyeSkgOjogcmV0dXJuIFtdXG4gICAgICAgICwgcmV2aXZlKHJvb3RMaXN0LCBlbnRyeSkgOjpcbiAgICAgICAgICAgIHJvb3RMaXN0LnB1c2guYXBwbHkocm9vdExpc3QsIGVudHJ5LmJvZHkuXylcbiAgICAgIC5tYXRjaCBAIHJvb3RfbGlzdFxuXG4gIHJlZ2lzdGVyKHJldml0YWxpemVyKSA6OlxuICAgIGlmICdraW5kJyBpbiByZXZpdGFsaXplciAmJiByZXZpdGFsaXplci5yZXZpdmUgOjpcbiAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyUmV2aXZlcihyZXZpdGFsaXplcilcblxuICAgIGxldCB0Z3RcbiAgICBpZiB1bmRlZmluZWQgIT09IHJldml0YWxpemVyLnByb3RvdHlwZSA6OlxuICAgICAgdGd0ID0gcmV2aXRhbGl6ZXIucHJvdG90eXBlW3RoaXMudG9rZW5dXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRndCA6OlxuICAgICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgICAgdGd0ID0gdGd0LmNhbGwocmV2aXRhbGl6ZXIucHJvdG90eXBlLCB0aGlzKVxuICAgICAgICAgIGlmIG51bGwgPT0gdGd0IDo6IHJldHVyblxuICAgICAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyQ2xhc3ModGd0LCByZXZpdGFsaXplcilcblxuICAgIHRndCA9IHJldml0YWxpemVyW3RoaXMudG9rZW5dXG4gICAgaWYgdW5kZWZpbmVkICE9PSB0Z3QgOjpcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgdGd0ID0gdGd0LmNhbGwocmV2aXRhbGl6ZXIsIHRoaXMpXG4gICAgICAgIGlmIG51bGwgPT0gdGd0IDo6IHJldHVyblxuICAgICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJQcm90byh0Z3QsIHJldml0YWxpemVyLnByb3RvdHlwZSB8fCByZXZpdGFsaXplcilcbiAgICAgICAgICAubWF0Y2gocmV2aXRhbGl6ZXIpXG5cbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBVbnJlY29nbml6ZWQgcmV2aXRhbGl6YXRpb24gcmVnaXN0cmF0aW9uYClcblxuICByZWdpc3RlclJldml2ZXIocmV2aXZlcikgOjpcbiAgICA6OlxuICAgICAgY29uc3Qga2luZCA9IHJldml2ZXIua2luZFxuICAgICAgaWYgJ3N0cmluZycgIT09IHR5cGVvZiBraW5kICYmIHRydWUgIT09IGtpbmQgJiYgZmFsc2UgIT09IGtpbmQgJiYgbnVsbCAhPT0ga2luZCA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYFwia2luZFwiIG11c3QgYmUgYSBzdHJpbmdgXG5cbiAgICAgIGlmIHJldml2ZXIuaW5pdCAmJiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmV2aXZlci5pbml0IDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCAnXCJpbml0XCIgbXVzdCBiZSBhIGZ1bmN0aW9uJ1xuXG4gICAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmV2aXZlci5yZXZpdmUgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcInJldml2ZVwiIG11c3QgYmUgYSBmdW5jdGlvbidcblxuICAgICAgaWYgcmV2aXZlci5wcmVzZXJ2ZSAmJiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmV2aXZlci5wcmVzZXJ2ZSA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wicHJlc2VydmVcIiBtdXN0IGJlIGEgZnVuY3Rpb24gaWYgcHJvdmlkZWQnXG5cbiAgICByZXR1cm4gdGhpcy5fc2V0UmV2aXZlcihyZXZpdmVyKVxuXG4gIHJlZ2lzdGVyQ2xhc3Moa2luZCwga2xhc3MpIDo6XG4gICAgcmV0dXJuIHRoaXNcbiAgICAgIC5yZWdpc3RlclJldml2ZXIgQDoga2luZCxcbiAgICAgICAgcmV2aXZlKG9iaiwgZW50cnkpIDo6XG4gICAgICAgICAgb2JqID0gT2JqZWN0LmFzc2lnbihvYmosIGVudHJ5LmJvZHkpXG4gICAgICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKG9iaiwga2xhc3MucHJvdG90eXBlKVxuICAgICAgLm1hdGNoKGtsYXNzLCBrbGFzcy5wcm90b3R5cGUpXG5cbiAgcmVnaXN0ZXJQcm90byhraW5kLCBwcm90bykgOjpcbiAgICByZXR1cm4gdGhpc1xuICAgICAgLnJlZ2lzdGVyUmV2aXZlciBAOiBraW5kLFxuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjpcbiAgICAgICAgICBvYmogPSBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2Yob2JqLCBwcm90bylcbiAgICAgIC5tYXRjaChwcm90bylcblxuXG4gIGRlY29kZShqc29uX3NvdXJjZSwgY3R4KSA6OlxuICAgIGlmIG51bGwgPT09IGpzb25fc291cmNlIDo6XG4gICAgICByZXR1cm4gbnVsbCAvLyBKU09OLnBhcnNlKG51bGwpIHJldHVybnMgbnVsbDsga2VlcCB3aXRoIGNvbnZlbnRpb25cblxuICAgIGNvbnN0IGV2dHMgPSBkZWNvZGVPYmplY3RUcmVlIEAgdGhpcywganNvbl9zb3VyY2UsIGN0eFxuICAgIHJldHVybiBldnRzLmRvbmVcblxuICBlbmNvZGUoYW5PYmplY3QsIGN0eCkgOjpcbiAgICBjb25zdCByZWZzID0gW11cbiAgICBjb25zdCBwcm9taXNlID0gZW5jb2RlT2JqZWN0VHJlZSBAIHRoaXMsIGFuT2JqZWN0LCBjdHgsIChlcnIsIGVudHJ5KSA9PiA6OlxuICAgICAgcmVmc1tlbnRyeS5vaWRdID0gZW50cnkuY29udGVudFxuXG4gICAgY29uc3Qga2V5ID0gSlNPTi5zdHJpbmdpZnkgQCBgJHt0aGlzLnRva2VufXJlZnNgXG4gICAgcmV0dXJuIHByb21pc2UudGhlbiBAICgpID0+XG4gICAgICBgeyR7a2V5fTogW1xcbiAgJHtyZWZzLmpvaW4oJyxcXG4gICcpfSBdfVxcbmBcblxuICBfYm91bmRGaW5kUHJlc2VydmVGb3JPYmooKSA6OlxuICAgIGNvbnN0IGxvb2t1cFByZXNlcnZlciA9IHRoaXMubG9va3VwUHJlc2VydmVyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikgOjpcbiAgICAgIGxldCBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIob2JqKVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG4gICAgICBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIob2JqLmNvbnN0cnVjdG9yKVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG4gICAgICBsZXQgcHJvdG8gPSBvYmpcbiAgICAgIHdoaWxlIG51bGwgIT09IEAgcHJvdG8gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YocHJvdG8pIDo6XG4gICAgICAgIGxldCBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIocHJvdG8pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJlc2VydmVyIDo6XG4gICAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG5cbmNsYXNzIFJldml2ZXJOb3RGb3VuZCBleHRlbmRzIEVycm9yIDo6XG5cbmNvbnN0IGNyZWF0ZVJlZ2lzdHJ5ID0gUmV2aXRhbGl6YXRpb24uY3JlYXRlLmJpbmQoUmV2aXRhbGl6YXRpb24pXG5cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9IGNyZWF0ZVJlZ2lzdHJ5KClcbk9iamVjdC5hc3NpZ24gQCBleHBvcnRzXG4gICwgQHt9IFJldml0YWxpemF0aW9uLCBSZXZpdmVyTm90Rm91bmRcbiAgICAgICwgY3JlYXRlUmVnaXN0cnksIGNyZWF0ZTogY3JlYXRlUmVnaXN0cnlcbiJdfQ==