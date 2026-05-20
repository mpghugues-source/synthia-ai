'use strict';

require('dotenv').config({ path: __dirname + '/.env.local' });

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev      = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '127.0.0.1';
const port     = parseInt(process.env.PORT || '3000', 10);

const app    = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('[Synthia] Error handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  })
    .once('error', (err) => { console.error(err); process.exit(1); })
    .listen(port, hostname, () => {
      console.log(`\n> Synthia AI  •  http://${hostname}:${port}`);
      console.log(`> Mode: ${dev ? 'development' : 'production'}\n`);
    });
});
