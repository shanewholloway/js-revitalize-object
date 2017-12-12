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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvZGVjb2RlLmpzIiwiLi4vY29kZS9lbmNvZGUuanMiLCIuLi9jb2RlL3Jldml0YWxpemF0aW9uLmpzIiwiLi4vY29kZS9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY29uc3QgT2JqTWFwID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBXZWFrTWFwID8gV2Vha01hcCA6IE1hcFxuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlT2JqZWN0VHJlZShyZXZpdGFsaXplciwganNvbl9zb3VyY2UsIGN0eCkgOjpcbiAgaWYgbnVsbCA9PT0ganNvbl9zb3VyY2UgOjpcbiAgICByZXR1cm4gbnVsbCAvLyBKU09OLnBhcnNlKG51bGwpIHJldHVybnMgbnVsbDsga2VlcCB3aXRoIGNvbnZlbnRpb25cblxuICBjb25zdCB0b2tlbj1yZXZpdGFsaXplci50b2tlblxuICBjb25zdCBsb29rdXBSZXZpdmVyPXJldml0YWxpemVyLmxvb2t1cFJldml2ZXJcblxuICBjb25zdCBxdWV1ZT1bXSwgYnlPaWQ9bmV3IE1hcCgpLCB2PVtdXG4gIHZbMF0gPSBKU09OLnBhcnNlKGpzb25fc291cmNlLCBfanNvbl9jcmVhdGUpXG5cbiAgY29uc3QgcmVmcz1uZXcgT2JqTWFwKClcbiAgdlsxXSA9IEpTT04ucGFyc2UoanNvbl9zb3VyY2UsIF9qc29uX3Jlc3RvcmUpXG5cbiAgY29uc3QgX2ZpbmlzaCA9IFtdLCBvbl9maW5pc2ggPSBmbiA9PiA6OiBfZmluaXNoLnB1c2ggQCMgZm4sIHRoaXNcbiAgY29uc3QgX3N0YXJ0ID0gcXVldWUucmV2ZXJzZSgpLm1hcCBAIGVudHJ5ID0+IDo6XG4gICAgZW50cnkub25fZmluaXNoID0gb25fZmluaXNoXG4gICAgcmV0dXJuIGVudHJ5LnJldml2ZXIucmV2aXZlKGVudHJ5Lm9iaiwgZW50cnksIGN0eClcblxuICBmb3IgY29uc3QgW2ZuLCBlbnRyeV0gb2YgX2ZpbmlzaCA6OlxuICAgIGZuKGVudHJ5LCBjdHgpXG5cbiAgY29uc3Qgcm9vdCA9IGJ5T2lkLmdldCgwKVxuICByZXR1cm4gbnVsbCAhPSByb290ID8gcm9vdC5vYmogOiBudWxsXG5cblxuICBmdW5jdGlvbiBfanNvbl9jcmVhdGUoa2V5LCB2YWx1ZSkgOjpcbiAgICBpZiB0b2tlbiA9PT0ga2V5IDo6XG4gICAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICBlbHNlIGlmIEFycmF5LmlzQXJyYXkodmFsdWUpIDo6XG4gICAgICAgIGRlbGV0ZSB0aGlzW3Rva2VuXVxuXG4gICAgICAgIGNvbnN0IFtraW5kLCBvaWRdID0gdmFsdWVcbiAgICAgICAgY29uc3QgcmV2aXZlciA9IGxvb2t1cFJldml2ZXIoa2luZClcbiAgICAgICAgaWYgdW5kZWZpbmVkID09PSByZXZpdmVyIDo6XG4gICAgICAgICAgdGhyb3cgbmV3IFJldml2ZXJOb3RGb3VuZChgTWlzc2luZyByZWdpc3RlcmVkIHJldml2ZXIgZm9yIGtpbmQgXCIke2tpbmR9XCJgKVxuXG4gICAgICAgIGNvbnN0IGVudHJ5ID0gQDoga2luZCwgb2lkLCByZXZpdmVyLCBib2R5OiB0aGlzXG5cbiAgICAgICAgZW50cnkub2JqID0gcmV2aXZlci5pbml0XG4gICAgICAgICAgPyByZXZpdmVyLmluaXQoZW50cnksIGN0eClcbiAgICAgICAgICA6IE9iamVjdC5jcmVhdGUobnVsbClcblxuICAgICAgICBieU9pZC5zZXQob2lkLCBlbnRyeSlcbiAgICAgICAgcXVldWUucHVzaChlbnRyeSlcbiAgICAgIHJldHVyblxuXG4gICAgcmV0dXJuIHZhbHVlXG5cblxuICBmdW5jdGlvbiBfanNvbl9yZXN0b3JlKGtleSwgdmFsdWUpIDo6XG4gICAgaWYgdG9rZW4gPT09IGtleSA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICByZWZzLnNldCBAIHRoaXMsIGJ5T2lkLmdldCh2YWx1ZSkub2JqXG5cbiAgICAgIGVsc2UgaWYgQXJyYXkuaXNBcnJheSh2YWx1ZSkgOjpcbiAgICAgICAgY29uc3QgZW50cnkgPSBieU9pZC5nZXQodmFsdWVbMV0pXG4gICAgICAgIGVudHJ5LmJvZHkgPSB0aGlzXG4gICAgICAgIHJlZnMuc2V0IEAgdGhpcywgZW50cnkub2JqXG4gICAgICByZXR1cm5cblxuICAgIGVsc2UgaWYgbnVsbCA9PT0gdmFsdWUgfHwgJ29iamVjdCcgIT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICBjb25zdCBhbnMgPSByZWZzLmdldCh2YWx1ZSlcbiAgICByZXR1cm4gYW5zICE9PSB1bmRlZmluZWQgPyBhbnMgOiB2YWx1ZVxuXG4iLCJleHBvcnQgY29uc3Qgcm9vdF9vYmogPSBPYmplY3QuZnJlZXplIEAge31cbmV4cG9ydCBjb25zdCByb290X2xpc3QgPSBPYmplY3QuZnJlZXplIEAgW11cblxuZXhwb3J0IGZ1bmN0aW9uIGVuY29kZU9iamVjdFRyZWUocmV2aXRhbGl6ZXIsIGFuT2JqZWN0LCBjdHgsIGNiX2FkZE9iamVjdCkgOjpcbiAgY29uc3QgdG9rZW49cmV2aXRhbGl6ZXIudG9rZW5cbiAgY29uc3QgbG9va3VwUHJlc2VydmVyPXJldml0YWxpemVyLmxvb2t1cFByZXNlcnZlclxuICBjb25zdCBmaW5kUHJlc2VydmVyPXJldml0YWxpemVyLl9ib3VuZEZpbmRQcmVzZXJ2ZUZvck9iaigpXG5cbiAgY29uc3QgcXVldWU9W10sIGxvb2t1cD1uZXcgTWFwKCksIHY9W11cbiAgdlswXSA9IEpTT04uc3RyaW5naWZ5KGFuT2JqZWN0LCBfanNvbl9yZXBsYWNlcilcblxuICB3aGlsZSAwICE9PSBxdWV1ZS5sZW5ndGggOjpcbiAgICBjb25zdCBzYXZlID0gcXVldWUuc2hpZnQoKSwge29pZH0gPSBzYXZlXG4gICAgbGV0IGJvZHksIGNvbnRlbnRcbiAgICB0cnkgOjpcbiAgICAgIGJvZHkgPSBzYXZlKGN0eClcbiAgICAgIGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShib2R5LCBfanNvbl9yZXBsYWNlcilcbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGNiX2FkZE9iamVjdCBAIGVyciwgeyBvaWQsIGJvZHkgfVxuICAgICAgY29udGludWVcbiAgICBjYl9hZGRPYmplY3QgQCBudWxsLCB7IG9pZCwgYm9keSwgY29udGVudCB9XG5cblxuICBmdW5jdGlvbiBfanNvbl9yZXBsYWNlcihrZXksIGRzdFZhbHVlKSA6OlxuICAgIC8vIHNyY1ZhbHVlICE9PSBkc3RWYWx1ZSBmb3Igb2JqZWN0cyB3aXRoIC50b0pTT04oKSBtZXRob2RzXG4gICAgY29uc3Qgc3JjVmFsdWUgPSB0aGlzW2tleV1cblxuICAgIGlmIGRzdFZhbHVlID09PSBudWxsIHx8ICdvYmplY3QnICE9PSB0eXBlb2Ygc3JjVmFsdWUgOjpcbiAgICAgIHJldHVybiBkc3RWYWx1ZVxuXG4gICAgY29uc3QgcHJldiA9IGxvb2t1cC5nZXQoc3JjVmFsdWUpXG4gICAgaWYgdW5kZWZpbmVkICE9PSBwcmV2IDo6XG4gICAgICByZXR1cm4gcHJldiAvLyBhbHJlYWR5IHNlcmlhbGl6ZWQgLS0gcmVmZXJlbmNlIGV4aXN0aW5nIGl0ZW1cblxuICAgIGxldCBwcmVzZXJ2ZXIgPSBmaW5kUHJlc2VydmVyKHNyY1ZhbHVlKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gcHJlc2VydmVyIDo6XG4gICAgICAvLyBub3QgYSBcInNwZWNpYWxcIiBwcmVzZXJ2ZWQgaXRlbVxuICAgICAgaWYgYW5PYmplY3QgIT09IHNyY1ZhbHVlIDo6XG4gICAgICAgIHJldHVybiBkc3RWYWx1ZSAvLyBzbyBzZXJpYWxpemUgbm9ybWFsbHlcbiAgICAgIC8vIGJ1dCBpdCBpcyB0aGUgcm9vdCwgc28gc3RvcmUgYXQgb2lkIDBcbiAgICAgIHByZXNlcnZlciA9IGxvb2t1cFByZXNlcnZlciBAXG4gICAgICAgIEFycmF5LmlzQXJyYXkoZHN0VmFsdWUpID8gcm9vdF9saXN0IDogcm9vdF9vYmpcblxuICAgIC8vIHJlZ2lzdGVyIGlkIGZvciBvYmplY3QgYW5kIHJldHVybiBhIEpTT04gc2VyaWFsaXphYmxlIHZlcnNpb25cbiAgICBjb25zdCBvaWQgPSBsb29rdXAuc2l6ZVxuICAgIGNvbnN0IHJlZiA9IHtbdG9rZW5dOiBvaWR9XG4gICAgbG9va3VwLnNldChzcmNWYWx1ZSwgcmVmKVxuXG4gICAgLy8gdHJhbnNmb3JtIGxpdmUgb2JqZWN0IGludG8gcHJlc2VydmVkIGZvcm1cbiAgICBjb25zdCBzYXZlID0gY3R4ID0+IDo6XG4gICAgICBjb25zdCBib2R5ID0ge1t0b2tlbl06IFtwcmVzZXJ2ZXIua2luZCwgb2lkXX1cbiAgICAgIGlmIHByZXNlcnZlci5wcmVzZXJ2ZSA6OlxuICAgICAgICBjb25zdCBhdHRycyA9IHByZXNlcnZlci5wcmVzZXJ2ZShkc3RWYWx1ZSwgc3JjVmFsdWUsIGN0eClcbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oYm9keSwgYXR0cnMpXG4gICAgICBlbHNlIHJldHVybiBPYmplY3QuYXNzaWduKGJvZHksIGRzdFZhbHVlKVxuXG4gICAgc2F2ZS5vaWQgPSBvaWRcbiAgICBxdWV1ZS5wdXNoIEAgc2F2ZVxuICAgIHJldHVybiByZWZcblxuIiwiaW1wb3J0IHtkZWNvZGVPYmplY3RUcmVlLCBPYmpNYXB9IGZyb20gJy4vZGVjb2RlJ1xuaW1wb3J0IHtlbmNvZGVPYmplY3RUcmVlLCByb290X29iaiwgcm9vdF9saXN0fSBmcm9tICcuL2VuY29kZSdcblxuZXhwb3J0IGNsYXNzIFJldml0YWxpemF0aW9uIGV4dGVuZHMgRnVuY3Rpb24gOjpcbiAgY29uc3RydWN0b3IoKSA6OlxuICAgIHRocm93IG5ldyBFcnJvcignVXNlIHRoZSBzdGF0aWMgLmNyZWF0ZSgpIGluc3RlYWQgb2YgbmV3JylcblxuICBzdGF0aWMgY3JlYXRlKHRva2VuX3ApIDo6XG4gICAgcmVnaXN0ZXIudG9rZW4gPSB0b2tlbl9wIHx8ICdcXHUwMzlFJyAvLyAnzp4nXG5cbiAgICBjb25zdCBsdXRSZXZpdmU9bmV3IE1hcCgpXG4gICAgY29uc3QgbHV0UHJlc2VydmU9bmV3IE9iak1hcCgpXG5cbiAgICBjb25zdCBzZWxmID0gT2JqZWN0LnNldFByb3RvdHlwZU9mKHJlZ2lzdGVyLCB0aGlzLnByb3RvdHlwZSlcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHNlbGYsIEB7fVxuICAgICAgbG9va3VwUmV2aXZlcjogQHt9IHZhbHVlOiBsdXRSZXZpdmUuZ2V0LmJpbmQobHV0UmV2aXZlKVxuICAgICAgbG9va3VwUHJlc2VydmVyOiBAe30gdmFsdWU6IGx1dFByZXNlcnZlLmdldC5iaW5kKGx1dFByZXNlcnZlKVxuICAgICAgX3NldFJldml2ZXI6IEB7fSB2YWx1ZTogX3NldFJldml2ZXJcblxuXG4gICAgc2VsZi5pbml0UmVnaXN0ZXJ5KHJvb3Rfb2JqLCByb290X2xpc3QpXG4gICAgcmV0dXJuIHNlbGZcblxuICAgIGZ1bmN0aW9uIHJlZ2lzdGVyKCkgOjpcbiAgICAgIHJldHVybiBzZWxmLnJlZ2lzdGVyLmFwcGx5KHNlbGYsIGFyZ3VtZW50cylcblxuICAgIGZ1bmN0aW9uIF9zZXRSZXZpdmVyKHJldml2ZXIsIGtpbmRzLCBtYXRjaGVycykgOjpcbiAgICAgIGx1dFJldml2ZS5zZXQocmV2aXZlci5raW5kLCByZXZpdmVyKVxuICAgICAgcmV0dXJuIEA6XG4gICAgICAgIGFsaWFzKC4uLmtpbmRzKSA6OlxuICAgICAgICAgIGZvciBjb25zdCBlYWNoIG9mIGtpbmRzIDo6XG4gICAgICAgICAgICBpZiBlYWNoIDo6IGx1dFJldml2ZS5zZXQoZWFjaCwgcmV2aXZlcilcbiAgICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgICBtYXRjaCguLi5tYXRjaGVycykgOjpcbiAgICAgICAgICBmb3IgY29uc3QgZWFjaCBvZiBtYXRjaGVycyA6OlxuICAgICAgICAgICAgaWYgbnVsbCAhPSBlYWNoIDo6IGx1dFByZXNlcnZlLnNldChlYWNoLCByZXZpdmVyKVxuICAgICAgICAgIHJldHVybiB0aGlzXG5cblxuICBpbml0UmVnaXN0ZXJ5KHJvb3Rfb2JqLCByb290X2xpc3QpIDo6XG4gICAgdGhpc1xuICAgICAgLnJlZ2lzdGVyIEA6IGtpbmQ6ICd7cm9vdH0nXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OiBPYmplY3QuYXNzaWduKG9iaiwgZW50cnkuYm9keSlcbiAgICAgIC5tYXRjaCBAIHJvb3Rfb2JqXG5cbiAgICB0aGlzXG4gICAgICAucmVnaXN0ZXIgQDoga2luZDogJ1tyb290XSdcbiAgICAgICAgcHJlc2VydmUocm9vdExpc3QpIDo6IHJldHVybiBAe30gXzogcm9vdExpc3Quc2xpY2UoKVxuICAgICAgICBpbml0KGVudHJ5KSA6OiByZXR1cm4gW11cbiAgICAgICAgcmV2aXZlKHJvb3RMaXN0LCBlbnRyeSkgOjpcbiAgICAgICAgICByb290TGlzdC5wdXNoLmFwcGx5KHJvb3RMaXN0LCBlbnRyeS5ib2R5Ll8pXG4gICAgICAubWF0Y2ggQCByb290X2xpc3RcblxuICByZWdpc3RlcihyZXZpdGFsaXplcikgOjpcbiAgICBpZiAna2luZCcgaW4gcmV2aXRhbGl6ZXIgJiYgcmV2aXRhbGl6ZXIucmV2aXZlIDo6XG4gICAgICByZXR1cm4gdGhpcy5yZWdpc3RlclJldml2ZXIocmV2aXRhbGl6ZXIpXG5cbiAgICBsZXQgdGd0XG4gICAgaWYgdW5kZWZpbmVkICE9PSByZXZpdGFsaXplci5wcm90b3R5cGUgOjpcbiAgICAgIHRndCA9IHJldml0YWxpemVyLnByb3RvdHlwZVt0aGlzLnRva2VuXVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0Z3QgOjpcbiAgICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICAgIHRndCA9IHRndC5jYWxsKHJldml0YWxpemVyLnByb3RvdHlwZSwgdGhpcylcbiAgICAgICAgICBpZiBudWxsID09IHRndCA6OiByZXR1cm5cbiAgICAgICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWdpc3RlckNsYXNzKHRndCwgcmV2aXRhbGl6ZXIpXG5cbiAgICB0Z3QgPSByZXZpdGFsaXplclt0aGlzLnRva2VuXVxuICAgIGlmIHVuZGVmaW5lZCAhPT0gdGd0IDo6XG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgIHRndCA9IHRndC5jYWxsKHJldml0YWxpemVyLCB0aGlzKVxuICAgICAgICBpZiBudWxsID09IHRndCA6OiByZXR1cm5cbiAgICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgIHJldHVybiB0aGlzLnJlZ2lzdGVyUHJvdG8odGd0LCByZXZpdGFsaXplci5wcm90b3R5cGUgfHwgcmV2aXRhbGl6ZXIpXG4gICAgICAgICAgLm1hdGNoKHJldml0YWxpemVyKVxuXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgVW5yZWNvZ25pemVkIHJldml0YWxpemF0aW9uIHJlZ2lzdHJhdGlvbmApXG5cbiAgcmVnaXN0ZXJSZXZpdmVyKHJldml2ZXIpIDo6XG4gICAgOjpcbiAgICAgIGNvbnN0IGtpbmQgPSByZXZpdmVyLmtpbmRcbiAgICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Yga2luZCAmJiB0cnVlICE9PSBraW5kICYmIGZhbHNlICE9PSBraW5kICYmIG51bGwgIT09IGtpbmQgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBcImtpbmRcIiBtdXN0IGJlIGEgc3RyaW5nYFxuXG4gICAgICBpZiByZXZpdmVyLmluaXQgJiYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJldml2ZXIuaW5pdCA6OlxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgJ1wiaW5pdFwiIG11c3QgYmUgYSBmdW5jdGlvbidcblxuICAgICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJldml2ZXIucmV2aXZlIDo6XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCAnXCJyZXZpdmVcIiBtdXN0IGJlIGEgZnVuY3Rpb24nXG5cbiAgICAgIGlmIHJldml2ZXIucHJlc2VydmUgJiYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJldml2ZXIucHJlc2VydmUgOjpcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAICdcInByZXNlcnZlXCIgbXVzdCBiZSBhIGZ1bmN0aW9uIGlmIHByb3ZpZGVkJ1xuXG4gICAgcmV0dXJuIHRoaXMuX3NldFJldml2ZXIocmV2aXZlcilcblxuICByZWdpc3RlckNsYXNzKGtpbmQsIGtsYXNzKSA6OlxuICAgIHJldHVybiB0aGlzXG4gICAgICAucmVnaXN0ZXJSZXZpdmVyIEA6IGtpbmQsXG4gICAgICAgIHJldml2ZShvYmosIGVudHJ5KSA6OlxuICAgICAgICAgIG9iaiA9IE9iamVjdC5hc3NpZ24ob2JqLCBlbnRyeS5ib2R5KVxuICAgICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZihvYmosIGtsYXNzLnByb3RvdHlwZSlcbiAgICAgIC5tYXRjaChrbGFzcywga2xhc3MucHJvdG90eXBlKVxuXG4gIHJlZ2lzdGVyUHJvdG8oa2luZCwgcHJvdG8pIDo6XG4gICAgcmV0dXJuIHRoaXNcbiAgICAgIC5yZWdpc3RlclJldml2ZXIgQDoga2luZCxcbiAgICAgICAgcmV2aXZlKG9iaiwgZW50cnkpIDo6XG4gICAgICAgICAgb2JqID0gT2JqZWN0LmFzc2lnbihvYmosIGVudHJ5LmJvZHkpXG4gICAgICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKG9iaiwgcHJvdG8pXG4gICAgICAubWF0Y2gocHJvdG8pXG5cblxuICBkZWNvZGUoanNvbl9zb3VyY2UsIGN0eCkgOjpcbiAgICBpZiBudWxsID09PSBqc29uX3NvdXJjZSA6OlxuICAgICAgcmV0dXJuIG51bGwgLy8gSlNPTi5wYXJzZShudWxsKSByZXR1cm5zIG51bGw7IGtlZXAgd2l0aCBjb252ZW50aW9uXG5cbiAgICByZXR1cm4gZGVjb2RlT2JqZWN0VHJlZSBAIHRoaXMsIGpzb25fc291cmNlLCBjdHhcblxuICBlbmNvZGVUb1JlZnMoYW5PYmplY3QsIGN0eCwgcmVmcykgOjpcbiAgICBpZiBudWxsID09IHJlZnMgOjogcmVmcyA9IFtdXG4gICAgZW5jb2RlT2JqZWN0VHJlZSBAIHRoaXMsIGFuT2JqZWN0LCBjdHgsIChlcnIsIGVudHJ5KSA9PiA6OlxuICAgICAgcmVmc1tlbnRyeS5vaWRdID0gZW50cnkuY29udGVudFxuICAgIHJldHVybiByZWZzXG5cbiAgZW5jb2RlKGFuT2JqZWN0LCBjdHgsIHByZXR0eSkgOjpcbiAgICBjb25zdCByZWZzID0gdGhpcy5lbmNvZGVUb1JlZnMoYW5PYmplY3QsIGN0eClcbiAgICBjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeSBAIGAke3RoaXMudG9rZW59cmVmc2BcbiAgICByZXR1cm4gcHJldHR5XG4gICAgICA/IGB7JHtrZXl9OiBbXFxuICAke3JlZnMuam9pbignLFxcbiAgJyl9IF19XFxuYFxuICAgICAgOiBgeyR7a2V5fTpbJHtyZWZzLmpvaW4oJywnKX1dfWBcblxuICBfYm91bmRGaW5kUHJlc2VydmVGb3JPYmooKSA6OlxuICAgIGNvbnN0IGxvb2t1cFByZXNlcnZlciA9IHRoaXMubG9va3VwUHJlc2VydmVyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikgOjpcbiAgICAgIGxldCBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIob2JqKVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG4gICAgICBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIob2JqLmNvbnN0cnVjdG9yKVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBwcmVzZXJ2ZXIgOjpcbiAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG4gICAgICBsZXQgcHJvdG8gPSBvYmpcbiAgICAgIHdoaWxlIG51bGwgIT09IEAgcHJvdG8gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YocHJvdG8pIDo6XG4gICAgICAgIGxldCBwcmVzZXJ2ZXIgPSBsb29rdXBQcmVzZXJ2ZXIocHJvdG8pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcHJlc2VydmVyIDo6XG4gICAgICAgICAgcmV0dXJuIHByZXNlcnZlclxuXG5cbmV4cG9ydCBjbGFzcyBSZXZpdmVyTm90Rm91bmQgZXh0ZW5kcyBFcnJvciA6OlxuXG4iLCJpbXBvcnQge1Jldml0YWxpemF0aW9ufSBmcm9tICcuL3Jldml0YWxpemF0aW9uJ1xuXG5jb25zdCBjcmVhdGVSZWdpc3RyeSA9IFJldml0YWxpemF0aW9uLmNyZWF0ZS5iaW5kKFJldml0YWxpemF0aW9uKVxuXG5leHBvcnQgKiBmcm9tICcuL2VuY29kZSdcbmV4cG9ydCAqIGZyb20gJy4vZGVjb2RlJ1xuZXhwb3J0ICogZnJvbSAnLi9yZXZpdGFsaXphdGlvbidcbmV4cG9ydCBkZWZhdWx0IGNyZWF0ZVJlZ2lzdHJ5KClcbmV4cG9ydCBAe31cbiAgY3JlYXRlUmVnaXN0cnlcbiAgY3JlYXRlUmVnaXN0cnkgYXMgY3JlYXRlXG5cbiJdLCJuYW1lcyI6WyJPYmpNYXAiLCJXZWFrTWFwIiwiTWFwIiwiZGVjb2RlT2JqZWN0VHJlZSIsInJldml0YWxpemVyIiwianNvbl9zb3VyY2UiLCJjdHgiLCJ0b2tlbiIsImxvb2t1cFJldml2ZXIiLCJxdWV1ZSIsImJ5T2lkIiwidiIsIkpTT04iLCJwYXJzZSIsIl9qc29uX2NyZWF0ZSIsInJlZnMiLCJfanNvbl9yZXN0b3JlIiwiX2ZpbmlzaCIsIm9uX2ZpbmlzaCIsImZuIiwicHVzaCIsIl9zdGFydCIsInJldmVyc2UiLCJtYXAiLCJlbnRyeSIsInJldml2ZXIiLCJyZXZpdmUiLCJvYmoiLCJyb290IiwiZ2V0Iiwia2V5IiwidmFsdWUiLCJBcnJheSIsImlzQXJyYXkiLCJraW5kIiwib2lkIiwidW5kZWZpbmVkIiwiUmV2aXZlck5vdEZvdW5kIiwiYm9keSIsImluaXQiLCJPYmplY3QiLCJjcmVhdGUiLCJzZXQiLCJhbnMiLCJyb290X29iaiIsImZyZWV6ZSIsInJvb3RfbGlzdCIsImVuY29kZU9iamVjdFRyZWUiLCJhbk9iamVjdCIsImNiX2FkZE9iamVjdCIsImxvb2t1cFByZXNlcnZlciIsImZpbmRQcmVzZXJ2ZXIiLCJfYm91bmRGaW5kUHJlc2VydmVGb3JPYmoiLCJsb29rdXAiLCJzdHJpbmdpZnkiLCJfanNvbl9yZXBsYWNlciIsImxlbmd0aCIsInNhdmUiLCJzaGlmdCIsImNvbnRlbnQiLCJlcnIiLCJkc3RWYWx1ZSIsInNyY1ZhbHVlIiwicHJldiIsInByZXNlcnZlciIsInNpemUiLCJyZWYiLCJwcmVzZXJ2ZSIsImF0dHJzIiwiYXNzaWduIiwiUmV2aXRhbGl6YXRpb24iLCJGdW5jdGlvbiIsIkVycm9yIiwidG9rZW5fcCIsImx1dFJldml2ZSIsImx1dFByZXNlcnZlIiwic2VsZiIsInNldFByb3RvdHlwZU9mIiwicmVnaXN0ZXIiLCJwcm90b3R5cGUiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiYmluZCIsIl9zZXRSZXZpdmVyIiwiaW5pdFJlZ2lzdGVyeSIsImFwcGx5IiwiYXJndW1lbnRzIiwia2luZHMiLCJtYXRjaGVycyIsImVhY2giLCJtYXRjaCIsInJvb3RMaXN0IiwiXyIsInNsaWNlIiwicmVnaXN0ZXJSZXZpdmVyIiwidGd0IiwiY2FsbCIsInJlZ2lzdGVyQ2xhc3MiLCJyZWdpc3RlclByb3RvIiwiVHlwZUVycm9yIiwia2xhc3MiLCJwcm90byIsInByZXR0eSIsImVuY29kZVRvUmVmcyIsImpvaW4iLCJjb25zdHJ1Y3RvciIsImdldFByb3RvdHlwZU9mIiwiY3JlYXRlUmVnaXN0cnkiXSwibWFwcGluZ3MiOiI7Ozs7QUFBTyxNQUFNQSxTQUFTLGdCQUFnQixPQUFPQyxPQUF2QixHQUFpQ0EsT0FBakMsR0FBMkNDLEdBQTFEOztBQUVQLEFBQU8sU0FBU0MsZ0JBQVQsQ0FBMEJDLFdBQTFCLEVBQXVDQyxXQUF2QyxFQUFvREMsR0FBcEQsRUFBeUQ7TUFDM0QsU0FBU0QsV0FBWixFQUEwQjtXQUNqQixJQUFQLENBRHdCO0dBRzFCLE1BQU1FLFFBQU1ILFlBQVlHLEtBQXhCO1FBQ01DLGdCQUFjSixZQUFZSSxhQUFoQzs7UUFFTUMsUUFBTSxFQUFaO1FBQWdCQyxRQUFNLElBQUlS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
