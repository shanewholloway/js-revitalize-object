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

export { createRegistry, createRegistry as create, Revitalization, ReviverNotFound$1 as ReviverNotFound };
export default index;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi9jb2RlL2RlY29kZS5qcyIsIi4uL2NvZGUvZW5jb2RlLmpzIiwiLi4vY29kZS9yZXZpdGFsaXphdGlvbi5qcyIsIi4uL2NvZGUvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IE9iak1hcCA9ICd1bmRlZmluZWQnICE9PSB0eXBlb2YgV2Vha01hcCA/IFdlYWtNYXAgOiBNYXBcblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZU9iamVjdFRyZWUocmV2aXZlciwganNvbl9zb3VyY2UsIGN0eCkgOjpcbiAgaWYgbnVsbCA9PT0ganNvbl9zb3VyY2UgOjpcbiAgICByZXR1cm4gbnVsbCAvLyBKU09OLnBhcnNlKG51bGwpIHJldHVybnMgbnVsbDsga2VlcCB3aXRoIGNvbnZlbnRpb25cblxuICBjb25zdCB0b2tlbj1yZXZpdmVyLnRva2VuXG4gIGNvbnN0IGxvb2t1cFJldml2ZXI9cmV2aXZlci5sb29rdXBSZXZpdmVyXG5cbiAgY29uc3QgcXVldWU9W10sIGJ5T2lkPW5ldyBNYXAoKVxuICBKU09OLnBhcnNlKGpzb25fc291cmNlLCBfanNvbl9jcmVhdGUpXG5cbiAgY29uc3QgcmVmcz1uZXcgT2JqTWFwKClcbiAgSlNPTi5wYXJzZShqc29uX3NvdXJjZSwgX2pzb25fcmVzdG9yZSlcblxuICBjb25zdCBldnRzID0ge31cbiAgY29uc3QgX3N0YXJ0ID0gUHJvbWlzZS5yZXNvbHZlKCkudGhlbiBAICgpID0+XG4gICAgcXVldWUucmV2ZXJzZSgpLm1hcCBAIGVudHJ5ID0+IDo6XG4gICAgICBlbnRyeS5ldnRzID0gZXZ0c1xuICAgICAgcmV0dXJuIGVudHJ5LnJldml2ZXIucmV2aXZlKGVudHJ5Lm9iaiwgZW50cnksIGN0eClcblxuICBldnRzLnN0YXJ0ZWQgPSBfc3RhcnQudGhlbiBAIGxzdCA9PiBsc3QubGVuZ3RoXG4gIGV2dHMuZmluaXNoZWQgPSBfc3RhcnQudGhlbiBAIGxzdCA9PlxuICAgIFByb21pc2UuYWxsKGxzdCkudGhlbiBAIGxzdCA9PiBsc3QubGVuZ3RoXG5cbiAgZXZ0cy5kb25lID0gZXZ0cy5maW5pc2hlZC50aGVuIEAgKCkgPT4gOjpcbiAgICBjb25zdCByb290ID0gYnlPaWQuZ2V0KDApXG4gICAgaWYgbnVsbCA9PSByb290IDo6IHJldHVyblxuXG4gICAgY29uc3Qge29iaiwgcHJvbWlzZX0gPSByb290XG4gICAgcmV0dXJuIHVuZGVmaW5lZCA9PT0gcHJvbWlzZSA/IG9ialxuICAgICAgOiBwcm9taXNlLnRoZW4gQCBhbnMgPT5cbiAgICAgICAgICBhbnMgIT09IHVuZGVmaW5lZCA/IGFucyA6IG9ialxuXG4gIHJldHVybiBldnRzXG5cblxuICBmdW5jdGlvbiBfanNvbl9jcmVhdGUoa2V5LCB2YWx1ZSkgOjpcbiAgICBpZiB0b2tlbiA9PT0ga2V5IDo6XG4gICAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICBlbHNlIGlmIEFycmF5LmlzQXJyYXkodmFsdWUpIDo6XG4gICAgICAgIGRlbGV0ZSB0aGlzW3Rva2VuXVxuXG4gICAgICAgIGNvbnN0IFtraW5kLCBvaWRdID0gdmFsdWVcbiAgICAgICAgY29uc3QgcmV2aXZlciA9IGxvb2t1cFJldml2ZXIoa2luZClcbiAgICAgICAgaWYgdW5kZWZpbmVkID09PSByZXZpdmVyIDo6XG4gICAgICAgICAgdGhyb3cgbmV3IFJldml2ZXJOb3RGb3VuZChgTWlzc2luZyByZWdpc3RlcmVkIHJldml2ZXIgZm9yIGtpbmQgXCIke2tpbmR9XCJgKVxuXG4gICAgICAgIGNvbnN0IGVudHJ5ID0gQDoga2luZCwgb2lkLCByZXZpdmVyLCBib2R5OiB0aGlzXG5cbiAgICAgICAgZW50cnkub2JqID0gcmV2aXZlci5pbml0XG4gICAgICAgICAgPyByZXZpdmVyLmluaXQoZW50cnksIGN0eClcbiAgICAgICAgICA6IE9iamVjdC5jcmVhdGUobnVsbClcblxuICAgICAgICBieU9pZC5zZXQob2lkLCBlbnRyeSlcbiAgICAgICAgcXVldWUucHVzaChlbnRyeSlcbiAgICAgIHJldHVyblxuXG4gICAgcmV0dXJuIHZhbHVlXG5cblxuICBmdW5jdGlvbiBfanNvbl9yZXN0b3JlKGtleSwgdmFsdWUpIDo6XG4gICAgaWYgdG9rZW4gPT09IGtleSA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICByZWZzLnNldCBAIHRoaXMsIGJ5T2lkLmdldCh2YWx1ZSkub2JqXG5cbiAgICAgIGVsc2UgaWYgQXJyYXkuaXNBcnJheSh2YWx1ZSkgOjpcbiAgICAgICAgY29uc3QgZW50cnkgPSBieU9pZC5nZXQodmFsdWVbMV0pXG4gICAgICAgIGVudHJ5LmJvZHkgPSB0aGlzXG4gICAgICAgIHJlZnMuc2V0IEAgdGhpcywgZW50cnkub2JqXG4gICAgICByZXR1cm5cblxuICAgIGVsc2UgaWYgbnVsbCA9PT0gdmFsdWUgfHwgJ29iamVjdCcgIT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICBjb25zdCBhbnMgPSByZWZzLmdldCh2YWx1ZSlcbiAgICByZXR1cm4gYW5zICE9PSB1bmRlZmluZWQgPyBhbnMgOiB2YWx1ZVxuXG4iLCJleHBvcnQgY29uc3Qgcm9vdF9vYmogPSBPYmplY3QuZnJlZXplIEAge31cbmV4cG9ydCBjb25zdCByb290X2xpc3QgPSBPYmplY3QuZnJlZXplIEAgW11cblxuZXhwb3J0IGZ1bmN0aW9uIGVuY29kZU9iamVjdFRyZWUocmV2aXZlciwgYW5PYmplY3QsIGN0eCwgY2JfYWRkT2JqZWN0KSA6OlxuICBjb25zdCB0b2tlbj1yZXZpdmVyLnRva2VuXG4gIGNvbnN0IGxvb2t1cFByZXNlcnZlcj1yZXZpdmVyLmxvb2t1cFByZXNlcnZlclxuICBjb25zdCBmaW5kUHJlc2VydmVyPXJldml2ZXIuX2JvdW5kRmluZFByZXNlcnZlRm9yT2JqKClcblxuICBjb25zdCBxdWV1ZT1bXSwgbG9va3VwPW5ldyBNYXAoKVxuICBKU09OLnN0cmluZ2lmeShhbk9iamVjdCwgX2pzb25fcmVwbGFjZXIpXG5cbiAgcmV0dXJuIF9lbmNvZGVRdWV1ZSgpXG5cbiAgZnVuY3Rpb24gX2VuY29kZVF1ZXVlKCkgOjpcbiAgICBpZiAwID09PSBxdWV1ZS5sZW5ndGggOjpcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXVxuICAgIHdoaWxlIDAgIT09IHF1ZXVlLmxlbmd0aCA6OlxuICAgICAgY29uc3QgdGlwID0gcXVldWUuc2hpZnQoKSwgb2lkID0gdGlwLm9pZFxuICAgICAgcHJvbWlzZXMucHVzaCBAXG4gICAgICAgIHRpcFxuICAgICAgICAgIC50aGVuIEBcbiAgICAgICAgICAgICAgYm9keSA9PiA6OlxuICAgICAgICAgICAgICAgIHRyeSA6OlxuICAgICAgICAgICAgICAgICAgdmFyIGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShib2R5LCBfanNvbl9yZXBsYWNlcilcbiAgICAgICAgICAgICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgICAgICAgICAgIHJldHVybiBjYl9hZGRPYmplY3QoZXJyKVxuICAgICAgICAgICAgICAgIHJldHVybiBjYl9hZGRPYmplY3QgQCBudWxsLCB7IG9pZCwgYm9keSwgY29udGVudCB9XG5cbiAgICAgICAgICAgICAgZXJyID0+IGNiX2FkZE9iamVjdChlcnIpXG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oX2VuY29kZVF1ZXVlKVxuXG4gIGZ1bmN0aW9uIF9qc29uX3JlcGxhY2VyKGtleSwgZHN0VmFsdWUpIDo6XG4gICAgLy8gc3JjVmFsdWUgIT09IGRzdFZhbHVlIGZvciBvYmplY3RzIHdpdGggLnRvSlNPTigpIG1ldGhvZHNcbiAgICBjb25zdCBzcmNWYWx1ZSA9IHRoaXNba2V5XVxuXG4gICAgaWYgZHN0VmFsdWUgPT09IG51bGwgfHwgJ29iamVjdCcgIT09IHR5cGVvZiBzcmNWYWx1ZSA6OlxuICAgICAgcmV0dXJuIGRzdFZhbHVlXG5cbiAgICBjb25zdCBwcmV2ID0gbG9va3VwLmdldChzcmNWYWx1ZSlcbiAgICBpZiB1bmRlZmluZWQgIT09IHByZXYgOjpcbiAgICAgIHJldHVybiBwcmV2IC8vIGFscmVhZHkgc2VyaWFsaXplZCAtLSByZWZlcmVuY2UgZXhpc3RpbmcgaXRlbVxuXG4gICAgbGV0IHByZXNlcnZlciA9IGZpbmRQcmVzZXJ2ZXIoc3JjVmFsdWUpXG4gICAgaWYgdW5kZWZpbmVkID09PSBwcmVzZXJ2ZXIgOjpcbiAgICAgIC8vIG5vdCBhIFwic3BlY2lhbFwiIHByZXNlcnZlZCBpdGVtXG4gICAgICBpZiBhbk9iamVjdCAhPT0gc3JjVmFsdWUgOjpcbiAgICAgICAgcmV0dXJuIGRzdFZhbHVlIC8vIHNvIHNlcmlhbGl6ZSBub3JtYWxseVxuICAgICAgLy8gYnV0IGl0IGlzIHRoZSByb290LCBzbyBzdG9yZSBhdCBvaWQgMFxuICAgICAgcHJlc2VydmVyID0gbG9va3VwUHJlc2VydmVyIEBcbiAgICAgICAgQXJyYXkuaXNBcnJheShkc3RWYWx1ZSkgPyByb290X2xpc3QgOiByb290X29ialxuXG4gICAgLy8gcmVnaXN0ZXIgaWQgZm9yIG9iamVjdCBhbmQgcmV0dXJuIGEgSlNPTiBzZXJpYWxpemFibGUgdmVyc2lvblxuICAgIGNvbnN0IG9pZCA9IGxvb2t1cC5zaXplXG4gICAgY29uc3QgcmVmID0ge1t0b2tlbl06IG9pZH1cbiAgICBsb29rdXAuc2V0KHNyY1ZhbHVlLCByZWYpXG5cbiAgICAvLyB0cmFuc2Zvcm0gbGl2ZSBvYmplY3QgaW50byBwcmVzZXJ2ZWQgZm9ybVxuICAgIGNvbnN0IGJvZHkgPSB7W3Rva2VuXTogW3ByZXNlcnZlci5raW5kLCBvaWRdfVxuICAgIGNvbnN0IHByb21pc2UgPSBQcm9taXNlXG4gICAgICAucmVzb2x2ZSBAXG4gICAgICAgIHByZXNlcnZlci5wcmVzZXJ2ZVxuICAgICAgICAgID8gcHJlc2VydmVyLnByZXNlcnZlKGRzdFZhbHVlLCBzcmNWYWx1ZSwgY3R4KVxuICAgICAgICAgIDogZHN0VmFsdWVcbiAgICAgIC50aGVuIEAgYXR0cnMgPT4gT2JqZWN0LmFzc2lnbihib2R5LCBhdHRycylcblxuICAgIHByb21pc2Uub2lkID0gb2lkXG4gICAgcXVldWUucHVzaCBAIHByb21pc2VcbiAgICByZXR1cm4gcmVmXG5cbiIsImltcG9ydCB7ZGVjb2RlT2JqZWN0VHJlZSwgT2JqTWFwfSBmcm9tICcuL2RlY29kZSdcbmltcG9ydCB7ZW5jb2RlT2JqZWN0VHJlZSwgcm9vdF9vYmosIHJvb3RfbGlzdH0gZnJvbSAnLi9lbmNvZGUnXG5cbmV4cG9ydCBjbGFzcyBSZXZpdGFsaXphdGlvbiBleHRlbmRzIEZ1bmN0aW9uIDo6XG4gIGNvbnN0cnVjdG9yKCkgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1VzZSB0aGUgc3RhdGljIC5jcmVhdGUoKSBpbnN0ZWFkIG9mIG5ldycpXG5cbiAgc3RhdGljIGNyZWF0ZSh0b2tlbl9wKSA6OlxuICAgIHJlZ2lzdGVyLnRva2VuID0gdG9rZW5fcCB8fCAnXFx1MDM5RScgLy8gJ86eJ1xuXG4gICAgY29uc3QgbHV0UmV2aXZlPW5ldyBNYXAoKVxuICAgIGNvbnN0IGx1dFByZXNlcnZlPW5ldyBPYmpNYXAoKVxuXG4gICAgY29uc3Qgc2VsZiA9IE9iamVjdC5zZXRQcm90b3R5cGVPZihyZWdpc3RlciwgdGhpcy5wcm90b3R5cGUpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBzZWxmLCBAe31cbiAgICAgIGxvb2t1cFJldml2ZXI6IEB7fSB2YWx1ZTogbHV0UmV2aXZlLmdldC5iaW5kKGx1dFJldml2ZSlcbiAgICAgIGxvb2t1cFByZXNlcnZlcjogQHt9IHZhbHVlOiBsdXRQcmVzZXJ2ZS5nZXQuYmluZChsdXRQcmVzZXJ2ZSlcbiAgICAgIF9zZXRSZXZpdmVyOiBAe30gdmFsdWU6IF9zZXRSZXZpdmVyXG5cblxuICAgIHNlbGYuaW5pdFJlZ2lzdGVyeShyb290X29iaiwgcm9vdF9saXN0KVxuICAgIHJldHVybiBzZWxmXG5cbiAgICBmdW5jdGlvbiByZWdpc3RlcigpIDo6XG4gICAgICByZXR1cm4gc2VsZi5yZWdpc3Rlci5hcHBseShzZWxmLCBhcmd1bWVudHMpXG5cbiAgICBmdW5jdGlvbiBfc2V0UmV2aXZlcihyZXZpdmVyLCBraW5kcywgbWF0Y2hlcnMpIDo6XG4gICAgICBsdXRSZXZpdmUuc2V0KHJldml2ZXIua2luZCwgcmV2aXZlcilcbiAgICAgIHJldHVybiBAOlxuICAgICAgICBhbGlhcyguLi5raW5kcykgOjpcbiAgICAgICAgICBmb3IgY29uc3QgZWFjaCBvZiBraW5kcyA6OlxuICAgICAgICAgICAgaWYgZWFjaCA6OiBsdXRSZXZpdmUuc2V0KGVhY2gsIHJldml2ZXIpXG4gICAgICAgICAgcmV0dXJuIHRoaXNcbiAgICAgICAgbWF0Y2goLi4ubWF0Y2hlcnMpIDo6XG4gICAgICAgICAgZm9yIGNvbnN0IGVhY2ggb2YgbWF0Y2hlcnMgOjpcbiAgICAgICAgICAgIGlmIG51bGwgIT0gZWFjaCA6OiBsdXRQcmVzZXJ2ZS5zZXQoZWFjaCwgcmV2aXZlcilcbiAgICAgICAgICByZXR1cm4gdGhpc1xuXG5cbiAgaW5pdFJlZ2lzdGVyeShyb290X29iaiwgcm9vdF9saXN0KSA6OlxuICAgIHRoaXNcbiAgICAgIC5yZWdpc3RlciBAOiBraW5kOiAne3Jvb3R9J1xuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjogT2JqZWN0LmFzc2lnbihvYmosIGVudHJ5LmJvZHkpXG4gICAgICAubWF0Y2ggQCByb290X29ialxuXG4gICAgdGhpc1xuICAgICAgLnJlZ2lzdGVyIEA6IGtpbmQ6ICdbcm9vdF0nXG4gICAgICAgIHByZXNlcnZlKHJvb3RMaXN0KSA6OiByZXR1cm4gQHt9IF86IHJvb3RMaXN0LnNsaWNlKClcbiAgICAgICAgaW5pdChlbnRyeSkgOjogcmV0dXJuIFtdXG4gICAgICAgIHJldml2ZShyb290TGlzdCwgZW50cnkpIDo6XG4gICAgICAgICAgcm9vdExpc3QucHVzaC5hcHBseShyb290TGlzdCwgZW50cnkuYm9keS5fKVxuICAgICAgLm1hdGNoIEAgcm9vdF9saXN0XG5cbiAgcmVnaXN0ZXIocmV2aXRhbGl6ZXIpIDo6XG4gICAgaWYgJ2tpbmQnIGluIHJldml0YWxpemVyICYmIHJldml0YWxpemVyLnJldml2ZSA6OlxuICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJSZXZpdmVyKHJldml0YWxpemVyKVxuXG4gICAgbGV0IHRndFxuICAgIGlmIHVuZGVmaW5lZCAhPT0gcmV2aXRhbGl6ZXIucHJvdG90eXBlIDo6XG4gICAgICB0Z3QgPSByZXZpdGFsaXplci5wcm90b3R5cGVbdGhpcy50b2tlbl1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdGd0IDo6XG4gICAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgICB0Z3QgPSB0Z3QuY2FsbChyZXZpdGFsaXplci5wcm90b3R5cGUsIHRoaXMpXG4gICAgICAgICAgaWYgbnVsbCA9PSB0Z3QgOjogcmV0dXJuXG4gICAgICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVnaXN0ZXJDbGFzcyh0Z3QsIHJldml0YWxpemVyKVxuXG4gICAgdGd0ID0gcmV2aXRhbGl6ZXJbdGhpcy50b2tlbl1cbiAgICBpZiB1bmRlZmluZWQgIT09IHRndCA6OlxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICB0Z3QgPSB0Z3QuY2FsbChyZXZpdGFsaXplciwgdGhpcylcbiAgICAgICAgaWYgbnVsbCA9PSB0Z3QgOjogcmV0dXJuXG4gICAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICByZXR1cm4gdGhpcy5yZWdpc3RlclByb3RvKHRndCwgcmV2aXRhbGl6ZXIucHJvdG90eXBlIHx8IHJldml0YWxpemVyKVxuICAgICAgICAgIC5tYXRjaChyZXZpdGFsaXplcilcblxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYFVucmVjb2duaXplZCByZXZpdGFsaXphdGlvbiByZWdpc3RyYXRpb25gKVxuXG4gIHJlZ2lzdGVyUmV2aXZlcihyZXZpdmVyKSA6OlxuICAgIDo6XG4gICAgICBjb25zdCBraW5kID0gcmV2aXZlci5raW5kXG4gICAgICBpZiAnc3RyaW5nJyAhPT0gdHlwZW9mIGtpbmQgJiYgdHJ1ZSAhPT0ga2luZCAmJiBmYWxzZSAhPT0ga2luZCAmJiBudWxsICE9PSBraW5kIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgXCJraW5kXCIgbXVzdCBiZSBhIHN0cmluZ2BcblxuICAgICAgaWYgcmV2aXZlci5pbml0ICYmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLmluaXQgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcImluaXRcIiBtdXN0IGJlIGEgZnVuY3Rpb24nXG5cbiAgICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLnJldml2ZSA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wicmV2aXZlXCIgbXVzdCBiZSBhIGZ1bmN0aW9uJ1xuXG4gICAgICBpZiByZXZpdmVyLnByZXNlcnZlICYmICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXZpdmVyLnByZXNlcnZlIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCAnXCJwcmVzZXJ2ZVwiIG11c3QgYmUgYSBmdW5jdGlvbiBpZiBwcm92aWRlZCdcblxuICAgIHJldHVybiB0aGlzLl9zZXRSZXZpdmVyKHJldml2ZXIpXG5cbiAgcmVnaXN0ZXJDbGFzcyhraW5kLCBrbGFzcykgOjpcbiAgICByZXR1cm4gdGhpc1xuICAgICAgLnJlZ2lzdGVyUmV2aXZlciBAOiBraW5kLFxuICAgICAgICByZXZpdmUob2JqLCBlbnRyeSkgOjpcbiAgICAgICAgICBvYmogPSBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2Yob2JqLCBrbGFzcy5wcm90b3R5cGUpXG4gICAgICAubWF0Y2goa2xhc3MsIGtsYXNzLnByb3RvdHlwZSlcblxuICByZWdpc3RlclByb3RvKGtpbmQsIHByb3RvKSA6OlxuICAgIHJldHVybiB0aGlzXG4gICAgICAucmVnaXN0ZXJSZXZpdmVyIEA6IGtpbmQsXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OlxuICAgICAgICAgIG9iaiA9IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihvYmosIHByb3RvKVxuICAgICAgLm1hdGNoKHByb3RvKVxuXG5cbiAgZGVjb2RlKGpzb25fc291cmNlLCBjdHgpIDo6XG4gICAgaWYgbnVsbCA9PT0ganNvbl9zb3VyY2UgOjpcbiAgICAgIHJldHVybiBudWxsIC8vIEpTT04ucGFyc2UobnVsbCkgcmV0dXJucyBudWxsOyBrZWVwIHdpdGggY29udmVudGlvblxuXG4gICAgY29uc3QgZXZ0cyA9IGRlY29kZU9iamVjdFRyZWUgQCB0aGlzLCBqc29uX3NvdXJjZSwgY3R4XG4gICAgcmV0dXJuIGV2dHMuZG9uZVxuXG4gIGVuY29kZShhbk9iamVjdCwgY3R4KSA6OlxuICAgIGNvbnN0IHJlZnMgPSBbXVxuICAgIGNvbnN0IHByb21pc2UgPSBlbmNvZGVPYmplY3RUcmVlIEAgdGhpcywgYW5PYmplY3QsIGN0eCwgKGVyciwgZW50cnkpID0+IDo6XG4gICAgICByZWZzW2VudHJ5Lm9pZF0gPSBlbnRyeS5jb250ZW50XG5cbiAgICBjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeSBAIGAke3RoaXMudG9rZW59cmVmc2BcbiAgICByZXR1cm4gcHJvbWlzZS50aGVuIEAgKCkgPT5cbiAgICAgIGB7JHtrZXl9OiBbXFxuICAke3JlZnMuam9pbignLFxcbiAgJyl9IF19XFxuYFxuXG4gIF9ib3VuZEZpbmRQcmVzZXJ2ZUZvck9iaigpIDo6XG4gICAgY29uc3QgbG9va3VwUHJlc2VydmVyID0gdGhpcy5sb29rdXBQcmVzZXJ2ZXJcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSA6OlxuICAgICAgbGV0IHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlcihvYmopXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHByZXNlcnZlciA6OlxuICAgICAgICByZXR1cm4gcHJlc2VydmVyXG5cbiAgICAgIHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlcihvYmouY29uc3RydWN0b3IpXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHByZXNlcnZlciA6OlxuICAgICAgICByZXR1cm4gcHJlc2VydmVyXG5cbiAgICAgIGxldCBwcm90byA9IG9ialxuICAgICAgd2hpbGUgbnVsbCAhPT0gQCBwcm90byA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihwcm90bykgOjpcbiAgICAgICAgbGV0IHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlcihwcm90bylcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgICByZXR1cm4gcHJlc2VydmVyXG5cblxuZXhwb3J0IGNsYXNzIFJldml2ZXJOb3RGb3VuZCBleHRlbmRzIEVycm9yIDo6XG5cbiIsImltcG9ydCB7UmV2aXRhbGl6YXRpb259IGZyb20gJy4vcmV2aXRhbGl6YXRpb24nXG5cbmNvbnN0IGNyZWF0ZVJlZ2lzdHJ5ID0gUmV2aXRhbGl6YXRpb24uY3JlYXRlLmJpbmQoUmV2aXRhbGl6YXRpb24pXG5cbmV4cG9ydCAqIGZyb20gJy4vcmV2aXRhbGl6YXRpb24nXG5leHBvcnQgZGVmYXVsdCBjcmVhdGVSZWdpc3RyeSgpXG5leHBvcnQgQHt9XG4gIGNyZWF0ZVJlZ2lzdHJ5XG4gIGNyZWF0ZVJlZ2lzdHJ5IGFzIGNyZWF0ZVxuXG4iXSwibmFtZXMiOlsiT2JqTWFwIiwiV2Vha01hcCIsIk1hcCIsImRlY29kZU9iamVjdFRyZWUiLCJyZXZpdmVyIiwianNvbl9zb3VyY2UiLCJjdHgiLCJ0b2tlbiIsImxvb2t1cFJldml2ZXIiLCJxdWV1ZSIsImJ5T2lkIiwiZXZ0cyIsIl9zdGFydCIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsInJldmVyc2UiLCJtYXAiLCJlbnRyeSIsInJldml2ZSIsIm9iaiIsInN0YXJ0ZWQiLCJsc3QiLCJsZW5ndGgiLCJmaW5pc2hlZCIsImFsbCIsImRvbmUiLCJyb290IiwiZ2V0IiwicHJvbWlzZSIsInVuZGVmaW5lZCIsImFucyIsInJvb3Rfb2JqIiwiT2JqZWN0IiwiZnJlZXplIiwicm9vdF9saXN0IiwiZW5jb2RlT2JqZWN0VHJlZSIsImFuT2JqZWN0IiwiY2JfYWRkT2JqZWN0IiwibG9va3VwUHJlc2VydmVyIiwiZmluZFByZXNlcnZlciIsIl9ib3VuZEZpbmRQcmVzZXJ2ZUZvck9iaiIsImxvb2t1cCIsIl9lbmNvZGVRdWV1ZSIsInByb21pc2VzIiwidGlwIiwic2hpZnQiLCJvaWQiLCJwdXNoIiwiYm9keSIsImNvbnRlbnQiLCJKU09OIiwic3RyaW5naWZ5IiwiX2pzb25fcmVwbGFjZXIiLCJlcnIiLCJrZXkiLCJkc3RWYWx1ZSIsInNyY1ZhbHVlIiwicHJldiIsInByZXNlcnZlciIsIkFycmF5IiwiaXNBcnJheSIsInNpemUiLCJyZWYiLCJzZXQiLCJraW5kIiwicHJlc2VydmUiLCJhdHRycyIsImFzc2lnbiIsIlJldml0YWxpemF0aW9uIiwiRnVuY3Rpb24iLCJFcnJvciIsImNyZWF0ZSIsInRva2VuX3AiLCJsdXRSZXZpdmUiLCJsdXRQcmVzZXJ2ZSIsInNlbGYiLCJzZXRQcm90b3R5cGVPZiIsInJlZ2lzdGVyIiwicHJvdG90eXBlIiwiZGVmaW5lUHJvcGVydGllcyIsInZhbHVlIiwiYmluZCIsIl9zZXRSZXZpdmVyIiwiaW5pdFJlZ2lzdGVyeSIsImFwcGx5IiwiYXJndW1lbnRzIiwia2luZHMiLCJtYXRjaGVycyIsImVhY2giLCJtYXRjaCIsInJvb3RMaXN0IiwiXyIsInNsaWNlIiwicmV2aXRhbGl6ZXIiLCJyZWdpc3RlclJldml2ZXIiLCJ0Z3QiLCJjYWxsIiwicmVnaXN0ZXJDbGFzcyIsInJlZ2lzdGVyUHJvdG8iLCJUeXBlRXJyb3IiLCJpbml0Iiwia2xhc3MiLCJwcm90byIsInJlZnMiLCJqb2luIiwiY29uc3RydWN0b3IiLCJnZXRQcm90b3R5cGVPZiIsIlJldml2ZXJOb3RGb3VuZCIsImNyZWF0ZVJlZ2lzdHJ5Il0sIm1hcHBpbmdzIjoiQUFBTyxNQUFNQSxTQUFTLGdCQUFnQixPQUFPQyxPQUF2QixHQUFpQ0EsT0FBakMsR0FBMkNDLEdBQTFEOztBQUVQLEFBQU8sU0FBU0MsZ0JBQVQsQ0FBMEJDLE9BQTFCLEVBQW1DQyxXQUFuQyxFQUFnREMsR0FBaEQsRUFBcUQ7TUFDdkQsU0FBU0QsV0FBWixFQUEwQjtXQUNqQixJQUFQLENBRHdCO0dBRzFCLE1BQU1FLFFBQU1ILFFBQVFHLEtBQXBCO1FBQ01DLGdCQUFjSixRQUFRSSxhQUE1Qjs7UUFFTUMsUUFBTSxFQUFaO1FBQWdCQyxRQUFNLElBQUlSLEdBQUosRUFBdEI7UUFNTVMsT0FBTyxFQUFiO1FBQ01DLFNBQVNDLFFBQVFDLE9BQVIsR0FBa0JDLElBQWxCLENBQXlCLE1BQ3RDTixNQUFNTyxPQUFOLEdBQWdCQyxHQUFoQixDQUFzQkMsU0FBUztVQUN2QlAsSUFBTixHQUFhQSxJQUFiO1dBQ09PLE1BQU1kLE9BQU4sQ0FBY2UsTUFBZCxDQUFxQkQsTUFBTUUsR0FBM0IsRUFBZ0NGLEtBQWhDLEVBQXVDWixHQUF2QyxDQUFQO0dBRkYsQ0FEYSxDQUFmOztPQUtLZSxPQUFMLEdBQWVULE9BQU9HLElBQVAsQ0FBY08sT0FBT0EsSUFBSUMsTUFBekIsQ0FBZjtPQUNLQyxRQUFMLEdBQWdCWixPQUFPRyxJQUFQLENBQWNPLE9BQzVCVCxRQUFRWSxHQUFSLENBQVlILEdBQVosRUFBaUJQLElBQWpCLENBQXdCTyxPQUFPQSxJQUFJQyxNQUFuQyxDQURjLENBQWhCOztPQUdLRyxJQUFMLEdBQVlmLEtBQUthLFFBQUwsQ0FBY1QsSUFBZCxDQUFxQixNQUFNO1VBQy9CWSxPQUFPakIsTUFBTWtCLEdBQU4sQ0FBVSxDQUFWLENBQWI7UUFDRyxRQUFRRCxJQUFYLEVBQWtCOzs7O1VBRVosRUFBQ1AsR0FBRCxFQUFNUyxP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
