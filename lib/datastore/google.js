const Datastore = require('@google-cloud/datastore');

const config = require('../config');

const { DatastoreBackend } = require('./backend');

class GoogleDatastore extends DatastoreBackend {

  constructor() {
    super();

    const cfg = config.get();
    const options = Object.assign({}, cfg.datastore.config || {});

    this.datastore = Datastore(options);
  }

  init() {

  }

  _deserialize(type, entity) {
    const data = Object.assign({}, entity, {
      _meta: { key: entity[this.datastore.KEY] }
    });

    if (typeof type.load === 'function') {
      return type.load(data);
    } else {
      return new type(data);
    }
  }

  list(type, filters = []) {
    let query = this.datastore.createQuery(type.name);
    for (let filter of filters) {
      query = query.filter(filter.f, filter.op, filter.val);
    }

    return this.datastore
        .runQuery(query)
        .then(ents => {
          return ents[0].map(ent => this._deserialize(type, ent));
        });
  }

  get(type, id) {
    return this.datastore
        .get([type.name, id])
        .then(ent => new type(ent));
  }

  store(object, settle = true) {
    if (settle && typeof object.settle === 'function') {
      return object.settle().then(o => this.store(o, false));
    }

    let key;
    if (typeof object._meta === 'undefined') {
      const id = object.id();
      if (id !== null) {
        key = this.datastore.key([object.kind(), object.id()]);
      } else {
        key = this.datastore.key([object.kind()]);
      }
      
      object._meta = {
        key: key
      };
    } else {
      key = object._meta.key;
    }
    
    const data = object.dump();
    return this.datastore.save({ key, data });
  }

  delete(object) {
    return this.datastore.delete(object._meta.key);
  }

}

module.exports = { GoogleDatastore };
