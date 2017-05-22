const Datastore = require('@google-cloud/datastore');

const config = require('../config');

const DatastoreBackend = require('./backend').DatastoreBackend;

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

    return new type(data);
  }

  list(type) {
    const query = this.datastore.createQuery(type.name);
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

  store(object) {
    let key;
    if (typeof object._meta === 'undefined') {
      key = this.datastore.key([object.constructor.name, object.id()]);
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

module.exports = GoogleDatastore;
