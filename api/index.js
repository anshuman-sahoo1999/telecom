const app = require('../backend/index.js');

module.exports = (req, res) => {
  return app(req, res);
};
