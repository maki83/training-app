const http = require('http');
const { app } = require('./app');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

if (require.main === module) {
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = { server };
