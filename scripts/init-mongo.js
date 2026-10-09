/* global rs, db, quit, sleep */
// A single-node replica set gives local allocation transactions the same guarantees as production.
// Keep the existing volume and accounts. directConnection supports a custom host port too.
try {
  rs.status();
} catch (error) {
  if (error.code !== 94) throw error;
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] });
}
for (let attempt = 0; attempt < 60; attempt++) {
  if (db.hello().isWritablePrimary) quit(0);
  sleep(500);
}
throw new Error('MongoDB did not elect a primary.');
